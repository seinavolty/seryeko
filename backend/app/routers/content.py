import datetime
import hashlib
import os
import re
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urljoin, urlparse, quote, unquote
from fastapi import APIRouter, Depends, Query, HTTPException, Response, Request
from fastapi.responses import FileResponse, JSONResponse
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field
import httpx
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.services.provider import aggregator
from app.services.auth import get_current_user, require_current_user
from app.models.schema import User, WatchProgress, VideoReport, CachedEpisode, CachedDrama, EpisodeLike
from app.services import content_store, settings_store
from app.services.episode_sources import unwrap_decrypt_proxy_url, EpisodeFetcher
from jose import JWTError, jwt
from app.config import settings
import asyncio
import time

router = APIRouter(prefix="/api/content", tags=["content"])

_URI_ATTR_RE = re.compile(r'URI="([^"]+)"')
_VIGLOO_EP_PATH_RE = re.compile(r"/e(\d+)/", re.IGNORECASE)
# Fresh CloudFront cookies keyed by Vigloo media directory (survives expired query params)
_vigloo_cookie_vault: dict[str, dict] = {}
_vigloo_refresh_locks: dict[str, asyncio.Lock] = {}
_default_drm_cache = (
    "/data/drm_cache"
    if Path("/data").is_dir()
    else str(Path(tempfile.gettempdir()) / "seryeko_drm_cache")
)
_DRM_CACHE_DIR = Path(os.getenv("DRM_CACHE_DIR", _default_drm_cache))
_DRM_CACHE_DIR.mkdir(parents=True, exist_ok=True)


def _unwrap_provider_proxy_uri(uri: str) -> str:
    """ShortsWave (and similar) wrap CDN TS URLs as /api/proxy/ts?url=<encoded>.

    Unwrap to the direct CDN URL so our hls-proxy does not nest gigantic signed URLs.
    """
    if not uri or "url=" not in uri:
        return uri
    marker = "/api/proxy/ts?"
    if marker not in uri and not uri.lstrip("/").startswith("api/proxy/ts?"):
        return uri
    # Everything after url= is the percent-encoded target (may contain encoded &)
    try:
        encoded = uri.split("url=", 1)[1]
        # Trim accidental trailing playlist attrs if any
        if encoded.startswith("http") or encoded.startswith("https%") or "%3A%2F%2F" in encoded[:20].upper():
            return unquote(encoded)
    except Exception:
        pass
    return uri


def _proxy_playlist_uri(raw_uri: str, base: str, token_q: str) -> str:
    absolute = _unwrap_provider_proxy_uri(urljoin(base, raw_uri))
    return f"/api/content/hls-proxy?url={quote(absolute, safe='')}{token_q}"


def _rewrite_hls_playlist(text: str, playlist_url: str, token_q: str) -> str:
    """Rewrite segment lines and URI= attributes (EXT-X-MAP / MEDIA / KEY) through our proxy."""
    base = playlist_url.rsplit("/", 1)[0] + "/"
    rewritten = []
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped:
            rewritten.append(line)
            continue
        if stripped.startswith("#"):
            if "URI=" in stripped:
                rewritten.append(
                    _URI_ATTR_RE.sub(
                        lambda m: f'URI="{_proxy_playlist_uri(m.group(1), base, token_q)}"',
                        stripped,
                    )
                )
            else:
                rewritten.append(line)
            continue
        absolute = _unwrap_provider_proxy_uri(urljoin(base, stripped))
        rewritten.append(f"/api/content/hls-proxy?url={quote(absolute, safe='')}{token_q}")
    return "\n".join(rewritten) + "\n"


def _cf_cookie_header(
    cf_policy: Optional[str],
    cf_signature: Optional[str],
    cf_key_pair_id: Optional[str],
) -> str:
    if not (cf_policy and cf_signature and cf_key_pair_id):
        return ""
    return (
        f"CloudFront-Policy={cf_policy}; "
        f"CloudFront-Signature={cf_signature}; "
        f"CloudFront-Key-Pair-Id={cf_key_pair_id}"
    )


def _cf_query_suffix(
    cf_policy: Optional[str],
    cf_signature: Optional[str],
    cf_key_pair_id: Optional[str],
) -> str:
    if not (cf_policy and cf_signature and cf_key_pair_id):
        return ""
    return (
        f"&cf_policy={quote(cf_policy, safe='')}"
        f"&cf_signature={quote(cf_signature, safe='')}"
        f"&cf_key_pair_id={quote(cf_key_pair_id, safe='')}"
    )

# CDN hosts that may serve HLS without browser CORS headers
_ALLOWED_STREAM_SUFFIXES = (
    "shorttv.live",
    "dramaboxdb.com",
    "goodbos.online",
    "shortmax.tv",
    "amazonaws.com",
    "mydramawave.com",
    "melolostatic.com",
    "flextv.cc",
    "shortolol.com",
    "workers.dev",
    "shortswave.com",
    "cubetv.cc",
    "cdreader.com",
    "dramahue.com",
    "dramabloom.com",
    "ibyteimg.com",
    # New providers
    "janzhoutec.com",
    "wolftv.online",
    "flareflow.tv",
    "tqshort.com",
    "b-cdn.net",
    "raptdrama.com",
    "vibeshort.live",
    "storyreel.life",
    "farsunpteltd.com",
    "farsunpteltd.net",
    "vigloo.com",
)

def _is_allowed_stream_host(hostname: Optional[str]) -> bool:
    if not hostname:
        return False
    host = hostname.lower()
    return any(host == s or host.endswith("." + s) for s in _ALLOWED_STREAM_SUFFIXES)


def _is_allowed_image_host(hostname: Optional[str]) -> bool:
    if not hostname:
        return False
    host = hostname.lower()
    return host == "api.dramabuzz.sbs" or host.endswith(".dramabuzz.sbs")


def proxy_remote_image_url(url: Optional[str]) -> Optional[str]:
    """Rewrite DramaBuzz logo URLs through our proxy (upstream sets CORP: same-origin)."""
    if not url or not isinstance(url, str):
        return url
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not _is_allowed_image_host(parsed.hostname):
        return url
    return f"/api/content/image-proxy?url={quote(url, safe='')}"


@router.get("/image-proxy")
async def image_proxy(url: str = Query(..., description="Remote image URL (DramaBuzz logos)")):
    """Proxy provider logos blocked by Cross-Origin-Resource-Policy: same-origin."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not _is_allowed_image_host(parsed.hostname):
        raise HTTPException(status_code=400, detail="Image host not allowed")

    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "SeryeKo/1.0"})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream fetch failed: {e}")

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Upstream status {resp.status_code}")

    content_type = (resp.headers.get("content-type") or "application/octet-stream").split(";")[0].strip()
    if not (
        content_type.startswith("image/")
        or "svg" in content_type
        or content_type == "application/octet-stream"
    ):
        raise HTTPException(status_code=400, detail="Not an image")

    return Response(
        content=resp.content,
        media_type=content_type or "image/png",
        headers={
            "Cache-Control": "public, max-age=86400",
            "Cross-Origin-Resource-Policy": "cross-origin",
        },
    )


@router.get("/providers")
async def list_providers():
    data = await aggregator.get_providers()
    # DramaBuzz logos send Cross-Origin-Resource-Policy: same-origin — proxy them
    for key in ("active", "platforms"):
        for p in data.get(key) or []:
            if isinstance(p, dict) and p.get("logo"):
                p["logo"] = proxy_remote_image_url(p.get("logo"))
    return data

@router.get("/trending")
async def get_trending(
    provider: str = Query("dramabox", description="Provider ID"),
    lang: str = Query("en", description="Language code (catalog titles forced to English)"),
):
    from app.services.catalog import apply_hot_badges, filter_hidden_items

    # Content titles are English-only; UI language stays separate in the frontend.
    items = apply_hot_badges(filter_hidden_items(await aggregator.get_trending(provider=provider, lang="en")))
    return {"items": items, "count": len(items)}

@router.get("/search")
async def search_content(
    q: str = Query(..., description="Search query"),
    lang: str = Query("en", description="Language code (catalog titles forced to English)"),
):
    from app.services.catalog import apply_hot_badges, filter_hidden_items

    items = apply_hot_badges(filter_hidden_items(await aggregator.search(q, lang="en")))
    return {"items": items, "count": len(items), "query": q}

@router.get("/browse")
async def browse_content(
    genre: Optional[str] = Query(None),
    country: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    provider: Optional[str] = Query(None, description="Filter by DramaBuzz provider id"),
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=50),
    lang: str = Query("en"),
):
    from app.services.catalog import apply_hot_badges, filter_hidden_items

    result = await aggregator.browse(
        genre=genre,
        country=country,
        status=status,
        provider=provider,
        page=page,
        page_size=page_size,
        lang="en",
    )
    # Defense in depth: strip admin-hidden titles even if a page cache predates the toggle
    if isinstance(result, dict) and result.get("items"):
        result = {
            **result,
            "items": apply_hot_badges(filter_hidden_items(result["items"])),
        }
    return JSONResponse(
        content=result,
        headers={"Cache-Control": "public, max-age=30, stale-while-revalidate=120"},
    )

@router.get("/detail/{drama_id}")
async def get_detail(drama_id: str, db: Session = Depends(get_db)):
    from app.services.catalog import apply_hot_badges, is_drama_hidden

    if is_drama_hidden(drama_id):
        raise HTTPException(status_code=404, detail="Drama not found")

    def _with_badges(detail: Dict[str, Any]) -> Dict[str, Any]:
        enriched = apply_hot_badges([detail])[0]
        related = detail.get("related") or []
        if related:
            enriched["related"] = apply_hot_badges(related)
        return enriched

    # 1) Local DB first
    cached = content_store.get_cached_drama(db, drama_id)
    summary = (cached.get("summary") or cached.get("synopsis") or "") if cached else ""
    tags = (cached.get("tags") or []) if cached else []
    looks_broken = (
        (summary.strip().startswith("{") and '"synopsis"' in summary)
        or any(isinstance(t, str) and t.strip().startswith("{") for t in tags)
    )
    if cached and (cached.get("cover") or "").strip() and not looks_broken:
        detail = dict(cached)
        detail["related"] = await aggregator.get_related(drama_id)
        detail["cache_hit"] = True
        # Prefetch streams in background so Play / Watch feels instant
        asyncio.create_task(_warm_episodes_bg(drama_id))
        return _with_badges(detail)

    # 2) Upstream API → persist (also refresh when cover blank / JSON fields leaked)
    detail = await aggregator.get_detail(drama_id)
    if not detail:
        if cached:
            detail = dict(cached)
            detail["related"] = await aggregator.get_related(drama_id)
            detail["cache_hit"] = True
            asyncio.create_task(_warm_episodes_bg(drama_id))
            return _with_badges(detail)
        raise HTTPException(status_code=404, detail="Drama not found")

    content_store.upsert_drama(db, detail, source="api")
    detail = {**detail, "cached": True, "cache_hit": False}
    detail["related"] = await aggregator.get_related(drama_id)
    asyncio.create_task(_warm_episodes_bg(drama_id))
    return _with_badges(detail)


async def _warm_episodes_bg(drama_id: str) -> None:
    """Best-effort episode warm so first Play does not wait on a cold upstream fan-out."""
    from app.services.episode_sources import is_demo_url

    try:
        db = SessionLocal()
        try:
            if content_store.cache_is_fresh(db, drama_id):
                return
        finally:
            db.close()

        episodes = await aggregator.get_episodes(drama_id)
        if not episodes or not any(not is_demo_url(ep.get("video_url")) for ep in episodes):
            return

        detail = None
        try:
            detail = await aggregator.get_detail(drama_id)
        except Exception:
            detail = None

        db = SessionLocal()
        try:
            content_store.upsert_episodes(
                db, drama_id, episodes, drama_meta=detail, source="api"
            )
            db.commit()
        finally:
            db.close()
    except Exception as e:
        print(f"Episode warm failed for {drama_id}: {e}")


@router.get("/episodes/{drama_id}")
async def get_episodes(
    drama_id: str,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
    refresh: bool = Query(False, description="Force refresh from upstream API"),
):
    from app.services.catalog import is_drama_hidden
    from app.services.episode_sources import is_demo_url

    if is_drama_hidden(drama_id):
        raise HTTPException(status_code=404, detail="Drama not found")

    cache_hit = False
    stale_served = False
    episodes = None
    drama_meta = content_store.get_cached_drama(db, drama_id)

    if not refresh and content_store.cache_is_fresh(db, drama_id):
        episodes = content_store.get_playable_cached_episodes(db, drama_id)
        cache_hit = bool(episodes)
    elif not refresh:
        # Stale-while-revalidate: serve last good streams immediately, refresh in background
        stale = content_store.get_playable_cached_episodes(db, drama_id)
        if stale and not (drama_id or "").startswith("vigloo_"):
            episodes = stale
            stale_served = True
            cache_hit = True
            asyncio.create_task(_warm_episodes_bg(drama_id))

    if not episodes:
        episodes = await aggregator.get_episodes(drama_id)
        if not drama_meta:
            try:
                drama_meta = await aggregator.get_detail(drama_id)
            except Exception:
                drama_meta = None
        if episodes and any(not is_demo_url(ep.get("video_url")) for ep in episodes):
            content_store.upsert_episodes(
                db,
                drama_id,
                episodes,
                drama_meta=drama_meta,
                source="api",
            )
        cache_hit = False

    is_lifetime = False
    episodes_watched = 0
    if user and user.subscription:
        if user.subscription.status == "active" and user.subscription.plan == "lifetime":
            is_lifetime = True
        episodes_watched = user.subscription.episodes_watched

    free_trial_episodes = settings_store.get_guest_preview_episodes(db)

    drama_cover = ""
    if drama_meta:
        drama_cover = (
            drama_meta.get("cover")
            or drama_meta.get("coverImage")
            or drama_meta.get("cover_image")
            or ""
        )

    processed = []
    for ep in episodes:
        num = ep.get("episode_num", 1)
        raw_url = unwrap_decrypt_proxy_url(ep.get("video_url") or "")
        drm_key = str(ep.get("drm_key") or "") if isinstance(ep, dict) else ""
        cf_cookies = ep.get("cf_cookies") if isinstance(ep, dict) and isinstance(ep.get("cf_cookies"), dict) else None
        if not user:
            # Guests may see titles on detail page, but never get stream URLs / keys
            is_locked = True
            video_url = ""
            drm_key = ""
            cf_cookies = None
        elif is_lifetime:
            is_locked = False
            video_url = raw_url
        else:
            is_locked = num > free_trial_episodes
            video_url = "" if is_locked else raw_url
            if is_locked:
                drm_key = ""
                cf_cookies = None

        cover = (ep.get("cover") or "").strip() or drama_cover
        row = {
            **ep,
            "video_url": video_url,
            "cover": cover,
            "is_locked": is_locked,
            "is_free_trial": bool(user) and num <= free_trial_episodes,
            "requires_login": not bool(user),
        }
        if drm_key and video_url:
            row["drm_key"] = drm_key
        else:
            row.pop("drm_key", None)
        if cf_cookies and video_url:
            row["cf_cookies"] = cf_cookies
        else:
            row.pop("cf_cookies", None)
        processed.append(row)

    resume_episode = None
    if user:
        progress = (
            db.query(WatchProgress)
            .filter(WatchProgress.user_id == user.id, WatchProgress.drama_id == drama_id)
            .first()
        )
        if progress and int(progress.episode_num or 0) > 0:
            resume_episode = int(progress.episode_num)

    like_counts, liked_episodes = _episode_like_summary(db, drama_id, user)

    return {
        "drama_id": drama_id,
        "is_lifetime": is_lifetime,
        "free_trial_episodes": free_trial_episodes,
        "free_trial_remaining": max(0, free_trial_episodes - episodes_watched) if user else 0,
        "resume_episode": resume_episode,
        "like_counts": like_counts,
        "liked_episodes": liked_episodes,
        "episodes": processed,
        "cache_hit": cache_hit,
        "stale": stale_served,
        "cached": True,
        "authenticated": bool(user),
    }


def _user_from_access_token(token: Optional[str], db: Session) -> Optional[User]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        return db.query(User).filter(User.id == int(user_id)).first()
    except (JWTError, ValueError, TypeError):
        return None


def _is_vigloo_host(hostname: Optional[str]) -> bool:
    host = (hostname or "").lower()
    return bool(host) and ("vigloo.com" in host or host.endswith("vigloo.com"))


def _vigloo_media_dir(url: str) -> str:
    path = urlparse(url).path or ""
    if "/" not in path:
        return path
    return path.rsplit("/", 1)[0] + "/"


def _vigloo_episode_num_from_url(url: str) -> Optional[int]:
    m = _VIGLOO_EP_PATH_RE.search(urlparse(url).path or "")
    if not m:
        return None
    try:
        return int(m.group(1))
    except (TypeError, ValueError):
        return None


def _vault_get_vigloo_cookies(media_dir: str) -> Optional[dict]:
    entry = _vigloo_cookie_vault.get(media_dir)
    if not entry:
        return None
    if float(entry.get("expires_at") or 0) <= time.time() + 30:
        _vigloo_cookie_vault.pop(media_dir, None)
        return None
    cookies = entry.get("cookies")
    return cookies if isinstance(cookies, dict) else None


def _vault_set_vigloo_cookies(media_dir: str, cookies: dict) -> None:
    left = content_store._cf_policy_seconds_left(cookies.get("CloudFront-Policy"))
    if left is None or left <= 0:
        return
    _vigloo_cookie_vault[media_dir] = {
        "cookies": {
            "CloudFront-Policy": cookies["CloudFront-Policy"],
            "CloudFront-Signature": cookies["CloudFront-Signature"],
            "CloudFront-Key-Pair-Id": cookies["CloudFront-Key-Pair-Id"],
        },
        "expires_at": time.time() + left,
    }


async def _refresh_vigloo_cookies_for_url(url: str, db: Session) -> Optional[dict]:
    """Re-fetch CloudFront cookies for a Vigloo CDN URL and update episode cache."""
    media_dir = _vigloo_media_dir(url)
    ep_num = _vigloo_episode_num_from_url(url)
    if not media_dir or not ep_num:
        return None

    lock = _vigloo_refresh_locks.setdefault(media_dir, asyncio.Lock())
    async with lock:
        cached = _vault_get_vigloo_cookies(media_dir)
        if cached:
            return cached

        row = (
            db.query(CachedEpisode)
            .filter(CachedEpisode.video_url.contains(media_dir))
            .first()
        )
        if not row:
            for cand in (
                db.query(CachedEpisode)
                .filter(
                    CachedEpisode.drama_id.startswith("vigloo_"),
                    CachedEpisode.episode_num == ep_num,
                )
                .all()
            ):
                if media_dir in (cand.video_url or ""):
                    row = cand
                    break

        if not row:
            return None

        drama_id = row.drama_id
        try:
            import json as _json
            raw_full = _json.loads(row.raw_json or "{}")
        except Exception:
            raw_full = {}
        if not isinstance(raw_full, dict):
            raw_full = {}
        season_id = str(raw_full.get("season_id") or "")
        orig_id = drama_id.split("_", 1)[-1] if "_" in drama_id else drama_id

        fetcher = EpisodeFetcher(aggregator.client, aggregator.api_key)
        refreshed = await fetcher.refresh_vigloo_play(orig_id, ep_num, season_id)
        if not refreshed:
            return None

        cookies = refreshed.get("cf_cookies") or {}
        new_url = refreshed.get("video_url") or ""
        if not cookies.get("CloudFront-Policy"):
            return None

        try:
            import json as _json
            raw_full["cf_cookies"] = cookies
            if refreshed.get("season_id"):
                raw_full["season_id"] = refreshed["season_id"]
            if new_url:
                row.video_url = new_url
            row.raw_json = _json.dumps(raw_full)
            row.updated_at = datetime.datetime.utcnow()
            parent = db.query(CachedDrama).filter(CachedDrama.drama_id == drama_id).first()
            if parent:
                parent.last_fetched_at = datetime.datetime.utcnow()
            db.commit()
        except Exception as e:
            print(f"Vigloo cookie cache update failed: {e}")
            db.rollback()

        _vault_set_vigloo_cookies(media_dir, cookies)
        return cookies


@router.get("/hls-proxy")
async def hls_proxy(
    request: Request,
    url: str = Query(..., description="Remote HLS playlist or segment URL"),
    access_token: Optional[str] = Query(None, description="JWT for <video> element requests"),
    cf_policy: Optional[str] = Query(None, description="Vigloo CloudFront-Policy cookie"),
    cf_signature: Optional[str] = Query(None, description="Vigloo CloudFront-Signature cookie"),
    cf_key_pair_id: Optional[str] = Query(None, description="Vigloo CloudFront-Key-Pair-Id cookie"),
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Proxy remote media. Login required (Bearer or access_token query for <video> tags).

    Forwards Range requests — Vigloo CMAF playlists use EXT-X-BYTERANGE on a single .cmfv file.
    """
    authed = user or _user_from_access_token(access_token, db)
    if not authed:
        raise HTTPException(status_code=401, detail="Login required to stream video")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not _is_allowed_stream_host(parsed.hostname):
        raise HTTPException(status_code=400, detail="Stream host not allowed")

    media_dir = _vigloo_media_dir(url) if _is_vigloo_host(parsed.hostname) else ""
    vault_cookies = _vault_get_vigloo_cookies(media_dir) if media_dir else None
    use_policy = (vault_cookies or {}).get("CloudFront-Policy") or cf_policy
    use_signature = (vault_cookies or {}).get("CloudFront-Signature") or cf_signature
    use_key = (vault_cookies or {}).get("CloudFront-Key-Pair-Id") or cf_key_pair_id

    headers = {"User-Agent": "SeryeKo/1.0"}
    cookie = _cf_cookie_header(use_policy, use_signature, use_key)
    if cookie:
        headers["Cookie"] = cookie
    # Critical for Vigloo CMAF: player requests tiny byte ranges of one .cmfv file
    range_header = request.headers.get("range") or request.headers.get("Range")
    if range_header:
        headers["Range"] = range_header

    try:
        async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            # Auto-recover expired Vigloo CloudFront cookies (~20 min lifetime)
            if resp.status_code == 403 and _is_vigloo_host(parsed.hostname):
                fresh = await _refresh_vigloo_cookies_for_url(url, db)
                if fresh:
                    use_policy = fresh.get("CloudFront-Policy")
                    use_signature = fresh.get("CloudFront-Signature")
                    use_key = fresh.get("CloudFront-Key-Pair-Id")
                    headers["Cookie"] = _cf_cookie_header(use_policy, use_signature, use_key)
                    resp = await client.get(url, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream fetch failed: {e}")

    if resp.status_code == 429:
        raise HTTPException(
            status_code=429,
            detail="Upstream rate-limited the stream (try again in a moment)",
        )
    if resp.status_code == 403:
        raise HTTPException(
            status_code=403,
            detail="Stream token expired — reload the episode to get a fresh link",
        )
    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Upstream status {resp.status_code}")

    content_type = (resp.headers.get("content-type") or "").lower()
    body = resp.content
    is_playlist = (
        "mpegurl" in content_type
        or url.split("?", 1)[0].endswith(".m3u8")
        or body.lstrip().startswith(b"#EXTM3U")
    )

    token_q = f"&access_token={quote(access_token, safe='')}" if access_token else ""
    token_q += _cf_query_suffix(use_policy, use_signature, use_key)

    if is_playlist:
        text = body.decode("utf-8", errors="ignore")
        return Response(
            content=_rewrite_hls_playlist(text, url, token_q),
            media_type="application/vnd.apple.mpegurl",
            headers={"Cache-Control": "no-cache"},
        )

    out_headers = {"Cache-Control": "public, max-age=300"}
    # Preserve partial-content semantics for EXT-X-BYTERANGE segments
    for hdr in ("content-range", "accept-ranges", "content-length", "etag", "last-modified"):
        val = resp.headers.get(hdr)
        if val:
            out_headers[hdr.title() if hdr != "etag" else "ETag"] = val
    if "Accept-Ranges" not in out_headers and "accept-ranges" not in {k.lower() for k in out_headers}:
        out_headers["Accept-Ranges"] = "bytes"

    return Response(
        content=body,
        status_code=resp.status_code,  # 200 or 206
        media_type=content_type or "application/octet-stream",
        headers=out_headers,
    )


@router.get("/drm-proxy")
async def drm_proxy(
    url: str = Query(..., description="Encrypted Melolo CDN MP4 URL"),
    key: str = Query(..., description="32-hex AES-CTR key from qualityList"),
    access_token: Optional[str] = Query(None, description="JWT for <video> element requests"),
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Decrypt Melolo CENC MP4 and transcode to H.264 so browsers without HEVC can play."""
    import asyncio

    authed = user or _user_from_access_token(access_token, db)
    if not authed:
        raise HTTPException(status_code=401, detail="Login required to stream video")

    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https") or not _is_allowed_stream_host(parsed.hostname):
        raise HTTPException(status_code=400, detail="Stream host not allowed")

    key_hex = (key or "").strip().lower()
    if len(key_hex) != 32 or any(c not in "0123456789abcdef" for c in key_hex):
        raise HTTPException(status_code=400, detail="Invalid DRM key")

    cache_id = hashlib.sha256(f"{url}|{key_hex}|cenc-subsample-v2".encode()).hexdigest()[:40]
    cached = _DRM_CACHE_DIR / f"{cache_id}.mp4"
    if cached.exists() and cached.stat().st_size > 1024:
        return FileResponse(
            cached,
            media_type="video/mp4",
            headers={"Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes"},
        )

    try:
        async with httpx.AsyncClient(timeout=120.0, follow_redirects=True) as client:
            resp = await client.get(url, headers={"User-Agent": "SeryeKo/1.0"})
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Upstream fetch failed: {e}")

    if resp.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Upstream status {resp.status_code}")

    body = resp.content

    def _decrypt_and_transcode() -> None:
        from app.services.melolo_decrypt import decrypt_cenc_mp4

        clear = decrypt_cenc_mp4(body, key_hex)
        enc_path = _DRM_CACHE_DIR / f"{cache_id}.clear.mp4"
        tmp_out = _DRM_CACHE_DIR / f"{cache_id}.tmp.mp4"
        enc_path.write_bytes(clear)
        try:
            # Prefer keeping audio; if AAC decode fails, fall back to video-only
            # rather than producing a "successful" silent file.
            cmds = [
                [
                    "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-i", str(enc_path),
                    "-map", "0:v:0", "-map", "0:a:0?",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
                    "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-ar", "44100",
                    "-movflags", "+faststart",
                    str(tmp_out),
                ],
                [
                    "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
                    "-i", str(enc_path),
                    "-map", "0:v:0",
                    "-c:v", "libx264", "-preset", "ultrafast", "-crf", "28",
                    "-an",
                    "-movflags", "+faststart",
                    str(tmp_out),
                ],
            ]
            last_err = "ffmpeg failed"
            for cmd in cmds:
                proc = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
                if proc.returncode == 0 and tmp_out.exists() and tmp_out.stat().st_size > 1024:
                    os.replace(tmp_out, cached)
                    return
                last_err = (proc.stderr or proc.stdout or last_err)[:300]
            raise RuntimeError(last_err)
        finally:
            try:
                enc_path.unlink(missing_ok=True)
            except Exception:
                pass
            try:
                tmp_out.unlink(missing_ok=True)
            except Exception:
                pass

    try:
        # Heavy CPU work off the event loop so login/register stay responsive
        await asyncio.to_thread(_decrypt_and_transcode)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Decrypt/transcode failed: {e}")

    if not cached.exists():
        raise HTTPException(status_code=500, detail="Transcode produced no file")

    return FileResponse(
        cached,
        media_type="video/mp4",
        headers={"Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes"},
    )


@router.post("/episodes/{drama_id}/watch/{ep_num}")
async def record_watch(
    drama_id: str,
    ep_num: int,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    free_trial_episodes = settings_store.get_guest_preview_episodes(db)
    if not content_store.cache_is_fresh(db, drama_id):
        try:
            episodes = await aggregator.get_episodes(drama_id)
            detail = None
            try:
                detail = await aggregator.get_detail(drama_id)
            except Exception:
                detail = content_store.get_cached_drama(db, drama_id)
            content_store.upsert_episodes(db, drama_id, episodes, drama_meta=detail, source="api")
        except Exception as e:
            print(f"Failed to cache drama on watch: {e}")

    content_store.mark_played(db, drama_id, ep_num)

    sub = user.subscription
    is_lifetime = bool(sub and sub.status == "active" and sub.plan == "lifetime")

    if not is_lifetime and ep_num > free_trial_episodes:
        raise HTTPException(
            status_code=403,
            detail=f"Free trial limit reached ({free_trial_episodes} episodes). Please unlock lifetime access.",
        )

    progress = db.query(WatchProgress).filter(
        WatchProgress.user_id == user.id,
        WatchProgress.drama_id == drama_id,
    ).first()
    prev_ep = int(progress.episode_num or 0) if progress else 0

    if not progress:
        progress = WatchProgress(user_id=user.id, drama_id=drama_id)
        db.add(progress)

    # Count only newly reached episodes (rewatches / seeking back do not inflate the total)
    newly_watched = max(0, ep_num - prev_ep)
    if newly_watched and sub:
        sub.episodes_watched = int(sub.episodes_watched or 0) + newly_watched

    progress.episode_num = ep_num
    progress.progress_pct = 100.0
    progress.updated_at = datetime.datetime.utcnow()
    db.commit()
    if sub:
        db.refresh(sub)

    watched = int(sub.episodes_watched) if sub else ep_num
    return {
        "status": "active" if is_lifetime else "trial",
        "episodes_watched": watched,
        "free_trial_remaining": 0 if is_lifetime else max(0, free_trial_episodes - watched),
        "can_watch": True,
        "cached": True,
    }


@router.get("/cache/stats")
async def cache_stats(db: Session = Depends(get_db)):
    """Simple stats for locally cached dramas/episodes."""
    from app.models.schema import CachedDrama, CachedEpisode
    dramas = db.query(CachedDrama).count()
    episodes = db.query(CachedEpisode).count()
    playable = db.query(CachedEpisode).filter(CachedEpisode.video_url != "").count()
    return {
        "dramas": dramas,
        "episodes": episodes,
        "playable_episodes": playable,
        "ttl_seconds": content_store.STREAM_CACHE_TTL_SECONDS,
    }


def _episode_like_summary(
    db: Session, drama_id: str, user: Optional[User]
) -> tuple[Dict[str, int], list]:
    """Return ({episode_num_str: count}, [episode_nums liked by user])."""
    from sqlalchemy import func

    rows = (
        db.query(EpisodeLike.episode_num, func.count(EpisodeLike.id))
        .filter(EpisodeLike.drama_id == drama_id)
        .group_by(EpisodeLike.episode_num)
        .all()
    )
    counts = {str(int(ep)): int(cnt) for ep, cnt in rows}
    liked: list = []
    if user:
        liked = [
            int(r[0])
            for r in db.query(EpisodeLike.episode_num)
            .filter(EpisodeLike.user_id == user.id, EpisodeLike.drama_id == drama_id)
            .all()
        ]
    return counts, liked


@router.get("/episodes/{drama_id}/likes")
async def get_episode_likes(
    drama_id: str,
    user: Optional[User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    counts, liked = _episode_like_summary(db, drama_id, user)
    return {"drama_id": drama_id, "counts": counts, "liked": liked}


@router.post("/episodes/{drama_id}/likes/{ep_num}")
async def toggle_episode_like(
    drama_id: str,
    ep_num: int,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    if ep_num < 1:
        raise HTTPException(status_code=400, detail="Invalid episode number")

    existing = (
        db.query(EpisodeLike)
        .filter(
            EpisodeLike.user_id == user.id,
            EpisodeLike.drama_id == drama_id,
            EpisodeLike.episode_num == ep_num,
        )
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        liked = False
    else:
        db.add(EpisodeLike(user_id=user.id, drama_id=drama_id, episode_num=ep_num))
        db.commit()
        liked = True

    from sqlalchemy import func

    count = (
        db.query(func.count(EpisodeLike.id))
        .filter(EpisodeLike.drama_id == drama_id, EpisodeLike.episode_num == ep_num)
        .scalar()
        or 0
    )
    return {
        "drama_id": drama_id,
        "episode_num": ep_num,
        "liked": liked,
        "count": int(count),
    }


class VideoReportRequest(BaseModel):
    drama_id: str = Field(..., min_length=1, max_length=150)
    episode_num: int = Field(1, ge=1, le=5000)
    episode_id: Optional[str] = ""
    title: Optional[str] = ""
    video_url: Optional[str] = ""
    reason: Optional[str] = "playback_failed"
    details: Optional[str] = ""


@router.post("/reports")
async def report_video(
    req: VideoReportRequest,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    """Logged-in users report an episode that failed to play."""
    drama_id = (req.drama_id or "").strip()
    if not drama_id:
        raise HTTPException(status_code=400, detail="drama_id required")

    provider = drama_id.split("_", 1)[0] if "_" in drama_id else ""
    since = datetime.datetime.utcnow() - datetime.timedelta(hours=24)
    existing = (
        db.query(VideoReport)
        .filter(
            VideoReport.user_id == user.id,
            VideoReport.drama_id == drama_id,
            VideoReport.episode_num == req.episode_num,
            VideoReport.created_at >= since,
        )
        .order_by(VideoReport.created_at.desc())
        .first()
    )
    if existing:
        return {
            "status": "ok",
            "duplicate": True,
            "report": {"id": existing.id, "status": existing.status},
        }

    row = VideoReport(
        user_id=user.id,
        drama_id=drama_id,
        episode_num=int(req.episode_num or 1),
        episode_id=(req.episode_id or "")[:200],
        provider=provider[:100],
        title=(req.title or "")[:500],
        video_url=(req.video_url or "")[:2000],
        reason=(req.reason or "playback_failed")[:100],
        details=(req.details or "")[:2000],
        status="open",
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {
        "status": "ok",
        "duplicate": False,
        "report": {"id": row.id, "status": row.status},
    }

"""Persist drama/episode metadata + video URLs in the local database.

Flow:
1. On first play / episodes fetch → pull from provider API → upsert DB
2. Next users → serve from local DB (skip upstream API)
3. Refresh from API when cache is stale (HLS auth keys expire)
"""
from __future__ import annotations

import datetime
import json
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy.orm import Session

from app.models.schema import CachedDrama, CachedEpisode

# Provider stream URLs (esp. ShortMax/DramaWave HLS) expire; refresh after this TTL
STREAM_CACHE_TTL_SECONDS = 3 * 60 * 60  # 3 hours
# Vigloo CloudFront cookies expire ~20 min — never serve near-expired cache
VIGLOO_CACHE_TTL_SECONDS = 5 * 60
VIGLOO_COOKIE_MIN_TTL_SECONDS = 3 * 60


def _cf_policy_seconds_left(policy_b64: Optional[str]) -> Optional[int]:
    """Return seconds until CloudFront policy expiry, or None if unreadable."""
    if not policy_b64:
        return None
    try:
        import base64
        import json
        import time

        pad = "=" * (-len(policy_b64) % 4)
        raw = base64.b64decode(policy_b64 + pad)
        data = json.loads(raw)
        statements = data.get("Statement") or []
        if not statements:
            return None
        exp = int(statements[0]["Condition"]["DateLessThan"]["AWS:EpochTime"])
        return exp - int(time.time())
    except Exception:
        return None


def vigloo_cookies_are_fresh(cf_cookies: Optional[Dict[str, Any]], min_ttl: int = VIGLOO_COOKIE_MIN_TTL_SECONDS) -> bool:
    if not isinstance(cf_cookies, dict):
        return False
    left = _cf_policy_seconds_left(cf_cookies.get("CloudFront-Policy"))
    if left is None:
        return False
    return left >= min_ttl


def _dumps(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except Exception:
        return "[]" if isinstance(value, list) else "{}"


def _loads(text: Optional[str], default: Any):
    if not text:
        return default
    try:
        return json.loads(text)
    except Exception:
        return default


def _split_provider(drama_id: str) -> Tuple[str, str]:
    parts = drama_id.split("_", 1)
    if len(parts) == 2:
        return parts[0], parts[1]
    return "", drama_id


def drama_to_dict(row: CachedDrama) -> Dict[str, Any]:
    from app.services.catalog import clean_tag_list, clean_text_field

    tags = clean_tag_list(_loads(row.tags_json, []))
    genre = clean_tag_list(_loads(row.genre_json, tags or ["Drama"])) or tags or ["Drama"]
    summary = clean_text_field(row.summary or "")
    synopsis = clean_text_field(row.synopsis or row.summary or "") or summary
    return {
        "id": row.drama_id,
        "provider": row.provider,
        "original_id": row.original_id,
        "title": row.title,
        "cover": row.cover or row.cover_image,
        "coverImage": row.cover_image or row.cover,
        "summary": summary,
        "synopsis": synopsis,
        "episodes": row.episodes_count,
        "totalEpisodes": row.episodes_count,
        "badge": row.badge,
        "tags": tags or ["Drama"],
        "genre": genre,
        "country": row.country or "",
        "year": row.year,
        "status": row.status or "ongoing",
        "rating": row.rating if row.rating is not None else 4.5,
        "languages": _loads(row.languages_json, ["en"]),
        "titleLocalized": _loads(row.title_localized_json, {"en": row.title}),
        "play_count": row.play_count or 0,
        "cached": True,
        "last_fetched_at": row.last_fetched_at.isoformat() + "Z" if row.last_fetched_at else None,
        "last_played_at": row.last_played_at.isoformat() + "Z" if row.last_played_at else None,
        "source": row.source or "api",
    }


def episode_to_dict(row: CachedEpisode) -> Dict[str, Any]:
    raw = _loads(row.raw_json, {})
    out = {
        "id": row.episode_id or f"{row.drama_id}_{row.episode_num}",
        "episode_num": row.episode_num,
        "title": row.title or f"Episode {row.episode_num}",
        "video_url": row.video_url or "",
        "cover": row.cover or "",
        "duration": row.duration,
        "is_locked": bool(row.is_locked_provider),
        "cached": True,
    }
    # Melolo (and similar) CENC keys live on the episode payload
    drm_key = ""
    cf_cookies = None
    if isinstance(raw, dict):
        drm_key = str(raw.get("drm_key") or "")
        cookies = raw.get("cf_cookies")
        if isinstance(cookies, dict) and cookies.get("CloudFront-Policy"):
            cf_cookies = cookies
        season_id = str(raw.get("season_id") or "")
        if season_id:
            out["season_id"] = season_id
    if drm_key:
        out["drm_key"] = drm_key
    if cf_cookies:
        out["cf_cookies"] = cf_cookies
    return out


def get_cached_drama(db: Session, drama_id: str) -> Optional[Dict[str, Any]]:
    row = db.query(CachedDrama).filter(CachedDrama.drama_id == drama_id).first()
    if not row:
        return None
    return drama_to_dict(row)


def get_cached_episodes(db: Session, drama_id: str) -> Optional[List[Dict[str, Any]]]:
    rows = (
        db.query(CachedEpisode)
        .filter(CachedEpisode.drama_id == drama_id)
        .order_by(CachedEpisode.episode_num.asc())
        .all()
    )
    if not rows:
        return None
    return [episode_to_dict(r) for r in rows]


def cache_is_fresh(db: Session, drama_id: str, ttl_seconds: int = STREAM_CACHE_TTL_SECONDS) -> bool:
    from app.services.episode_sources import is_demo_url

    row = db.query(CachedDrama).filter(CachedDrama.drama_id == drama_id).first()
    if not row or not row.last_fetched_at:
        return False
    # Vigloo signed cookies expire ~20 min — keep DB cache short
    is_vigloo = (drama_id or "").startswith("vigloo_")
    effective_ttl = VIGLOO_CACHE_TTL_SECONDS if is_vigloo else ttl_seconds
    age = (datetime.datetime.utcnow() - row.last_fetched_at).total_seconds()
    if age > effective_ttl:
        return False

    rows = (
        db.query(CachedEpisode)
        .filter(CachedEpisode.drama_id == drama_id, CachedEpisode.video_url != "")
        .all()
    )
    playable = [r for r in rows if not is_demo_url(r.video_url)]
    if not playable:
        return False
    if is_vigloo:
        # Reject cache if every playable episode's CloudFront policy is nearly expired
        if not any(vigloo_cookies_are_fresh(episode_to_dict(r).get("cf_cookies")) for r in playable):
            return False
    return True


def get_playable_cached_episodes(db: Session, drama_id: str) -> Optional[List[Dict[str, Any]]]:
    """Return cached episodes if any real streams exist (even when TTL is stale)."""
    from app.services.episode_sources import is_demo_url

    episodes = get_cached_episodes(db, drama_id)
    if not episodes:
        return None
    if (
        (drama_id or "").startswith("vigloo_")
        and not any(isinstance(ep.get("cf_cookies"), dict) for ep in episodes)
    ):
        return None
    if not any(not is_demo_url(ep.get("video_url")) for ep in episodes):
        return None
    return episodes


def upsert_drama(db: Session, detail: Dict[str, Any], source: str = "api") -> CachedDrama:
    from app.services.catalog import clean_tag_list, clean_text_field, is_generic_hot_badge

    drama_id = detail.get("id") or detail.get("drama_id")
    if not drama_id:
        raise ValueError("drama detail missing id")

    provider, original_id = _split_provider(drama_id)
    provider = detail.get("provider") or provider
    original_id = str(detail.get("original_id") or original_id)

    row = db.query(CachedDrama).filter(CachedDrama.drama_id == drama_id).first()
    if not row:
        row = CachedDrama(drama_id=drama_id)
        db.add(row)

    summary = clean_text_field(detail.get("summary") or detail.get("synopsis") or "")
    synopsis = clean_text_field(detail.get("synopsis") or detail.get("summary") or "") or summary
    tags = clean_tag_list(detail.get("tags") or detail.get("genre") or [])
    genre = clean_tag_list(detail.get("genre") or detail.get("tags") or tags) or tags

    row.provider = provider
    row.original_id = original_id
    row.title = detail.get("title") or row.title or ""
    row.cover = detail.get("cover") or detail.get("coverImage") or row.cover or ""
    row.cover_image = detail.get("coverImage") or detail.get("cover") or row.cover_image or ""
    row.summary = summary or clean_text_field(row.summary or "") or ""
    row.synopsis = synopsis or clean_text_field(row.synopsis or "") or row.summary or ""
    row.episodes_count = int(
        detail.get("totalEpisodes")
        or detail.get("episodes")
        or detail.get("episodes_count")
        or row.episodes_count
        or 0
    )
    incoming_badge = (detail.get("badge") or "").strip()
    if incoming_badge and not is_generic_hot_badge(incoming_badge):
        row.badge = incoming_badge
    elif is_generic_hot_badge(row.badge or ""):
        # Drop stale auto-Hot labels previously persisted from the catalog normalizer
        row.badge = ""
    row.tags_json = _dumps(tags or clean_tag_list(_loads(row.tags_json, [])) or ["Drama"])
    row.genre_json = _dumps(genre or tags or ["Drama"])
    row.country = detail.get("country") or row.country or ""
    year = detail.get("year")
    try:
        row.year = int(year) if year not in (None, "") else row.year
    except (TypeError, ValueError):
        pass
    row.status = detail.get("status") or row.status or "ongoing"
    try:
        row.rating = float(detail.get("rating") if detail.get("rating") is not None else (row.rating or 4.5))
    except (TypeError, ValueError):
        row.rating = row.rating or 4.5
    row.languages_json = _dumps(detail.get("languages") or ["en"])
    row.title_localized_json = _dumps(
        detail.get("titleLocalized") or detail.get("title_localized") or {"en": row.title}
    )
    row.raw_json = _dumps(detail)
    row.source = source
    row.last_fetched_at = datetime.datetime.utcnow()
    row.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(row)
    return row


def upsert_episodes(
    db: Session,
    drama_id: str,
    episodes: List[Dict[str, Any]],
    drama_meta: Optional[Dict[str, Any]] = None,
    source: str = "api",
) -> List[CachedEpisode]:
    if drama_meta:
        meta = {**drama_meta, "id": drama_id}
        if not meta.get("episodes") and not meta.get("totalEpisodes"):
            meta["episodes"] = len(episodes)
        upsert_drama(db, meta, source=source)
    else:
        # Ensure parent row exists
        if not db.query(CachedDrama).filter(CachedDrama.drama_id == drama_id).first():
            provider, original_id = _split_provider(drama_id)
            upsert_drama(
                db,
                {
                    "id": drama_id,
                    "provider": provider,
                    "original_id": original_id,
                    "title": drama_id,
                    "episodes": len(episodes),
                },
                source=source,
            )

    existing = {
        e.episode_num: e
        for e in db.query(CachedEpisode).filter(CachedEpisode.drama_id == drama_id).all()
    }
    saved: List[CachedEpisode] = []
    seen_nums = set()
    drama_cover = ""
    if drama_meta:
        drama_cover = drama_meta.get("cover") or drama_meta.get("coverImage") or ""
    if not drama_cover:
        parent_row = db.query(CachedDrama).filter(CachedDrama.drama_id == drama_id).first()
        if parent_row:
            drama_cover = parent_row.cover or parent_row.cover_image or ""

    for ep in episodes:
        num = int(ep.get("episode_num") or ep.get("episode") or 0)
        if num <= 0:
            continue
        seen_nums.add(num)
        row = existing.get(num)
        if not row:
            row = CachedEpisode(drama_id=drama_id, episode_num=num)
            db.add(row)

        row.episode_id = str(ep.get("id") or f"{drama_id}_{num}")
        row.title = ep.get("title") or f"Episode {num}"
        # Prefer non-empty new URL; keep previous if upstream omitted it
        new_url = ep.get("video_url") or ""
        if new_url:
            row.video_url = new_url
        row.cover = ep.get("cover") or row.cover or drama_cover or ""
        duration = ep.get("duration")
        try:
            row.duration = int(duration) if duration not in (None, "") else row.duration
        except (TypeError, ValueError):
            pass
        row.is_locked_provider = bool(ep.get("is_locked", False))
        row.raw_json = _dumps(ep)
        row.updated_at = datetime.datetime.utcnow()
        saved.append(row)

    # Update parent episode count + fetch stamp
    parent = db.query(CachedDrama).filter(CachedDrama.drama_id == drama_id).first()
    if parent:
        parent.episodes_count = max(parent.episodes_count or 0, len(seen_nums))
        parent.last_fetched_at = datetime.datetime.utcnow()
        parent.updated_at = datetime.datetime.utcnow()

    db.commit()
    return saved


def mark_played(db: Session, drama_id: str, episode_num: Optional[int] = None) -> None:
    row = db.query(CachedDrama).filter(CachedDrama.drama_id == drama_id).first()
    if not row:
        return
    row.play_count = (row.play_count or 0) + 1
    row.last_played_at = datetime.datetime.utcnow()
    row.updated_at = datetime.datetime.utcnow()
    db.commit()
    try:
        from app.services.catalog import invalidate_hot_cache
        invalidate_hot_cache()
    except Exception:
        pass

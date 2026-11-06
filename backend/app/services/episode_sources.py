"""Fetch playable episode lists from DramaBuzz provider APIs."""
from __future__ import annotations

import asyncio
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence
from urllib.parse import parse_qs, unquote, urljoin, urlparse

import httpx


def is_demo_url(url: Optional[str]) -> bool:
    if not url:
        return True
    u = url.lower()
    return "/samples/demo" in u or "/samples/brand" in u or "forbiggerblazes" in u or u.startswith("/samples/")


def pick_episode_cover(ep: Optional[Dict[str, Any]], fallback: str = "") -> str:
    """Best-effort episode thumbnail across heterogeneous provider payloads."""
    if not isinstance(ep, dict):
        return fallback or ""
    for key in (
        "cover", "coverUrl", "cover_url", "coverWap", "chapterImg", "chapter_img",
        "chapter_cover", "thumbnail", "thumb", "first_frame", "poster", "posterUrl",
        "pic", "image", "snapshot", "snapUrl", "snap_url", "coverPath",
    ):
        val = ep.get(key)
        if isinstance(val, str) and val.strip():
            return val.strip()
        if isinstance(val, dict):
            nested = val.get("url") or val.get("src") or val.get("cover")
            if isinstance(nested, str) and nested.strip():
                return nested.strip()
    return fallback or ""


def unwrap_decrypt_proxy_url(url: Optional[str]) -> str:
    """ReelBuzz fileUrl often wraps CDN media in a Cloudflare Worker decrypt proxy.

    That worker rate-limits (HTTP 429). Prefer the underlying CDN URL when present —
    cdn*.shortolol.com already serves playable MP4 with CORS.
    """
    if not url:
        return ""
    try:
        parsed = urlparse(url)
        host = (parsed.hostname or "").lower()
        if "workers.dev" in host and ("decrypt" in host or "reelbuzz" in host):
            qs = parse_qs(parsed.query)
            inner = (qs.get("url") or [None])[0]
            if inner:
                return unquote(inner)
    except Exception:
        pass
    return url


_QUALITY_PREF = ("1080", "720", "hd", "540", "480", "sd", "360", "240")


def _quality_rank(label: str) -> int:
    lab = (label or "").lower()
    for i, pref in enumerate(_QUALITY_PREF):
        if pref in lab:
            return i
    return len(_QUALITY_PREF)


def _quality_urls_ordered(quality_list: Any) -> List[str]:
    """Order qualityList / videoUrls / qualities-dict entries best-first (1080/720 preferred)."""
    if isinstance(quality_list, dict):
        # FlareFlow-style: {"1080p": "https://...", "720p": "https://..."}
        quality_list = [
            {"label": str(k), "url": v}
            for k, v in quality_list.items()
            if isinstance(v, str) and v.startswith("http")
        ]
    if not isinstance(quality_list, list):
        return []
    rows = []
    for q in quality_list:
        if isinstance(q, str) and q.startswith("http"):
            rows.append((_quality_rank(""), q))
            continue
        if not isinstance(q, dict):
            continue
        label = str(q.get("label") or q.get("quality") or q.get("definition") or "")
        url = q.get("url") or q.get("play_url") or q.get("playUrl") or q.get("videoUrl") or ""
        if isinstance(url, str) and url.startswith("http"):
            rows.append((_quality_rank(label), url))
    rows.sort(key=lambda r: r[0])
    out: List[str] = []
    seen = set()
    for _, url in rows:
        if url not in seen:
            seen.add(url)
            out.append(url)
    return out


def _dedupe_urls(urls: Iterable[Optional[str]]) -> List[str]:
    out: List[str] = []
    seen = set()
    for raw in urls:
        if not raw or not isinstance(raw, str):
            continue
        url = unwrap_decrypt_proxy_url(raw.strip())
        if not url.startswith("http") or url in seen:
            continue
        seen.add(url)
        out.append(url)
    return out


def collect_stream_candidates(
    *direct: Optional[str],
    quality_list: Any = None,
    video_obj: Any = None,
    video_urls: Any = None,
    standby: Any = None,
    extra_keys: Optional[Sequence[str]] = None,
    payload: Optional[Dict[str, Any]] = None,
) -> List[str]:
    """Build an ordered list of candidate stream URLs from heterogeneous provider payloads."""
    ordered: List[str] = []

    ordered.extend([u for u in direct if u])

    if isinstance(video_obj, dict):
        for key in ("video_720", "video_1080", "video_480", "video_540", "url", "play_url", "playUrl"):
            val = video_obj.get(key)
            if isinstance(val, str):
                ordered.append(val)
    elif isinstance(video_obj, str):
        ordered.append(video_obj)

    ordered.extend(_quality_urls_ordered(quality_list))
    ordered.extend(_quality_urls_ordered(video_urls))

    if isinstance(standby, list):
        for s in standby:
            if isinstance(s, str):
                ordered.append(s)
            elif isinstance(s, dict):
                ordered.append(s.get("url") or s.get("playUrl") or "")

    if isinstance(payload, dict):
        keys = list(extra_keys or ()) + [
            "videoUrl", "video_url", "playUrl", "play_url", "url", "mediaUrl",
            "hls_url", "m3u8", "m3u8_url", "m3u8_path",
            "720p_mp4", "1080p_mp4", "540p_mp4", "fileUrl", "playURL",
            "videoUrl720", "videoUrl1080", "videoUrl540",
        ]
        ranked = []
        for key in keys:
            val = payload.get(key)
            if isinstance(val, str) and val.startswith("http"):
                ranked.append((_quality_rank(key), val))
        ranked.sort(key=lambda r: r[0])
        ordered.extend(u for _, u in ranked)
        ql = payload.get("qualityList") or payload.get("qualities")
        if ql:
            ordered.extend(_quality_urls_ordered(ql))

    deduped = _dedupe_urls(ordered)
    primary = [u for u in deduped if "workers.dev" not in u.lower()]
    workers = [u for u in deduped if "workers.dev" in u.lower()]
    return primary + workers


def _pick_playable_variant(master_text: str, master_url: str) -> str:
    """From a master playlist, prefer a mid-quality (~720p) media playlist.

    If the master declares demuxed AUDIO via EXT-X-MEDIA, keep the master URL —
    DramaWave (and similar) variants are video-only; audio lives in a sibling playlist
    that HLS.js only discovers from the master.
    """
    if re.search(r"#EXT-X-MEDIA:[^\n]*TYPE=AUDIO", master_text, re.I):
        return master_url

    base = master_url.rsplit("/", 1)[0] + "/"
    variants = []
    lines = master_text.splitlines()
    for i, line in enumerate(lines):
        if not line.startswith("#EXT-X-STREAM-INF:"):
            continue
        uri = ""
        for j in range(i + 1, len(lines)):
            cand = lines[j].strip()
            if not cand or cand.startswith("#"):
                continue
            uri = cand
            break
        if not uri:
            continue
        height = 0
        bandwidth = 0
        m_res = re.search(r"RESOLUTION=(\d+)x(\d+)", line)
        if m_res:
            height = int(m_res.group(2))
        m_bw = re.search(r"BANDWIDTH=(\d+)", line)
        if m_bw:
            bandwidth = int(m_bw.group(1))
        variants.append((height, bandwidth, urljoin(base, uri)))
    if not variants:
        return master_url
    prefer = sorted(
        variants,
        key=lambda v: (
            0 if (v[0] or 0) >= 540 else 1,
            abs((v[0] or 720) - 720),
            -(v[0] or 0),
            -v[1],
        ),
    )
    return prefer[0][2]


_DEMUX_VARIANT_RE = re.compile(
    r"^(https?://.+adaptiveDynamicStreaming_\d+)_\d+(\.m3u8)(\?.*)?$",
    re.I,
)


def prefer_hls_master_url(url: str) -> str:
    """Upgrade DramaWave-style video-only variant playlists to their master.

    Example:
      .../adaptiveDynamicStreaming_1301549_4.m3u8
        → .../adaptiveDynamicStreaming_1301549.m3u8
    """
    if not url:
        return url
    m = _DEMUX_VARIANT_RE.match(url.strip())
    if m:
        return f"{m.group(1)}{m.group(2)}{m.group(3) or ''}"
    return url


async def _probe_playable_url(client: httpx.AsyncClient, url: str) -> str:
    """Lightweight probe (Range) — return playable URL or ''."""
    url = prefer_hls_master_url(url)
    headers = {"User-Agent": "SeryeKo/1.0", "Range": "bytes=0-4095"}
    try:
        resp = await client.get(url, headers=headers, follow_redirects=True)
    except Exception:
        return ""
    if resp.status_code not in (200, 206) and resp.status_code >= 400:
        return ""
    body = resp.content
    ctype = (resp.headers.get("content-type") or "").lower()
    final_url = prefer_hls_master_url(str(resp.url))
    path = final_url.split("?", 1)[0].lower()

    if body.lstrip().startswith(b"#EXTM3U") or "mpegurl" in ctype or path.endswith(".m3u8"):
        text = body.decode("utf-8", errors="ignore")
        if "#EXT-X-STREAM-INF:" in text:
            # May be truncated by Range — refetch full master when needed
            if text.count(".m3u8") < 1 or not any(
                ln.strip() and not ln.startswith("#") for ln in text.splitlines()
            ):
                try:
                    full = await client.get(url, headers={"User-Agent": "SeryeKo/1.0"}, follow_redirects=True)
                    if full.status_code < 400:
                        text = full.content.decode("utf-8", errors="ignore")
                        final_url = prefer_hls_master_url(str(full.url))
                except Exception:
                    pass
            if "#EXT-X-STREAM-INF:" in text:
                return _pick_playable_variant(text, final_url)
        if "#EXTINF:" in text or "#EXT-X-MAP:" in text or text.lstrip().startswith("#EXTM3U"):
            # Media playlist — if it looks like a demuxed video variant, try master
            master = prefer_hls_master_url(final_url)
            if master != final_url:
                try:
                    mresp = await client.get(
                        master, headers={"User-Agent": "SeryeKo/1.0"}, follow_redirects=True
                    )
                    if mresp.status_code < 400:
                        mtext = mresp.content.decode("utf-8", errors="ignore")
                        if re.search(r"#EXT-X-MEDIA:[^\n]*TYPE=AUDIO", mtext, re.I):
                            return str(mresp.url)
                except Exception:
                    pass
            return final_url
        return ""

    if (
        "video" in ctype
        or "mp4" in ctype
        or "octet-stream" in ctype
        or path.endswith(".mp4")
        or b"ftyp" in body[:64]
        or "mime_type=video" in final_url
    ):
        return final_url
    return ""


async def pick_first_playable(client: httpx.AsyncClient, candidates: Sequence[str]) -> str:
    """Try candidates in order; return first that responds as playable media.

    Skip the CDN probe when a candidate is an obvious media URL — FreeReels/RaptDrama
    style lists otherwise pay tens of ms per episode (and worse when done sequentially).
    """
    cleaned = _dedupe_urls(candidates)
    if not cleaned:
        return ""

    def _looks_direct_media(url: str) -> bool:
        low = (url or "").lower()
        path = low.split("?", 1)[0]
        return (
            path.endswith((".m3u8", ".mp4", ".m4v", ".mov", ".webm"))
            or "b-cdn.net" in low
            or "mydramawave.com" in low
            or "mime_type=video" in low
            or "/playlet-hls/" in low
            or "dramaboxdb.com" in low
        )

    # Prefer first obvious media URL without probing
    for url in cleaned:
        only = prefer_hls_master_url(url)
        if _looks_direct_media(only):
            return only

    if len(cleaned) == 1:
        only = prefer_hls_master_url(cleaned[0])
        playable = await _probe_playable_url(client, only)
        return playable or only

    for url in cleaned:
        playable = await _probe_playable_url(client, url)
        if playable:
            return playable
    return cleaned[0]


def _pick_quality_url(quality_list: Any) -> str:
    urls = _quality_urls_ordered(quality_list)
    return urls[0] if urls else ""


def pick_quality_entry(quality_list: Any, preferred_url: Optional[str] = None, prefer_fast: bool = False) -> Dict[str, str]:
    """Pick best qualityList row; prefer preferred_url match. Returns url/key/kid/label.

    prefer_fast: bias toward 480p/540p so Melolo client-side decrypt starts sooner.
    """
    if not isinstance(quality_list, list):
        quality_list = []
    rows: List[tuple] = []
    for q in quality_list:
        if not isinstance(q, dict):
            continue
        label = str(q.get("label") or q.get("quality") or q.get("definition") or "")
        url = q.get("url") or q.get("play_url") or q.get("playUrl") or q.get("videoUrl") or ""
        if not isinstance(url, str) or not url.startswith("http"):
            continue
        key = str(q.get("key") or "")
        kid = str(q.get("kid") or "")
        rank = _quality_rank(label)
        if prefer_fast:
            # Prefer mid quality for encrypted progressive downloads
            lab = label.lower()
            if "480" in lab or "540" in lab:
                rank = -1
            elif "360" in lab:
                rank = 0
            elif "720" in lab:
                rank = 1
            elif "1080" in lab:
                rank = 2
        rows.append((rank, url, key, kid, label))
    rows.sort(key=lambda r: r[0])

    if preferred_url and not prefer_fast:
        for rank, url, key, kid, label in rows:
            if url == preferred_url:
                return {"url": url, "key": key, "kid": kid, "label": label}

    if rows:
        _, url, key, kid, label = rows[0]
        return {"url": url, "key": key, "kid": kid, "label": label}

    if preferred_url and isinstance(preferred_url, str) and preferred_url.startswith("http"):
        return {"url": preferred_url, "key": "", "kid": "", "label": ""}
    return {"url": "", "key": "", "kid": "", "label": ""}


class EpisodeFetcher:
    def __init__(self, client: httpx.AsyncClient, api_key: str):
        self.client = client
        self.key = api_key

    async def fetch(self, provider: str, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        handler = getattr(self, f"_fetch_{provider}", None)
        if not handler:
            return []
        try:
            return await handler(orig_id, drama_id)
        except Exception as e:
            print(f"Episode fetch failed for {provider}/{orig_id}: {e}")
            return []

    async def _get_json(self, url: str, headers: Optional[Dict[str, str]] = None) -> Any:
        hdrs = {
            "User-Agent": "SeryeKo/1.0",
            "x-token": self.key,
            **(headers or {}),
        }
        resp = await self.client.get(url, headers=hdrs)
        if resp.status_code >= 400:
            return None
        try:
            return resp.json()
        except Exception:
            return None

    async def _resolve_url(self, *candidates: Optional[str], quality_list: Any = None, **kwargs) -> str:
        cands = collect_stream_candidates(*candidates, quality_list=quality_list, **kwargs)
        return await pick_first_playable(self.client, cands)

    # ── DramaBox ──────────────────────────────────────────────
    async def _fetch_dramabox(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        url = f"https://dramabox.goodbos.online/api/dramabox/allepisode?bookId={orig_id}"
        raw = await self._get_json(url, headers={"x-token": self.key})
        if not isinstance(raw, list):
            return []
        sem = asyncio.Semaphore(8)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            async with sem:
                v_url = await self._resolve_url(
                    ep.get("videoUrl720"),
                    ep.get("videoUrl1080"),
                    ep.get("videoUrl540"),
                    ep.get("videoUrl"),
                    payload=ep,
                )
            return {
                "id": f"{orig_id}_{ep.get('chapterId', idx+1)}",
                "episode_num": idx + 1,
                "title": ep.get("chapterName") or f"EP {idx+1}",
                "video_url": v_url,
                "is_locked": bool(ep.get("isLocked", False)),
                "cover": pick_episode_cover(ep),
            }

        return list(await asyncio.gather(*[one(i, ep) for i, ep in enumerate(raw)]))

    # ── ShortMax ──────────────────────────────────────────────
    async def _fetch_shortmax(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        url = f"https://shortmax.goodbos.online/api/v1/alleps/{orig_id}?lang=en&code={self.key}"
        data = await self._get_json(url)
        raw = ((data or {}).get("data") or {}).get("episodes") or []
        sem = asyncio.Semaphore(8)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            video = ep.get("video") or {}
            async with sem:
                v_url = await self._resolve_url(
                    video_obj=video,
                    quality_list=ep.get("qualityList"),
                    payload=ep,
                )
            return {
                "id": f"{orig_id}_{ep.get('id', idx+1)}",
                "episode_num": ep.get("episode") or (idx + 1),
                "title": ep.get("name") or f"Episode {ep.get('episode') or idx + 1}",
                "video_url": v_url,
                "is_locked": ep.get("is_lock", 0) == 1,
                "cover": pick_episode_cover(ep),
                "duration": ep.get("duration"),
            }

        return list(await asyncio.gather(*[one(i, ep) for i, ep in enumerate(raw)]))

    # ── DramaWave ─────────────────────────────────────────────
    async def _fetch_dramawave(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        url = f"https://dramawave.goodbos.online/api/drama/{orig_id}?lang=en&code={self.key}"
        payload = await self._get_json(url)
        data = (payload or {}).get("data") or {}
        items = data.get("items") or []
        if not items:
            return []

        sem = asyncio.Semaphore(6)

        async def resolve_url(ep: Dict[str, Any]) -> str:
            async with sem:
                # Prefer master m3u8 (has demuxed AUDIO) over quality-specific variants
                return await self._resolve_url(
                    ep.get("m3u8_path"),
                    ep.get("720p_mp4"),
                    ep.get("1080p_mp4"),
                    ep.get("540p_mp4"),
                    payload=ep,
                )

        head = items[:10]
        head_urls = await asyncio.gather(*[resolve_url(ep) for ep in head])

        out = []
        for idx, ep in enumerate(items):
            if idx < len(head_urls):
                v_url = head_urls[idx]
            else:
                cands = collect_stream_candidates(payload=ep)
                v_url = cands[0] if cands else ""
            free = str(ep.get("video_type", "")).lower() == "free" or ep.get("free") is True
            out.append({
                "id": f"{orig_id}_{ep.get('id', idx+1)}",
                "episode_num": ep.get("serial_number") or (idx + 1),
                "title": ep.get("name") or f"Episode {ep.get('serial_number') or idx + 1}",
                "video_url": v_url,
                "is_locked": (not free) and idx >= 3,
                "cover": pick_episode_cover(ep),
            })
        return out

    # ── Melolo ────────────────────────────────────────────────
    async def _fetch_melolo(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        detail = await self._get_json(
            f"https://melolo.goodbos.online/api/detail/{orig_id}?lang=en&code={self.key}"
        )
        videos = (detail or {}).get("videos") or []
        if not videos:
            videos = [{"episode": 1, "vid": "", "duration": None}]

        sem = asyncio.Semaphore(10)

        async def load_one(meta: Dict[str, Any]) -> Dict[str, Any]:
            num = int(meta.get("episode") or 0) or 1
            v_url = ""
            drm_key = ""
            locked = False
            title = f"Episode {num}"
            async with sem:
                data = await self._get_json(
                    f"https://melolo.goodbos.online/api/video?id={orig_id}&ep={num}&lang=en&code={self.key}"
                )
                if isinstance(data, dict):
                    # Melolo qualityList is CENC AES-CTR; pick best quality + keep decrypt key.
                    # Range probes look "playable" even when encrypted, so skip probe and use key.
                    chosen = pick_quality_entry(
                        data.get("qualityList"),
                        preferred_url=data.get("videoUrl"),
                        prefer_fast=True,
                    )
                    v_url = chosen.get("url") or data.get("videoUrl") or ""
                    drm_key = chosen.get("key") or ""
                    if not v_url:
                        v_url = await self._resolve_url(
                            data.get("videoUrl"),
                            quality_list=data.get("qualityList"),
                            payload=data,
                        )
                    locked = bool(data.get("locked"))
                    title = data.get("title") or title
            out = {
                "id": f"{orig_id}_{meta.get('vid') or num}",
                "episode_num": num,
                "title": title,
                "video_url": v_url,
                "is_locked": locked,
                "duration": meta.get("duration"),
                "cover": (detail or {}).get("cover", ""),
            }
            if drm_key:
                out["drm_key"] = drm_key
            return out

        results = await asyncio.gather(*[load_one(v) for v in videos])
        results.sort(key=lambda e: e["episode_num"])
        return results

    # ── FlexTV ────────────────────────────────────────────────
    async def _fetch_flextv(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://flextv.goodbos.online/api/allepisodes?id={orig_id}&lang=en&code={self.key}"
        )
        raw = ((data or {}).get("data") or {}).get("episodes") or []
        sem = asyncio.Semaphore(8)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            async with sem:
                v_url = await self._resolve_url(
                    quality_list=ep.get("qualityList") or ep.get("qualities"),
                    payload=ep,
                )
            return {
                "id": f"{orig_id}_{ep.get('no', idx+1)}",
                "episode_num": ep.get("no") or (idx + 1),
                "title": ep.get("title") or f"Episode {ep.get('no') or idx + 1}",
                "video_url": v_url,
                "is_locked": not bool(ep.get("unlocked", True)),
                "duration": ep.get("duration"),
            }

        return list(await asyncio.gather(*[one(i, ep) for i, ep in enumerate(raw)]))

    # ── ReelBuzz ──────────────────────────────────────────────
    async def _fetch_reelbuzz(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://reelbuzz.goodbos.online/api/drama/detail?id={orig_id}&lang=en&code={self.key}"
        )
        rows = (data or {}).get("rows") or {}
        eps = rows.get("episodeList") or []

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            v_url = await self._resolve_url(
                unwrap_decrypt_proxy_url(ep.get("fileUrl") or ""),
                unwrap_decrypt_proxy_url(ep.get("playURL") or ""),
                quality_list=ep.get("qualityList"),
                payload=ep,
            )
            return {
                "id": f"{orig_id}_{ep.get('id', idx+1)}",
                "episode_num": ep.get("episodeNo") or (idx + 1),
                "title": ep.get("title") or f"Episode {ep.get('episodeNo') or idx + 1}",
                "video_url": v_url,
                "is_locked": str(ep.get("paid", "Y")).upper() != "Y" and str(ep.get("charge", "N")).upper() == "Y",
                "cover": ep.get("coverUrl", ""),
            }

        head_n = min(len(eps), 6)
        sem = asyncio.Semaphore(6)

        async def guarded(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            async with sem:
                return await one(idx, ep)

        head = list(await asyncio.gather(*[guarded(i, ep) for i, ep in enumerate(eps[:head_n])]))
        out = list(head)
        for idx, ep in enumerate(eps[head_n:], start=head_n):
            cands = collect_stream_candidates(
                unwrap_decrypt_proxy_url(ep.get("fileUrl") or ""),
                quality_list=ep.get("qualityList"),
                payload=ep,
            )
            out.append({
                "id": f"{orig_id}_{ep.get('id', idx+1)}",
                "episode_num": ep.get("episodeNo") or (idx + 1),
                "title": ep.get("title") or f"Episode {ep.get('episodeNo') or idx + 1}",
                "video_url": cands[0] if cands else "",
                "is_locked": str(ep.get("paid", "Y")).upper() != "Y" and str(ep.get("charge", "N")).upper() == "Y",
                "cover": ep.get("coverUrl", ""),
            })
        return out

    # ── Reelife ───────────────────────────────────────────────
    async def _fetch_reelife(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://reelife.goodbos.online/api/v1/book/{orig_id}/chapters?lang=en&code={self.key}"
        )
        chapters = ((data or {}).get("data") or {}).get("chapterList") or []
        if not chapters:
            return []

        sem = asyncio.Semaphore(8)

        async def load_one(ch: Dict[str, Any], idx: int) -> Dict[str, Any]:
            chapter_id = ch.get("chapterId") or str(idx + 1)
            num = idx + 1
            if ch.get("index") is not None:
                try:
                    num = int(ch["index"]) + 1
                except Exception:
                    num = idx + 1
            async with sem:
                play = await self._get_json(
                    f"https://reelife.goodbos.online/api/v1/play/{orig_id}/{chapter_id}?lang=en&code={self.key}"
                )
            v_url = ""
            if isinstance(play, dict):
                standby = play.get("standbyUrls") or []
                v_url = await self._resolve_url(
                    play.get("videoUrl"),
                    quality_list=play.get("qualityList"),
                    standby=standby,
                    payload=play,
                )
            return {
                "id": f"{orig_id}_{chapter_id}",
                "episode_num": num,
                "title": ch.get("chapterName") or f"Episode {num}",
                "video_url": v_url,
                "is_locked": bool(ch.get("isChargeChapter") or ch.get("isCharge") == 0 and False) or bool(ch.get("isCharge") == 1 and ch.get("price", 0) > 0 and num > 3),
                "cover": pick_episode_cover(ch),
            }

        to_fetch = chapters[:40]
        fetched = await asyncio.gather(*[load_one(ch, i) for i, ch in enumerate(to_fetch)])
        by_num = {e["episode_num"]: e for e in fetched}

        out = []
        for i, ch in enumerate(chapters):
            num = i + 1
            if ch.get("index") is not None:
                try:
                    num = int(ch["index"]) + 1
                except Exception:
                    num = i + 1
            if num in by_num:
                out.append(by_num[num])
            else:
                out.append({
                    "id": f"{orig_id}_{ch.get('chapterId', i+1)}",
                    "episode_num": num,
                    "title": ch.get("chapterName") or f"Episode {num}",
                    "video_url": "",
                    "is_locked": num > 3,
                    "cover": pick_episode_cover(ch),
                })
        out.sort(key=lambda e: e["episode_num"])
        return out

    # ── ShortsWave ────────────────────────────────────────────
    async def _fetch_shortswave(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://shortwave.goodbos.online/api/drama/{orig_id}/episodes?lang=en&code={self.key}"
        )
        raw = (data or {}).get("data") or []
        out = []
        for idx, ep in enumerate(raw):
            chapter_id = ep.get("chapter_id") or ""
            num = ep.get("chapter_index") or (idx + 1)
            v_url = ""
            if chapter_id:
                v_url = f"https://shortwave.goodbos.online/api/stream/{orig_id}/{chapter_id}/v.m3u8?code={self.key}"
            out.append({
                "id": f"{orig_id}_{chapter_id or num}",
                "episode_num": num,
                "title": ep.get("chapter_name") or f"Episode {num}",
                "video_url": v_url,
                "is_locked": not bool(ep.get("is_free", 1)),
                "cover": pick_episode_cover(ep),
            })
        return out

    # ── CubeTV ────────────────────────────────────────────────
    async def _fetch_cubetv(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        """CubeTV episodes + signed HLS in videoUrls.

        Pre-shelf / not-yet-published titles (often labeled New on /api/home) return
        total=0 with empty rows even when /api/detail has firstEpisodeid + totalEpisodeNum.
        Do not invent streams — callers must surface unavailable instead of demo MP4.
        """
        data = await self._get_json(
            f"https://cubetv.goodbos.online/api/episodes/{orig_id}?lang=en&code={self.key}"
        )
        rows = (data or {}).get("rows") or []
        if not rows:
            # Confirm title exists; still no playable HLS until CubeTV publishes rows
            detail = await self._get_json(
                f"https://cubetv.goodbos.online/api/detail/{orig_id}?lang=en&code={self.key}"
            )
            meta = (detail or {}).get("data") if isinstance(detail, dict) else None
            if isinstance(meta, dict) and meta.get("videoid"):
                print(
                    f"CubeTV {orig_id}: detail ok (eps={meta.get('totalEpisodeNum')}, "
                    f"shelf={meta.get('shelfTime')}) but /api/episodes empty"
                )
            return []

        sem = asyncio.Semaphore(8)

        def _locked(ep: Dict[str, Any]) -> bool:
            # lockStatus 1 = unlocked/free on CubeTV; chargeCoin>0 means paid
            return ep.get("lockStatus", 1) != 1 and int(ep.get("chargeCoin") or 0) > 0

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            async with sem:
                # Prefer first candidate — CubeTV signed HLS is already playable;
                # full HEAD probe on 50+ long STS URLs is slow and can flake.
                cands = collect_stream_candidates(video_urls=ep.get("videoUrls"), payload=ep)
                v_url = cands[0] if cands else ""
                if not v_url:
                    v_url = await self._resolve_url(video_urls=ep.get("videoUrls"), payload=ep)
            return {
                "id": f"{orig_id}_{ep.get('episodeid', idx+1)}",
                "episode_num": ep.get("episodeNumber") or (idx + 1),
                "title": ep.get("episodeTitle") or f"Episode {ep.get('episodeNumber') or idx + 1}",
                "video_url": v_url,
                "is_locked": _locked(ep),
                "duration": ep.get("duration"),
            }

        head_n = min(len(rows), 8)
        head = list(await asyncio.gather(*[one(i, ep) for i, ep in enumerate(rows[:head_n])]))
        out = list(head)
        for idx, ep in enumerate(rows[head_n:], start=head_n):
            cands = collect_stream_candidates(video_urls=ep.get("videoUrls"), payload=ep)
            out.append({
                "id": f"{orig_id}_{ep.get('episodeid', idx+1)}",
                "episode_num": ep.get("episodeNumber") or (idx + 1),
                "title": ep.get("episodeTitle") or f"Episode {ep.get('episodeNumber') or idx + 1}",
                "video_url": cands[0] if cands else "",
                "is_locked": _locked(ep),
                "duration": ep.get("duration"),
            })
        return [ep for ep in out if ep.get("video_url")]

    # ── MoboReels ─────────────────────────────────────────────
    async def _fetch_moboreels(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://moboreels.goodbos.online/api/v1/series/{orig_id}?lang=en&code={self.key}"
        )
        raw = ((data or {}).get("data") or {}).get("episodes") or []
        sem = asyncio.Semaphore(8)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            async with sem:
                v_url = await self._resolve_url(
                    ep.get("mediaUrl"),
                    quality_list=ep.get("qualityList"),
                    payload=ep,
                )
            return {
                "id": f"{orig_id}_{ep.get('episId', idx+1)}",
                "episode_num": ep.get("episNum") or (idx + 1),
                "title": f"Episode {ep.get('episNum') or idx + 1}",
                "video_url": v_url,
                "is_locked": bool(ep.get("isLock")) and not bool(ep.get("isFree")),
                "cover": ep.get("coverUrl", ""),
                "duration": ep.get("duration"),
            }

        return list(await asyncio.gather(*[one(i, ep) for i, ep in enumerate(raw)]))

    # ── Vigloo ────────────────────────────────────────────────
    async def _fetch_vigloo(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://vigloo.goodbos.online/api/episodes?id={orig_id}&lang=en&code={self.key}"
        )
        raw = (
            (data or {}).get("payloads")
            or (data or {}).get("episodes")
            or (data or {}).get("data")
            or []
        )
        if isinstance(data, list):
            raw = data
        if not isinstance(raw, list) or not raw:
            return []

        sem = asyncio.Semaphore(6)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            num = int(ep.get("episodeNumber") or ep.get("episode") or ep.get("number") or (idx + 1))
            season_id = ep.get("seasonId") or ""
            v_url = ""
            cf_cookies: Dict[str, str] = {}
            async with sem:
                play = await self._get_json(
                    "https://vigloo.goodbos.online/api/play"
                    f"?seasonId={season_id}&ep={num}&lang=en&code={self.key}"
                )
            if isinstance(play, dict) and (play.get("status") or "").upper() == "OK":
                payload = play.get("payload") if isinstance(play.get("payload"), dict) else {}
                v_url = str(payload.get("url") or "")
                cf = play.get("cloudfront") if isinstance(play.get("cloudfront"), dict) else {}
                if cf.get("CloudFront-Policy") and cf.get("CloudFront-Signature") and cf.get("CloudFront-Key-Pair-Id"):
                    cf_cookies = {
                        "CloudFront-Policy": str(cf["CloudFront-Policy"]),
                        "CloudFront-Signature": str(cf["CloudFront-Signature"]),
                        "CloudFront-Key-Pair-Id": str(cf["CloudFront-Key-Pair-Id"]),
                    }
            row: Dict[str, Any] = {
                "id": f"{orig_id}_{ep.get('id', num)}",
                "episode_num": num,
                "title": ep.get("title") or f"Episode {num}",
                "video_url": v_url,
                "is_locked": bool(ep.get("locked") or ep.get("isLocked")) and not v_url,
                "cover": ep.get("cover") or ep.get("thumbnail") or "",
                "duration": ep.get("duration"),
                "season_id": str(season_id or ""),
            }
            if cf_cookies:
                row["cf_cookies"] = cf_cookies
            return row

        return list(await asyncio.gather(*[one(i, ep) for i, ep in enumerate(raw) if isinstance(ep, dict)]))

    async def refresh_vigloo_play(
        self,
        orig_id: str,
        episode_num: int,
        season_id: str = "",
    ) -> Optional[Dict[str, Any]]:
        """Fetch a fresh play URL + CloudFront cookies for one Vigloo episode."""
        sid = (season_id or "").strip()
        if not sid:
            data = await self._get_json(
                f"https://vigloo.goodbos.online/api/episodes?id={orig_id}&lang=en&code={self.key}"
            )
            raw = (
                (data or {}).get("payloads")
                or (data or {}).get("episodes")
                or (data or {}).get("data")
                or []
            )
            if isinstance(data, list):
                raw = data
            if isinstance(raw, list):
                for i, ep in enumerate(raw):
                    if not isinstance(ep, dict):
                        continue
                    num = int(ep.get("episodeNumber") or ep.get("episode") or ep.get("number") or (i + 1))
                    if num == int(episode_num):
                        sid = str(ep.get("seasonId") or "")
                        break
        if not sid:
            return None

        play = await self._get_json(
            "https://vigloo.goodbos.online/api/play"
            f"?seasonId={sid}&ep={int(episode_num)}&lang=en&code={self.key}"
        )
        if not isinstance(play, dict) or (play.get("status") or "").upper() != "OK":
            return None
        payload = play.get("payload") if isinstance(play.get("payload"), dict) else {}
        v_url = str(payload.get("url") or "")
        cf = play.get("cloudfront") if isinstance(play.get("cloudfront"), dict) else {}
        cf_cookies: Dict[str, str] = {}
        if cf.get("CloudFront-Policy") and cf.get("CloudFront-Signature") and cf.get("CloudFront-Key-Pair-Id"):
            cf_cookies = {
                "CloudFront-Policy": str(cf["CloudFront-Policy"]),
                "CloudFront-Signature": str(cf["CloudFront-Signature"]),
                "CloudFront-Key-Pair-Id": str(cf["CloudFront-Key-Pair-Id"]),
            }
        if not v_url or not cf_cookies:
            return None
        return {
            "video_url": v_url,
            "cf_cookies": cf_cookies,
            "season_id": sid,
            "episode_num": int(episode_num),
        }

    # ── Serial+ ───────────────────────────────────────────────
    async def _fetch_serialplus(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://serealplus.goodbos.online/api/episodes?id={orig_id}&lang=en&code={self.key}"
        )
        raw = (data or {}).get("data") or (data or {}).get("list") or (data or {}).get("episodes") or []
        if not isinstance(raw, list) or not raw:
            return []

        sem = asyncio.Semaphore(8)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            async with sem:
                v_url = await self._resolve_url(
                    quality_list=ep.get("qualityList"),
                    payload=ep,
                )
            return {
                "id": f"{orig_id}_{ep.get('id', idx+1)}",
                "episode_num": ep.get("episode") or ep.get("number") or (idx + 1),
                "title": ep.get("title") or ep.get("name") or f"Episode {idx + 1}",
                "video_url": v_url,
                "is_locked": bool(ep.get("locked")),
                "cover": ep.get("cover", ""),
            }

        return list(await asyncio.gather(*[
            one(i, ep) for i, ep in enumerate(raw) if isinstance(ep, dict)
        ]))

    # ── DramaNova ─────────────────────────────────────────────
    async def _fetch_dramanova(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://dramanova.goodbos.online/api/episodes/{orig_id}?lang=en&code={self.key}"
        )
        raw = (data or {}).get("data") or (data or {}).get("rows") or (data or {}).get("episodes") or []
        if not isinstance(raw, list) or not raw:
            return []

        sem = asyncio.Semaphore(8)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            async with sem:
                v_url = await self._resolve_url(
                    quality_list=ep.get("qualityList"),
                    payload=ep,
                )
            return {
                "id": f"{orig_id}_{ep.get('id', idx+1)}",
                "episode_num": ep.get("episode") or ep.get("number") or (idx + 1),
                "title": ep.get("title") or ep.get("name") or f"Episode {idx + 1}",
                "video_url": v_url,
                "is_locked": bool(ep.get("locked") or ep.get("is_lock")),
                "cover": ep.get("cover", ""),
            }

        return list(await asyncio.gather(*[
            one(i, ep) for i, ep in enumerate(raw) if isinstance(ep, dict)
        ]))

    # ── NetShort ──────────────────────────────────────────────
    async def _fetch_netshort(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        detail = await self._get_json(
            f"https://netshort.goodbos.online/api/drama/{orig_id}?lang=en&code={self.key}"
        )
        ep_count = 0
        data = detail or {}
        if isinstance(data.get("data"), dict):
            ep_count = int(data["data"].get("episodeCount") or data["data"].get("episodes") or 0)
        if not ep_count:
            ep_count = 10
        sem = asyncio.Semaphore(6)

        async def load_one(num: int) -> Dict[str, Any]:
            async with sem:
                play = await self._get_json(
                    f"https://netshort.goodbos.online/api/watch/{orig_id}/{num}?lang=en&code={self.key}"
                )
            v_url = ""
            title = f"Episode {num}"
            if isinstance(play, dict):
                inner = play.get("data") if isinstance(play.get("data"), dict) else play
                v_url = await self._resolve_url(
                    quality_list=inner.get("qualityList"),
                    payload=inner,
                )
                title = inner.get("title") or title
            return {
                "id": f"{orig_id}_{num}",
                "episode_num": num,
                "title": title,
                "video_url": v_url,
                "is_locked": num > 3 and not v_url,
            }

        results = await asyncio.gather(*[load_one(i) for i in range(1, min(ep_count, 30) + 1)])
        return [r for r in results if r]

    # ── StarShort (Drakula) ───────────────────────────────────
    async def _fetch_starshort(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://drakula.goodbos.online/api/starshort/show/{orig_id}/episodes?lang=en&code={self.key}"
        )
        raw = (
            ((data or {}).get("data") or {}).get("episodes")
            if isinstance((data or {}).get("data"), dict)
            else None
        ) or (data or {}).get("data") or (data or {}).get("episodes") or (data or {}).get("list") or []
        if not isinstance(raw, list):
            return []

        sem = asyncio.Semaphore(6)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            num = int(ep.get("episode") or ep.get("number") or (idx + 1))
            src: Dict[str, Any] = ep
            if not (ep.get("video_url") or ep.get("url") or ep.get("qualityList")):
                async with sem:
                    play = await self._get_json(
                        f"https://drakula.goodbos.online/api/starshort/watch/{orig_id}/{num}?lang=en&code={self.key}"
                    )
                if isinstance(play, dict):
                    inner = play.get("data") if isinstance(play.get("data"), dict) else play
                    if isinstance(inner, dict):
                        src = inner
            v_url = await self._resolve_url(
                quality_list=src.get("qualityList") if isinstance(src, dict) else None,
                payload=src if isinstance(src, dict) else ep,
            )
            return {
                "id": f"{orig_id}_{num}",
                "episode_num": num,
                "title": (src.get("title") if isinstance(src, dict) else None) or ep.get("title") or f"Episode {num}",
                "video_url": v_url,
                "is_locked": bool(ep.get("locked")) or (not bool(ep.get("free", True)) and not v_url),
                "cover": pick_episode_cover(ep),
            }

        return list(await asyncio.gather(*[one(i, ep) for i, ep in enumerate(raw) if isinstance(ep, dict)]))

    # ── FlickReels ────────────────────────────────────────────
    async def _fetch_flickreels(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        # Auth is `code=` (token= returns "Invalid or missing code")
        data = await self._get_json(
            f"https://flickreels.goodbos.online/batchload/{orig_id}?lang=en&code={self.key}"
        )
        raw = ((data or {}).get("data") or {}).get("list") or []
        if not isinstance(raw, list) or not raw:
            return []

        out: List[Dict[str, Any]] = []
        for idx, ep in enumerate(raw):
            if not isinstance(ep, dict):
                continue
            num = int(ep.get("chapter_num") or (idx + 1))
            # HLS URL is already signed — take it directly
            v_url = (ep.get("hls_url") or "").strip() or ""
            if not v_url:
                v_url = await self._resolve_url(payload=ep)
            out.append({
                "id": str(ep.get("chapter_id") or f"{orig_id}_{num}"),
                "episode_num": num,
                "title": ep.get("chapter_title") or f"Episode {num}",
                "video_url": v_url,
                "is_locked": bool(ep.get("is_lock")) or bool(ep.get("is_need_pay")),
                "cover": pick_episode_cover(ep),
                "duration": ep.get("duration"),
            })
        return out

    # ── FreeReels (Drakula / DramaWave CDN) ───────────────────
    async def _fetch_freereels(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://drakula.goodbos.online/api/freereels/drama/{orig_id}/episodes?lang=en&code={self.key}"
        )
        root = (data or {}).get("data") if isinstance(data, dict) else None
        if isinstance(root, dict) and isinstance(root.get("data"), dict):
            root = root["data"]
        raw = (root or {}).get("items") if isinstance(root, dict) else []
        if not isinstance(raw, list) or not raw:
            # Fallback: drama detail embeds episode_list (m3u8 fields)
            detail = await self._get_json(
                f"https://drakula.goodbos.online/api/freereels/drama/{orig_id}?lang=en&code={self.key}"
            )
            info = (((detail or {}).get("data") or {}).get("data") or {}).get("info") or {}
            raw = info.get("episode_list") or []

        if not isinstance(raw, list) or not raw:
            return []

        sem = asyncio.Semaphore(8)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            num = int(ep.get("serial_number") or ep.get("index") or (idx + 1))
            async with sem:
                v_url = await self._resolve_url(
                    ep.get("720p_mp4"),
                    ep.get("1080p_mp4"),
                    ep.get("540p_mp4"),
                    ep.get("m3u8_path"),
                    ep.get("external_audio_h264_m3u8"),
                    ep.get("m3u8_url"),
                    payload=ep,
                )
            return {
                "id": str(ep.get("id") or f"{orig_id}_{num}"),
                "episode_num": num,
                "title": ep.get("name") or f"Episode {num}",
                "video_url": v_url,
                "is_locked": (ep.get("video_type") or "").lower() not in ("", "free") and not v_url,
                "cover": pick_episode_cover(ep),
            }

        return list(await asyncio.gather(*[
            one(i, ep) for i, ep in enumerate(raw) if isinstance(ep, dict)
        ]))

    # ── MicroDrama (Drakula) ──────────────────────────────────
    async def _fetch_microdrama(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        detail = await self._get_json(
            f"https://drakula.goodbos.online/api/microdrama/drama/{orig_id}?lang=en&code={self.key}"
        )
        meta = (detail or {}).get("data") if isinstance(detail, dict) else {}
        try:
            ep_count = int((meta or {}).get("total_episodes") or 0)
        except (TypeError, ValueError):
            ep_count = 0
        if ep_count <= 0:
            ep_count = 30

        sem = asyncio.Semaphore(6)

        async def one(num: int) -> Optional[Dict[str, Any]]:
            async with sem:
                play = await self._get_json(
                    f"https://drakula.goodbos.online/api/microdrama/play/{orig_id}/{num}?lang=en&code={self.key}"
                )
            if not isinstance(play, dict):
                return None
            inner = play.get("data") if isinstance(play.get("data"), dict) else play
            videos = (inner or {}).get("videos") if isinstance(inner, dict) else None
            v_url = await self._resolve_url(quality_list=videos, payload=inner if isinstance(inner, dict) else None)
            if not v_url:
                return None
            return {
                "id": f"{orig_id}_{num}",
                "episode_num": num,
                "title": f"Episode {num}",
                "video_url": v_url,
                "is_locked": False,
            }

        results = await asyncio.gather(*[one(i) for i in range(1, min(ep_count, 80) + 1)])
        return [r for r in results if r]

    # ── FlareFlow ─────────────────────────────────────────────
    async def _fetch_flareflow(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://plerplow.goodbos.online/api/episodes?id={orig_id}&lang=en&code={self.key}"
        )
        raw = (data or {}).get("episodes") or (data or {}).get("data") or []
        if not isinstance(raw, list) or not raw:
            return []

        sem = asyncio.Semaphore(8)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            num = int(ep.get("episode") or (idx + 1))
            qualities = ep.get("qualities") or {}
            async with sem:
                v_url = await self._resolve_url(quality_list=qualities, payload=ep)
            return {
                "id": f"{orig_id}_{num}",
                "episode_num": num,
                "title": f"Episode {num}",
                "video_url": v_url,
                "is_locked": bool(ep.get("locked")) and not v_url,
                "cover": pick_episode_cover(ep),
            }

        return list(await asyncio.gather(*[
            one(i, ep) for i, ep in enumerate(raw) if isinstance(ep, dict)
        ]))

    # ── HappyShort ────────────────────────────────────────────
    async def _fetch_happyshort(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://happyshort.goodbos.online/api/hs/episodes?id={orig_id}&lang=en&code={self.key}"
        )
        raw = (data or {}).get("episodes") or (data or {}).get("data") or []
        if not isinstance(raw, list) or not raw:
            return []

        sem = asyncio.Semaphore(5)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            num = int(ep.get("order") or (idx + 1))
            eid = ep.get("id")
            async with sem:
                play = await self._get_json(
                    f"https://happyshort.goodbos.online/api/hs/play?id={orig_id}&ep={num}&lang=en&code={self.key}"
                )
                if (not isinstance(play, dict) or not (play.get("cdn_url") or play.get("url"))) and eid:
                    play = await self._get_json(
                        f"https://happyshort.goodbos.online/api/hs/play?id={orig_id}&ep={eid}&lang=en&code={self.key}"
                    )
            v_url = ""
            if isinstance(play, dict):
                v_url = await self._resolve_url(
                    play.get("cdn_url"),
                    play.get("oss_url"),
                    play.get("url"),
                    payload=play.get("episode") if isinstance(play.get("episode"), dict) else play,
                )
            return {
                "id": str(eid or f"{orig_id}_{num}"),
                "episode_num": num,
                "title": ep.get("name") or f"Episode {num}",
                "video_url": v_url,
                "is_locked": bool(ep.get("lock")) and not v_url,
                "cover": pick_episode_cover(ep),
            }

        return list(await asyncio.gather(*[one(i, ep) for i, ep in enumerate(raw) if isinstance(ep, dict)]))

    # ── RaptDrama ─────────────────────────────────────────────
    async def _fetch_raptdrama(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://raptdrama.goodbos.online/api/raptdrama/episodes?id={orig_id}&lang=en&code={self.key}"
        )
        raw = ((data or {}).get("data") or {}).get("episodes") if isinstance((data or {}).get("data"), dict) else None
        raw = raw or (data or {}).get("episodes") or (data or {}).get("data") or []
        if not isinstance(raw, list) or not raw:
            return []

        # src is already a signed BunnyCDN URL — no probe needed; build in parallel for safety
        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            num = int(ep.get("idx") or ep.get("playNumber") or (idx + 1))
            src = (ep.get("src") or "").strip()
            v_url = src or await self._resolve_url(payload=ep)
            return {
                "id": str(ep.get("cid") or f"{orig_id}_{num}"),
                "episode_num": num,
                "title": ep.get("msg") or f"Episode {num}",
                "video_url": v_url,
                "is_locked": not bool(ep.get("isplay", True)) and not v_url,
                "cover": pick_episode_cover(ep),
            }

        return list(await asyncio.gather(*[
            one(i, ep) for i, ep in enumerate(raw) if isinstance(ep, dict)
        ]))

    # ── VibeShort ─────────────────────────────────────────────
    async def _fetch_vibeshort(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://vibeshort.goodbos.online/api/v1/alleps/{orig_id}?lang=en&code={self.key}"
        )
        raw = ((data or {}).get("data") or {}).get("episodes") if isinstance((data or {}).get("data"), dict) else None
        raw = raw or (data or {}).get("episodes") or (data or {}).get("data") or []
        if not isinstance(raw, list) or not raw:
            return []

        sem = asyncio.Semaphore(8)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            num = int(ep.get("episode") or (idx + 1))
            video = ep.get("video") if isinstance(ep.get("video"), dict) else {}
            async with sem:
                v_url = await self._resolve_url(video_obj=video, payload=ep)
            return {
                "id": str(ep.get("id") or f"{orig_id}_{num}"),
                "episode_num": num,
                "title": f"Episode {num}",
                "video_url": v_url,
                "is_locked": bool(ep.get("locked")) and not v_url,
                "cover": pick_episode_cover(ep),
            }

        return list(await asyncio.gather(*[
            one(i, ep) for i, ep in enumerate(raw) if isinstance(ep, dict)
        ]))

    # ── StoryReel (same shape as VibeShort) ───────────────────
    async def _fetch_storyreel(self, orig_id: str, drama_id: str) -> List[Dict[str, Any]]:
        data = await self._get_json(
            f"https://storyreel.goodbos.online/api/v1/alleps/{orig_id}?lang=en&code={self.key}"
        )
        raw = ((data or {}).get("data") or {}).get("episodes") if isinstance((data or {}).get("data"), dict) else None
        raw = raw or (data or {}).get("episodes") or (data or {}).get("data") or []
        if not isinstance(raw, list) or not raw:
            return []

        sem = asyncio.Semaphore(8)

        async def one(idx: int, ep: Dict[str, Any]) -> Dict[str, Any]:
            num = int(ep.get("episode") or (idx + 1))
            video = ep.get("video") if isinstance(ep.get("video"), dict) else {}
            async with sem:
                v_url = await self._resolve_url(video_obj=video, payload=ep)
            return {
                "id": str(ep.get("id") or f"{orig_id}_{num}"),
                "episode_num": num,
                "title": f"Episode {num}",
                "video_url": v_url,
                "is_locked": bool(ep.get("locked")) and not v_url,
                "cover": pick_episode_cover(ep),
            }

        return list(await asyncio.gather(*[
            one(i, ep) for i, ep in enumerate(raw) if isinstance(ep, dict)
        ]))

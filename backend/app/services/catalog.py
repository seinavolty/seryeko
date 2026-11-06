"""Multi-provider DramaBuzz catalog aggregation for browse/lazy-load lists."""
from __future__ import annotations

import asyncio
import ast
import json
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import quote

import httpx

from app.config import settings
from app.services.cache import cache

# Keep browse responsive: don't wait on hung upstreams
PROVIDER_FETCH_TIMEOUT = 5.0
CATALOG_FRESH_TTL = 1200       # 20 min fresh
CATALOG_STALE_TTL = 6 * 3600   # serve stale up to 6h while refreshing

_DISABLED_PROVIDERS_CACHE_KEY = "provider_configs:disabled:v1"
_DISABLED_PROVIDERS_TTL = 60  # seconds — admin toggles invalidate this immediately anyway
_HIDDEN_DRAMAS_CACHE_KEY = "catalog:hidden_drama_ids:v1"
_HIDDEN_DRAMAS_TTL = 60


def _load_disabled_provider_ids() -> frozenset:
    """Providers an admin has disabled via /admin/providers (ProviderConfig.is_enabled=False)."""
    from app.database import SessionLocal
    from app.models.schema import ProviderConfig

    disabled: set = set()
    try:
        db = SessionLocal()
        try:
            rows = db.query(ProviderConfig).filter(ProviderConfig.is_enabled.is_(False)).all()
            disabled = {r.id for r in rows}
        finally:
            db.close()
    except Exception as e:
        print(f"Provider config load failed: {e}")
    return frozenset(disabled)


def _get_disabled_provider_ids() -> frozenset:
    cached = cache.get(_DISABLED_PROVIDERS_CACHE_KEY)
    if cached is not None:
        return frozenset(cached)
    disabled = _load_disabled_provider_ids()
    cache.set(_DISABLED_PROVIDERS_CACHE_KEY, list(disabled), ttl_seconds=_DISABLED_PROVIDERS_TTL)
    return disabled


def invalidate_provider_cache() -> None:
    """Call after an admin toggles a provider so the change takes effect immediately."""
    cache.delete(_DISABLED_PROVIDERS_CACHE_KEY)


def _load_hidden_drama_ids() -> frozenset:
    """Drama IDs an admin has marked is_hidden on CachedDrama."""
    from app.database import SessionLocal
    from app.models.schema import CachedDrama

    hidden: set = set()
    try:
        db = SessionLocal()
        try:
            rows = db.query(CachedDrama.drama_id).filter(CachedDrama.is_hidden.is_(True)).all()
            hidden = {r[0] for r in rows if r[0]}
        finally:
            db.close()
    except Exception as e:
        print(f"Hidden drama load failed: {e}")
    return frozenset(hidden)


def get_hidden_drama_ids() -> frozenset:
    cached = cache.get(_HIDDEN_DRAMAS_CACHE_KEY)
    if cached is not None:
        return frozenset(cached)
    hidden = _load_hidden_drama_ids()
    cache.set(_HIDDEN_DRAMAS_CACHE_KEY, list(hidden), ttl_seconds=_HIDDEN_DRAMAS_TTL)
    return hidden


def is_drama_hidden(drama_id: str) -> bool:
    if not drama_id:
        return False
    return drama_id in get_hidden_drama_ids()


def filter_hidden_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    hidden = get_hidden_drama_ids()
    if not hidden:
        return items
    return [i for i in items if (i.get("id") or i.get("drama_id")) not in hidden]


def invalidate_hidden_cache() -> None:
    """Call after an admin toggles is_hidden so browse/search drop the title immediately."""
    cache.delete(_HIDDEN_DRAMAS_CACHE_KEY)
    # Page-level browse/search/trending caches may still contain the hidden id
    cache.delete_prefix("browse:")
    cache.delete_prefix("search:catalog:")
    cache.delete_prefix("trending:")


HOT_BADGE = "🔥 Hot"
_HOT_DRAMAS_CACHE_KEY = "catalog:hot_drama_ids:v1"
_HOT_DRAMAS_TTL = 60


def is_generic_hot_badge(badge: Optional[str]) -> bool:
    """True for empty / auto Hot labels (not admin custom badges like NEW)."""
    raw = (badge or "").replace("🔥", "").strip().lower()
    return raw in ("", "hot")


def _load_hot_drama_ids() -> frozenset:
    """IDs whose play_count is strictly above the average among watched titles."""
    from app.database import SessionLocal
    from app.models.schema import CachedDrama

    try:
        db = SessionLocal()
        try:
            rows = (
                db.query(CachedDrama.drama_id, CachedDrama.play_count)
                .filter(CachedDrama.play_count > 0)
                .filter(CachedDrama.is_hidden.is_(False))
                .all()
            )
        finally:
            db.close()
    except Exception as e:
        print(f"Hot drama load failed: {e}")
        return frozenset()

    if not rows:
        return frozenset()

    counts = [int(r[1] or 0) for r in rows]
    avg = sum(counts) / len(counts)
    # Strictly above average = "most watched vs average"; require at least 2 plays
    # so a single accidental play does not mark everything Hot when the catalog is cold.
    threshold = max(avg, 2)
    return frozenset(r[0] for r in rows if r[0] and int(r[1] or 0) > threshold)


def get_hot_drama_ids() -> frozenset:
    cached = cache.get(_HOT_DRAMAS_CACHE_KEY)
    if cached is not None:
        return frozenset(cached)
    hot = _load_hot_drama_ids()
    cache.set(_HOT_DRAMAS_CACHE_KEY, list(hot), ttl_seconds=_HOT_DRAMAS_TTL)
    return hot


def apply_hot_badges(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Attach 🔥 Hot only to above-average play_count titles; strip bogus Hot elsewhere."""
    if not items:
        return items
    hot_ids = get_hot_drama_ids()
    out: List[Dict[str, Any]] = []
    for item in items:
        row = dict(item)
        drama_id = row.get("id") or row.get("drama_id")
        badge = row.get("badge") or ""
        if drama_id in hot_ids:
            row["badge"] = HOT_BADGE
        elif is_generic_hot_badge(badge):
            row["badge"] = ""
        # else keep admin/custom badge (NEW, TRENDING, …)
        out.append(row)
    return out


def invalidate_hot_cache() -> None:
    # Badges are re-applied on every serve from this set — no need to flush page caches.
    cache.delete(_HOT_DRAMAS_CACHE_KEY)


class _DynamicExcludedProviders:
    """Behaves like a frozenset of disabled provider ids, backed by ProviderConfig.

    Kept as a drop-in replacement for the old `EXCLUDED_PROVIDERS = frozenset()`
    constant so every existing `x not in EXCLUDED_PROVIDERS` call site across
    catalog.py / provider.py keeps working unchanged.
    """

    def __contains__(self, item: object) -> bool:
        return item in _get_disabled_provider_ids()

    def __iter__(self):
        return iter(_get_disabled_provider_ids())

    def __len__(self) -> int:
        return len(_get_disabled_provider_ids())


# Providers excluded from browse/provider chips — admin-controlled (ProviderConfig table)
EXCLUDED_PROVIDERS = _DynamicExcludedProviders()

# Providers that ignore lang=en and only return Indonesian (or non-English) titles.
# Keep them out of the English catalog so Home/Browse stay English-only.
NON_ENGLISH_PROVIDERS = frozenset({"reelbuzz", "moboreels"})

# Common Indonesian tokens that almost never appear in English drama titles.
# Used as a safety net when a provider still leaks Indonesian with lang=en.
_ID_TITLE_MARKERS = frozenset({
    "cinta", "suami", "istri", "hati", "rumah", "tanpa", "pengawal", "penguasa",
    "kesempatan", "dibuang", "keluarga", "dicintai", "hamparan", "bintang",
    "menentu", "bangkitnya", "kembali", "kurir", "pengantar", "ternyata",
    "peramal", "aku", "kau", "kamu", "seluas", "antara", "dua", "kota",
    "dubbing", "dijuluki", "kesayangan", "sang", "raja", "bisnis",
})


def _wants_english(lang: str) -> bool:
    code = (lang or "en").strip().lower().replace("_", "-")
    return code == "en" or code.startswith("en-")


def _looks_indonesian_title(title: str) -> bool:
    """Heuristic: title is Indonesian if it contains multiple ID markers."""
    if not title:
        return False
    tokens = {
        t for t in "".join(ch.lower() if ch.isalnum() else " " for ch in title).split()
        if t
    }
    hits = tokens & _ID_TITLE_MARKERS
    # Single common loanwords (e.g. "Queen") are fine; 2+ ID markers ⇒ Indonesian
    if len(hits) >= 2:
        return True
    # Strong single markers that are almost never English drama titles
    strong = hits & {
        "cinta", "suami", "istri", "pengawal", "penguasa", "hamparan",
        "dibuang", "dicintai", "menentu", "dijuluki", "peramal",
    }
    return bool(strong)


def _normalize_content_lang(lang: Optional[str]) -> str:
    """Catalog titles default to English; only pass through explicit non-English codes."""
    code = (lang or "en").strip().lower() or "en"
    if _wants_english(code):
        return "en"
    return code


# Known list endpoints that return drama catalogs (from DramaBuzz status + api.html docs)
# https://api.dramabuzz.sbs/api/status
PROVIDER_LIST_SOURCES: List[Dict[str, Any]] = [
    {
        "id": "dramabox",
        "url": "https://dramabox.goodbos.online/api/dramabox/trending?lang={lang}",
        "auth": "x-token",
    },
    {
        "id": "shortmax",
        "url": "https://shortmax.goodbos.online/api/v1/popular?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "dramawave",
        "url": "https://dramawave.goodbos.online/api/recommend?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "melolo",
        "url": "https://melolo.goodbos.online/api/home?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "vigloo",
        "url": "https://vigloo.goodbos.online/api/home?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "flextv",
        "url": "https://flextv.goodbos.online/api/drama/list?lang={lang}&page=1&code={key}",
        "auth": "none",
    },
    {
        "id": "reelbuzz",
        "url": "https://reelbuzz.goodbos.online/api/dramas?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "reelife",
        "url": "https://reelife.goodbos.online/api/v1/home?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "serialplus",
        "url": "https://serealplus.goodbos.online/api/home?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "shortswave",
        "url": "https://shortwave.goodbos.online/api/all?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "cubetv",
        "url": "https://cubetv.goodbos.online/api/home?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "moboreels",
        "url": "https://moboreels.goodbos.online/api/v1/series?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "netshort",
        "url": "https://netshort.goodbos.online/api/list/1?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "dramanova",
        "url": "https://dramanova.goodbos.online/api/hot?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "starshort",
        # DramaBuzz StarShort auth is `code=`, not `token=` (token returns 401)
        "url": "https://drakula.goodbos.online/api/starshort/content/hot?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "dotdrama",
        "url": "https://dotdrama.goodbos.online/api/drama/list?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "rapidtv",
        "url": "https://rapidtv.goodbos.online/api/drama/list?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "flickreels",
        # /api/nexthome returns docs JSON; /api/home returns the drama list
        "url": "https://flickreels.goodbos.online/api/home?lang={lang}&token={key}",
        "auth": "none",
    },
    {
        "id": "flareflow",
        "url": "https://plerplow.goodbos.online/api/trending?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "happyshort",
        "url": "https://happyshort.goodbos.online/api/hs/home?page=1&lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "microdrama",
        "url": "https://drakula.goodbos.online/api/microdrama/list?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "freereels",
        "url": "https://drakula.goodbos.online/api/freereels/popular?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "raptdrama",
        "url": "https://raptdrama.goodbos.online/api/raptdrama/trending?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "vibeshort",
        "url": "https://vibeshort.goodbos.online/api/v1/home?lang={lang}&code={key}",
        "auth": "none",
    },
    {
        "id": "storyreel",
        "url": "https://storyreel.goodbos.online/api/v1/home?lang={lang}&code={key}",
        "auth": "none",
    },
]


def _first_list(payload: Any) -> List[Any]:
    """Pull the most likely drama list out of heterogeneous provider JSON."""
    if isinstance(payload, list):
        return payload
    if not isinstance(payload, dict):
        return []

    # Direct list keys (order matters — prefer content catalogs over UI tabs)
    for key in (
        "dramas", "items", "list", "programs", "rows",
        "result", "results", "seriesList", "records", "content",
        "videos", "trending", "featured", "new_releases", "popular",
        "dataList", "data",
    ):
        value = payload.get(key)
        if isinstance(value, list):
            # CubeTV-style module rows containing videos
            if value and isinstance(value[0], dict) and isinstance(value[0].get("videos"), list):
                flat: List[Any] = []
                for row in value:
                    vids = row.get("videos") or []
                    if isinstance(vids, list):
                        flat.extend(vids)
                return flat
            # FreeReels: [{series: {...}}, ...]
            if value and isinstance(value[0], dict) and isinstance(value[0].get("series"), dict):
                return [row["series"] for row in value if isinstance(row.get("series"), dict)]
            return value
        if isinstance(value, dict):
            nested = _first_list(value)
            if nested:
                return nested

    return []


def _pick(raw: Dict[str, Any], *keys: str, default: Any = None) -> Any:
    for key in keys:
        if key in raw and raw[key] not in (None, ""):
            return raw[key]
    return default


def clean_text_field(value: Any) -> str:
    """Normalize provider text that may be nested JSON / Python dict strings.

    Vigloo `description` is often a JSON string like:
      {"synopsis":"...","cast":"...","castNames":"..."}
    """
    if value is None:
        return ""
    if isinstance(value, dict):
        for key in ("synopsis", "description", "summary", "text", "logLine", "intro"):
            inner = value.get(key)
            if isinstance(inner, str) and inner.strip():
                return inner.strip()
        return ""
    if isinstance(value, list):
        parts = [clean_text_field(v) for v in value]
        return " ".join(p for p in parts if p).strip()
    if not isinstance(value, str):
        return str(value).strip()

    text = value.strip()
    if not text:
        return ""
    # JSON object/array disguised as a string
    if (text.startswith("{") and text.endswith("}")) or (text.startswith("[") and text.endswith("]")):
        parsed = None
        try:
            parsed = json.loads(text)
        except Exception:
            try:
                parsed = ast.literal_eval(text)
            except Exception:
                parsed = None
        if parsed is not None:
            cleaned = clean_text_field(parsed)
            if cleaned:
                return cleaned
    return text


def clean_tag_label(value: Any) -> str:
    """Turn genre/tag objects (or their stringified forms) into a display label."""
    if value is None:
        return ""
    if isinstance(value, dict):
        for key in ("title", "name", "tagName", "label", "genre"):
            label = value.get(key)
            if isinstance(label, str) and label.strip():
                return label.strip()
        return ""
    if not isinstance(value, str):
        return str(value).strip()

    text = value.strip()
    if not text:
        return ""
    # Stringified dict from older normalize_item: "{'id': 1, 'title': 'Romance'}"
    if (text.startswith("{") and text.endswith("}")) or (text.startswith("[") and text.endswith("]")):
        parsed = None
        try:
            parsed = json.loads(text.replace("'", '"'))
        except Exception:
            try:
                parsed = ast.literal_eval(text)
            except Exception:
                parsed = None
        if parsed is not None:
            return clean_tag_label(parsed)
    return text


def clean_tag_list(values: Any) -> List[str]:
    if isinstance(values, str):
        values = [t.strip() for t in values.split(",") if t.strip()]
    if not isinstance(values, list):
        return []
    out: List[str] = []
    seen = set()
    for raw in values:
        label = clean_tag_label(raw)
        if not label:
            continue
        key = label.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(label)
    return out[:6]


def normalize_item(provider: str, raw: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(raw, dict):
        return None

    # FreeReels wraps each row as {series: {...}}
    if isinstance(raw.get("series"), dict) and not raw.get("title") and not raw.get("name"):
        raw = {**raw, **raw["series"]}

    oid = _pick(
        raw,
        "bookId", "playlet_id", "drama_id", "dramaId", "book_id",
        "seriesId", "series_id", "shortPlayId", "contentId", "video_id",
        "videoId", "videoid", "id", "key", "code",
    )
    title = _pick(
        raw,
        "bookName", "name", "title", "seriesName", "dramaName",
        "videoName", "video_name", "book_name", "showName",
        "contentName", "shortPlayName",
        "en_title", "english_title", "title_en", "name_en",
    )
    if not oid or not title:
        return None

    cover = _pick(
        raw,
        "coverWap", "cover", "cover_url", "coverUrl", "cover_h",
        "shortPlayCover", "contentCoverUrl", "big_cover",
        "thumbnailExpanded", "poster", "posterUrl", "image", "thumbnail", "pic",
        default="",
    )
    # Vigloo: thumbnails is a list of {url, type}; prefer type 0 / first url
    if not cover:
        thumbs = raw.get("thumbnails")
        if isinstance(thumbs, list):
            for t in thumbs:
                if isinstance(t, dict) and isinstance(t.get("url"), str) and t["url"].startswith("http"):
                    cover = t["url"]
                    break
        elif isinstance(thumbs, str) and thumbs.startswith("http"):
            cover = thumbs
    if not cover:
        # Last resort — title wordmark (better than blank)
        ti = raw.get("titleImage")
        if isinstance(ti, str) and ti.startswith("http"):
            cover = ti

    episodes = _pick(
        raw,
        "chapterCount", "episodes", "episode_count", "episodeCount",
        "totalEpisodes", "total_episodes", "totalEpisodeNum", "totalEps",
        "episode_num", "chapters", "count",
        default=0,
    )
    try:
        episodes = int(episodes or 0)
    except (TypeError, ValueError):
        episodes = 0

    summary = clean_text_field(
        _pick(
            raw,
            # Prefer plain synopsis over Vigloo's JSON `description` blob
            "introduction", "summary", "synopsis", "logLine", "desc",
            "description", "intro", "brief", "introduce",
            default="",
        )
    )

    tags = clean_tag_list(
        _pick(
            raw, "tags", "genres", "series_tag", "genre", "category",
            "content_tags", "m_video_tag",
            default=[],
        )
    )

    return {
        "id": f"{provider}_{oid}",
        "provider": provider,
        "original_id": str(oid),
        "title": str(title),
        "cover": str(cover) if cover else "",
        "episodes": episodes,
        "summary": str(summary),
        "badge": "",
        "tags": tags or ["Drama"],
        "genre": (tags[:4] if tags else ["Drama"]),
        "country": _pick(raw, "country", "region", default=""),
        "year": _pick(raw, "year", default=None),
        "status": _pick(raw, "status", default="ongoing"),
        "rating": _pick(raw, "rating", "score", default=4.5),
        "languages": ["en"],
    }


class CatalogService:
    def __init__(self) -> None:
        self.api_key = settings.DRAMABUZZ_API_KEY
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(PROVIDER_FETCH_TIMEOUT, connect=2.0),
            follow_redirects=True,
            limits=httpx.Limits(max_connections=40, max_keepalive_connections=20),
        )
        self._refresh_locks: Dict[str, asyncio.Lock] = {}
        self._warming = False

    async def fetch_status_platforms(self) -> Dict[str, Any]:
        cache_key = "dramabuzz:status:v1"
        cached = cache.get(cache_key)
        if cached:
            return cached
        try:
            url = f"https://api.dramabuzz.sbs/api/status?key={self.api_key}"
            resp = await self.client.get(url)
            if resp.status_code == 200:
                data = resp.json()
                cache.set(cache_key, data, ttl_seconds=3600)
                return data
        except Exception as e:
            print(f"DramaBuzz status error: {e}")
        return {"success": False, "platforms": [], "summary": {}}

    async def _fetch_source(self, source: Dict[str, Any], lang: str) -> Tuple[str, List[Dict[str, Any]]]:
        pid = source["id"]
        url = source["url"].format(lang=lang, key=self.api_key, q=quote("a"))
        # Many DramaBuzz mirrors require x-token even when the URL already has code=/token=
        headers = {
            "User-Agent": "SeryeKo/1.0",
            "x-token": self.api_key,
        }

        try:
            resp = await self.client.get(url, headers=headers)
            if resp.status_code != 200:
                return pid, []
            try:
                payload = resp.json()
            except Exception:
                return pid, []

            raw_items = _first_list(payload)
            normalized: List[Dict[str, Any]] = []
            seen = set()
            for raw in raw_items:
                item = normalize_item(pid, raw)
                if not item or item["id"] in seen:
                    continue
                seen.add(item["id"])
                normalized.append(item)
            # CubeTV lists pre-shelf "New" titles whose /api/episodes is still empty —
            # drop those so browse/watch never lands on unplayable stubs.
            if pid == "cubetv" and normalized:
                normalized = await self._filter_cubetv_streamable(normalized)
            return pid, normalized
        except Exception as e:
            print(f"Catalog fetch {pid} failed: {e}")
            return pid, []

    async def _filter_cubetv_streamable(
        self, items: List[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Keep only CubeTV titles that currently return episode HLS rows."""
        cache_key = "cubetv:streamable_ids:v1"
        known: Dict[str, bool] = dict(cache.get(cache_key) or {})
        sem = asyncio.Semaphore(12)
        headers = {
            "User-Agent": "SeryeKo/1.0",
            "x-token": self.api_key,
        }

        async def check(item: Dict[str, Any]) -> Optional[Dict[str, Any]]:
            oid = str(item.get("original_id") or "")
            if not oid:
                return None
            if oid in known:
                return item if known[oid] else None
            async with sem:
                ok = True  # fail-open on transport errors
                try:
                    url = (
                        f"https://cubetv.goodbos.online/api/episodes/{oid}"
                        f"?lang=en&code={self.api_key}"
                    )
                    resp = await self.client.get(url, headers=headers)
                    if resp.status_code == 200:
                        data = resp.json()
                        rows = (data or {}).get("rows") or []
                        total = (data or {}).get("total") or 0
                        ok = bool(rows) or int(total or 0) > 0
                except Exception:
                    ok = True
                known[oid] = ok
                return item if ok else None

        filtered = await asyncio.gather(*[check(i) for i in items])
        cache.set(cache_key, known, ttl_seconds=1800)
        out = [x for x in filtered if x]
        if len(out) < len(items):
            print(f"CubeTV catalog: dropped {len(items) - len(out)} unplayable titles")
        return out

    def _merge_provider_results(
        self, results: List[Tuple[str, List[Dict[str, Any]]]]
    ) -> List[Dict[str, Any]]:
        merged: List[Dict[str, Any]] = []
        seen = set()
        # Round-robin merge so lazy-load pages mix providers
        buckets = [items for _pid, items in results if items]
        if not buckets:
            return merged
        max_len = max(len(b) for b in buckets)
        for i in range(max_len):
            for bucket in buckets:
                if i < len(bucket):
                    item = bucket[i]
                    if item["id"] not in seen:
                        seen.add(item["id"])
                        merged.append(item)
        return merged

    async def _build_unified_catalog(self, lang: str) -> List[Dict[str, Any]]:
        lang = _normalize_content_lang(lang)
        sources = [
            s for s in PROVIDER_LIST_SOURCES
            if s["id"] not in EXCLUDED_PROVIDERS
            and not (_wants_english(lang) and s["id"] in NON_ENGLISH_PROVIDERS)
        ]
        results = await asyncio.gather(
            *[self._fetch_source(src, lang) for src in sources],
            return_exceptions=True,
        )
        ok: List[Tuple[str, List[Dict[str, Any]]]] = []
        for src, result in zip(sources, results):
            if isinstance(result, Exception):
                print(f"Catalog fetch {src['id']} failed: {result}")
                continue
            pid, items = result
            if _wants_english(lang):
                items = [i for i in items if not _looks_indonesian_title(i.get("title") or "")]
            ok.append((pid, items))
        return self._merge_provider_results(ok)

    async def _refresh_catalog(self, lang: str, cache_key: str) -> List[Dict[str, Any]]:
        lock = self._refresh_locks.setdefault(cache_key, asyncio.Lock())
        async with lock:
            # Another coroutine may have refreshed while we waited
            entry = cache.get_entry(cache_key)
            if entry and entry[1]:
                return entry[0]
            merged = await self._build_unified_catalog(lang)
            if merged:
                cache.set(
                    cache_key,
                    merged,
                    ttl_seconds=CATALOG_FRESH_TTL,
                    stale_ttl_seconds=CATALOG_STALE_TTL,
                )
                return merged
            # Keep serving previous stale data if refresh returned empty
            if entry and entry[2]:
                return entry[0]
            cache.set(
                cache_key,
                [],
                ttl_seconds=60,
                stale_ttl_seconds=300,
            )
            return []

    async def get_unified_catalog(
        self,
        lang: str = "en",
        provider: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        lang = _normalize_content_lang(lang)
        # v10: longer provider timeout + force rebuild (restore DramaBox/ShortMax after partial fan-out)
        cache_key = f"catalog:all:{lang}:v11"
        entry = cache.get_entry(cache_key)

        if entry is None:
            # Cold start — must wait, but providers are capped at PROVIDER_FETCH_TIMEOUT
            cached = await self._refresh_catalog(lang, cache_key)
        else:
            cached, is_fresh, _usable = entry
            if not is_fresh:
                # Stale-while-revalidate: return immediately, refresh in background
                asyncio.create_task(self._refresh_catalog(lang, cache_key))

        if provider:
            if provider in EXCLUDED_PROVIDERS:
                return []
            if _wants_english(lang) and provider in NON_ENGLISH_PROVIDERS:
                return []
            items = [i for i in cached if i.get("provider") == provider]
        else:
            items = [
                i for i in cached
                if i.get("provider") not in EXCLUDED_PROVIDERS
                and not (_wants_english(lang) and i.get("provider") in NON_ENGLISH_PROVIDERS)
            ]
        return apply_hot_badges(filter_hidden_items(items))

    async def warm(self, lang: str = "en") -> None:
        """Best-effort startup warm so first user browse is not a cold fan-out."""
        if self._warming:
            return
        self._warming = True
        try:
            await self.get_unified_catalog(lang=_normalize_content_lang(lang))
        except Exception as e:
            print(f"Catalog warm failed: {e}")
        finally:
            self._warming = False

    async def browse(
        self,
        genre: Optional[str] = None,
        country: Optional[str] = None,
        status: Optional[str] = None,
        provider: Optional[str] = None,
        page: int = 1,
        page_size: int = 12,
        lang: str = "en",
    ) -> Dict[str, Any]:
        lang = _normalize_content_lang(lang)
        browse_key = (
            f"browse:{lang}:{provider or ''}:{genre or ''}:{country or ''}:"
            f"{status or ''}:{page}:{page_size}:v4"
        )
        browse_entry = cache.get_entry(browse_key)
        if browse_entry and browse_entry[1]:
            payload = browse_entry[0]
            if isinstance(payload, dict) and payload.get("items") is not None:
                return {
                    **payload,
                    "items": apply_hot_badges(filter_hidden_items(payload.get("items") or [])),
                }
            return payload

        # One catalog load for both page items and provider chips
        all_items = await self.get_unified_catalog(lang=lang)
        items = all_items if not provider else [i for i in all_items if i.get("provider") == provider]

        if genre:
            g = genre.lower()
            items = [
                i for i in items
                if g in [str(t).lower() for t in i.get("genre", [])]
                or g in [str(t).lower() for t in i.get("tags", [])]
            ]
        if country:
            items = [i for i in items if (i.get("country") or "").upper() == country.upper()]
        if status:
            items = [i for i in items if (i.get("status") or "").lower() == status.lower()]

        total = len(items)
        start = max(0, (page - 1) * page_size)
        end = start + page_size
        page_items = items[start:end]

        provider_counts: Dict[str, int] = {}
        for i in all_items:
            p = i.get("provider") or "unknown"
            provider_counts[p] = provider_counts.get(p, 0) + 1

        payload = {
            "items": page_items,
            "page": page,
            "page_size": page_size,
            "total": total,
            "has_more": end < total,
            "providers": provider_counts,
        }
        # Short page cache — catalog itself is the longer-lived source of truth
        cache.set(browse_key, payload, ttl_seconds=60, stale_ttl_seconds=300)
        return payload

    async def search(
        self,
        query: str,
        lang: str = "en",
        limit: int = 48,
    ) -> List[Dict[str, Any]]:
        """Full-text-ish filter over the unified English catalog (title / tags / summary)."""
        lang = _normalize_content_lang(lang)
        q = (query or "").strip().lower()
        if not q:
            return []

        cache_key = f"search:catalog:{lang}:{q}:v1"
        cached = cache.get(cache_key)
        if cached is not None:
            return cached

        items = await self.get_unified_catalog(lang=lang)
        scored: List[Tuple[int, Dict[str, Any]]] = []
        for item in items:
            title = str(item.get("title") or "").lower()
            tags = [str(t).lower() for t in (item.get("tags") or item.get("genre") or [])]
            summary = str(item.get("summary") or item.get("synopsis") or "").lower()
            if q in title:
                # Title prefix / exact-ish matches rank higher
                score = 0 if title.startswith(q) else 1
            elif any(q in t for t in tags):
                score = 2
            elif q in summary:
                score = 3
            else:
                continue
            scored.append((score, item))

        scored.sort(key=lambda pair: (pair[0], str(pair[1].get("title") or "").lower()))
        results = [item for _, item in scored[: max(1, min(limit, 100))]]
        cache.set(cache_key, results, ttl_seconds=120, stale_ttl_seconds=600)
        return results


catalog_service = CatalogService()

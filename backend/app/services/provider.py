import httpx
from typing import List, Dict, Any, Optional
from app.config import settings
from app.services.cache import cache

class ProviderAggregator:
    def __init__(self):
        self.api_key = settings.DRAMABUZZ_API_KEY
        self.client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)

    # Fake local-catalog IDs → live provider IDs (DramaWave uses opaque string ids)
    ID_ALIASES = {
        "dramawave_30021": "dramawave_vvweAuuO9x",  # The CEO's Secret Wife
    }

    def _canonical_id(self, drama_id: str) -> str:
        return self.ID_ALIASES.get(drama_id, drama_id)

    async def get_providers(self) -> Dict[str, Any]:
        from app.services.catalog import EXCLUDED_PROVIDERS, catalog_service
        data = await catalog_service.fetch_status_platforms()
        platforms = data.get("platforms") or []
        active = [
            {
                "id": p.get("id"),
                "name": p.get("name"),
                "status": p.get("status"),
                "logo": p.get("logo"),
                "api": p.get("api"),
            }
            for p in platforms
            if p.get("status") == "active"
            and p.get("api")
            and p.get("id") not in EXCLUDED_PROVIDERS
        ]
        if not active:
            active = [
                {"id": "dramabox", "name": "DramaBox", "status": "active"},
                {"id": "shortmax", "name": "ShortMax", "status": "active"},
                {"id": "dramawave", "name": "DramaWave", "status": "active"},
                {"id": "reelbuzz", "name": "ReelBuzz", "status": "active"},
                {"id": "flextv", "name": "FlexTV", "status": "active"},
            ]
        return {
            "success": True,
            "summary": data.get("summary") or {"total": len(platforms), "has_api": len(active)},
            "platforms": [p for p in platforms if isinstance(p, dict) and p.get("id") not in EXCLUDED_PROVIDERS],
            "active": active,
            "count": len(active),
        }

    async def get_trending(self, provider: str = "dramabox", lang: str = "en") -> List[Dict[str, Any]]:
        cache_key = f"trending:{provider}:{lang}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        items = []
        if provider == "dramabox":
            try:
                url = f"https://dramabox.goodbos.online/api/dramabox/trending?lang={lang}"
                resp = await self.client.get(url, headers={"x-token": self.api_key})
                if resp.status_code == 200:
                    raw = resp.json()
                    for item in raw:
                        items.append({
                            "id": f"dramabox_{item.get('bookId')}",
                            "provider": "dramabox",
                            "original_id": str(item.get("bookId")),
                            "title": item.get("bookName"),
                            "cover": item.get("coverWap") or item.get("cover"),
                            "episodes": item.get("chapterCount", 0),
                            "summary": item.get("introduction", ""),
                            "badge": "🔥 Hot",
                            "tags": ["Romance", "Drama"]
                        })
            except Exception as e:
                print(f"Error getting dramabox trending: {e}")

        elif provider == "shortmax":
            try:
                url = f"https://shortmax.goodbos.online/api/v1/popular?lang={lang}&code={self.api_key}"
                resp = await self.client.get(url)
                if resp.status_code == 200:
                    raw = resp.json().get("data", [])
                    for item in raw:
                        items.append({
                            "id": f"shortmax_{item.get('id')}",
                            "provider": "shortmax",
                            "original_id": str(item.get("id")),
                            "title": item.get("name"),
                            "cover": item.get("cover"),
                            "episodes": item.get("episodes", 0),
                            "summary": item.get("summary", ""),
                            "badge": "NEW",
                            "tags": ["Modern", "CEO"]
                        })
            except Exception as e:
                print(f"Error getting shortmax popular: {e}")

        # If items found, cache and return (strip admin-hidden titles)
        if items:
            from app.services.catalog import filter_hidden_items
            items = filter_hidden_items(items)
            cache.set(cache_key, items, ttl_seconds=1200)
            return items

        # Fallback items if API is unreachable/rate-limited
        from app.services.catalog import filter_hidden_items
        return filter_hidden_items(self._fallback_trending(provider))

    async def get_episodes(self, drama_id: str) -> List[Dict[str, Any]]:
        from app.services.episode_sources import EpisodeFetcher, is_demo_url

        drama_id = self._canonical_id(drama_id)
        cache_key = f"episodes:v7:{drama_id}"
        cached = cache.get(cache_key)
        if cached and any(not is_demo_url(ep.get("video_url")) for ep in cached):
            return cached

        parts = drama_id.split("_", 1)
        if len(parts) != 2:
            return []
        provider, orig_id = parts[0], parts[1]

        # DramaWave may need title-based id resolution for legacy fake ids
        if provider == "dramawave":
            try:
                orig_id = await self._resolve_dramawave_id(orig_id, drama_id)
            except Exception as e:
                print(f"DramaWave id resolve failed: {e}")

        fetcher = EpisodeFetcher(self.client, self.api_key)
        # Use a longer-lived client timeout for multi-request providers (Melolo/Reelife)
        old_timeout = self.client.timeout
        try:
            self.client.timeout = httpx.Timeout(60.0)
            episodes = await fetcher.fetch(provider, orig_id, drama_id)
        finally:
            self.client.timeout = old_timeout

        if episodes and any(not is_demo_url(ep.get("video_url")) for ep in episodes):
            # Vigloo CloudFront cookies expire ~20 min — keep memory cache short
            ttl = 300 if provider == "vigloo" else 1800
            cache.set(cache_key, episodes, ttl_seconds=ttl)
            return episodes

        # Never substitute local demo MP4 for live provider catalogs (e.g. CubeTV
        # pre-shelf titles return empty rows — demo streams look like a bug).
        return []

    async def _fetch_dramawave_drama(self, orig_id: str) -> Optional[Dict[str, Any]]:
        url = f"https://dramawave.goodbos.online/api/drama/{orig_id}?lang=en&code={self.api_key}"
        resp = await self.client.get(url)
        if resp.status_code != 200:
            return None
        data = resp.json().get("data")
        if not data or not data.get("items"):
            return None
        return data

    async def _resolve_dramawave_id(self, orig_id: str, full_id: str) -> str:
        """Map fake/local ids to live DramaWave playlet ids via direct fetch or title search."""
        if await self._fetch_dramawave_drama(orig_id):
            return orig_id

        cat = next((i for i in self._catalog() if i["id"] == full_id or i.get("original_id") == orig_id), None)
        title = (cat or {}).get("title")
        if not title:
            return orig_id

        try:
            from urllib.parse import quote
            url = f"https://dramawave.goodbos.online/api/search?q={quote(title)}&lang=en&code={self.api_key}"
            resp = await self.client.get(url)
            if resp.status_code == 200:
                items = resp.json().get("list") or []
                exact = next((i for i in items if (i.get("name") or "").lower() == title.lower()), None)
                hit = exact or (items[0] if items else None)
                if hit and hit.get("id"):
                    return str(hit["id"])
        except Exception as e:
            print(f"Error resolving dramawave id by title: {e}")
        return orig_id

    def _catalog(self) -> List[Dict[str, Any]]:
        """Expanded local catalog used for fallback trending/search/browse/detail demos."""
        return [
            {
                "id": "dramabox_42000023802", "provider": "dramabox", "original_id": "42000023802",
                "title": "He Broke the Heart That Saved Him",
                "cover": "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80",
                "episodes": 52, "summary": "Mia sacrifices everything for her dying lover Vance, never knowing he is the heir to the Empire.",
                "badge": "🔥 Hot", "tags": ["Romance", "Drama"], "genre": ["Romance", "Drama"],
                "country": "CN", "year": 2025, "status": "ongoing", "rating": 4.8,
                "languages": ["en", "tl", "id"]
            },
            {
                "id": "shortmax_18550", "provider": "shortmax", "original_id": "18550",
                "title": "Mommy I'm Not Lying",
                "cover": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
                "episodes": 28, "summary": "Evelyn returns 5 years later with twins, catching the billionaire CEO by surprise.",
                "badge": "NEW", "tags": ["Family", "Revenge"], "genre": ["Family", "Revenge"],
                "country": "CN", "year": 2025, "status": "completed", "rating": 4.6,
                "languages": ["en", "tl"]
            },
            {
                "id": "dramawave_vvweAuuO9x", "provider": "dramawave", "original_id": "vvweAuuO9x",
                "title": "The CEO's Secret Wife",
                "cover": "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=600&auto=format&fit=crop&q=80",
                "episodes": 80, "summary": "A marriage of convenience spirals into real love — but his family won't accept her.",
                "badge": "🔥 Hot", "tags": ["Romance", "CEO"], "genre": ["Romance", "CEO"],
                "country": "KR", "year": 2024, "status": "completed", "rating": 4.7,
                "languages": ["en", "id"]
            },
            {
                "id": "reelshort_55310", "provider": "reelshort", "original_id": "55310",
                "title": "Reborn to Rule the Empire",
                "cover": "https://images.unsplash.com/photo-1485846234645-a62644f84728?w=600&auto=format&fit=crop&q=80",
                "episodes": 64, "summary": "Betrayed in her past life, she wakes up with memories intact — and a plan for revenge.",
                "badge": "TRENDING", "tags": ["Fantasy", "Revenge"], "genre": ["Fantasy", "Revenge"],
                "country": "CN", "year": 2025, "status": "ongoing", "rating": 4.9,
                "languages": ["en", "tl", "id"]
            },
            {
                "id": "flickreels_77201", "provider": "flickreels", "original_id": "77201",
                "title": "Midnight in Seoul",
                "cover": "https://images.unsplash.com/photo-1517841905240-472988babdf9?w=600&auto=format&fit=crop&q=80",
                "episodes": 36, "summary": "A detective and a chaebol heir cross paths in a thriller set across neon-lit Seoul.",
                "badge": "NEW", "tags": ["Thriller", "Romance"], "genre": ["Thriller", "Romance"],
                "country": "KR", "year": 2025, "status": "ongoing", "rating": 4.5,
                "languages": ["en", "tl"]
            },
            {
                "id": "dramabox_11029384", "provider": "dramabox", "original_id": "11029384",
                "title": "Beach House Comedy Club",
                "cover": "https://images.unsplash.com/photo-1500462918059-b1a0cb512f1d?w=600&auto=format&fit=crop&q=80",
                "episodes": 20, "summary": "Four strangers inherit a beach house and must run a comedy club to keep it.",
                "badge": "FUNNY", "tags": ["Comedy"], "genre": ["Comedy"],
                "country": "TH", "year": 2024, "status": "completed", "rating": 4.3,
                "languages": ["en", "id"]
            },
            {
                "id": "shortmax_99812", "provider": "shortmax", "original_id": "99812",
                "title": "The Dragon Prince's Bride",
                "cover": "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80",
                "episodes": 45, "summary": "A modern bride is pulled into an ancient fantasy kingdom ruled by dragon royalty.",
                "badge": "🔥 Hot", "tags": ["Fantasy", "Romance"], "genre": ["Fantasy", "Romance"],
                "country": "CN", "year": 2025, "status": "ongoing", "rating": 4.8,
                "languages": ["en", "tl", "id"]
            },
            {
                "id": "dramawave_40441", "provider": "dramawave", "original_id": "40441",
                "title": "Tokyo Action Squad",
                "cover": "https://images.unsplash.com/photo-1540206395-68808572332f?w=600&auto=format&fit=crop&q=80",
                "episodes": 32, "summary": "An underground street fighter is recruited into an elite anti-crime task force.",
                "badge": "NEW", "tags": ["Action"], "genre": ["Action"],
                "country": "JP", "year": 2025, "status": "ongoing", "rating": 4.4,
                "languages": ["en"]
            },
            {
                "id": "reelshort_63502", "provider": "reelshort", "original_id": "63502",
                "title": "Second Chance Billionaire",
                "cover": "https://images.unsplash.com/photo-1521737711867-e3b97375f902?w=600&auto=format&fit=crop&q=80",
                "episodes": 50, "summary": "Dumped and disgraced, she rebuilds her empire under a new identity — and his nose.",
                "badge": "TRENDING", "tags": ["Romance", "CEO"], "genre": ["Romance", "CEO"],
                "country": "CN", "year": 2024, "status": "completed", "rating": 4.6,
                "languages": ["en", "tl"]
            },
            {
                "id": "flickreels_80093", "provider": "flickreels", "original_id": "80093",
                "title": "Manila Nights",
                "cover": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=600&auto=format&fit=crop&q=80",
                "episodes": 24, "summary": "Two rival food-cart owners fall in love while competing for the same street corner.",
                "badge": "NEW", "tags": ["Comedy", "Romance"], "genre": ["Comedy", "Romance"],
                "country": "PH", "year": 2025, "status": "ongoing", "rating": 4.5,
                "languages": ["en", "tl"]
            },
            {
                "id": "dramabox_20938475", "provider": "dramabox", "original_id": "20938475",
                "title": "The Haunted Heiress",
                "cover": "https://images.unsplash.com/photo-1518895949257-7621c3c786d7?w=600&auto=format&fit=crop&q=80",
                "episodes": 30, "summary": "She inherits a mansion full of secrets — and the ghost of the man who loved her first.",
                "badge": "🔥 Hot", "tags": ["Thriller", "Fantasy"], "genre": ["Thriller", "Fantasy"],
                "country": "KR", "year": 2025, "status": "ongoing", "rating": 4.7,
                "languages": ["en", "id"]
            },
            {
                "id": "shortmax_55221", "provider": "shortmax", "original_id": "55221",
                "title": "Contract Marriage, Real Feelings",
                "cover": "https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?w=600&auto=format&fit=crop&q=80",
                "episodes": 38, "summary": "A fake marriage to save her family's company turns into something neither expected.",
                "badge": "TRENDING", "tags": ["Romance"], "genre": ["Romance"],
                "country": "CN", "year": 2024, "status": "completed", "rating": 4.6,
                "languages": ["en", "tl", "id"]
            },
        ]

    def _fallback_trending(self, provider: str) -> List[Dict[str, Any]]:
        from app.services.catalog import EXCLUDED_PROVIDERS
        return [i for i in self._catalog() if i.get("provider") not in EXCLUDED_PROVIDERS]

    async def search(self, query: str, lang: str = "en") -> List[Dict[str, Any]]:
        from app.services.catalog import EXCLUDED_PROVIDERS, catalog_service

        q = (query or "").strip()
        if not q:
            return []

        try:
            results = await catalog_service.search(q, lang=lang)
            if results:
                return results
        except Exception as e:
            print(f"Live catalog search failed, using local fallback: {e}")

        # Fallback to local demo catalog
        ql = q.lower()
        return [
            item for item in self._catalog()
            if item.get("provider") not in EXCLUDED_PROVIDERS
            and (
                ql in str(item.get("title") or "").lower()
                or any(ql in str(tag).lower() for tag in item.get("tags", []))
            )
        ]

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
        from app.services.catalog import catalog_service
        try:
            result = await catalog_service.browse(
                genre=genre,
                country=country,
                status=status,
                provider=provider,
                page=page,
                page_size=page_size,
                lang=lang,
            )
            if result.get("total", 0) > 0:
                return result
        except Exception as e:
            print(f"Live catalog browse failed, using local fallback: {e}")

        # Fallback to local demo catalog
        from app.services.catalog import EXCLUDED_PROVIDERS
        items = [i for i in self._catalog() if i.get("provider") not in EXCLUDED_PROVIDERS]
        if provider:
            if provider in EXCLUDED_PROVIDERS:
                items = []
            else:
                items = [i for i in items if i.get("provider") == provider]
        if genre:
            items = [i for i in items if genre in i.get("genre", [])]
        if country:
            items = [i for i in items if i.get("country") == country]
        if status:
            items = [i for i in items if i.get("status") == status]

        total = len(items)
        start = (page - 1) * page_size
        end = start + page_size
        return {
            "items": items[start:end],
            "page": page,
            "page_size": page_size,
            "total": total,
            "has_more": end < total,
            "providers": {},
        }

    def _normalize_detail(self, item: Dict[str, Any]) -> Dict[str, Any]:
        from app.services.catalog import clean_tag_list, clean_text_field

        summary = clean_text_field(item.get("summary") or item.get("synopsis") or "")
        tags = clean_tag_list(item.get("tags") or item.get("genre") or [])
        return {
            **item,
            "titleLocalized": {"en": item.get("title", "")},
            "coverImage": item.get("cover", ""),
            "summary": summary,
            "synopsis": summary,
            "totalEpisodes": item.get("episodes", 0),
            "genre": tags or ["Drama"],
            "tags": tags or ["Drama"],
        }

    async def get_detail(self, drama_id: str) -> Optional[Dict[str, Any]]:
        requested_id = drama_id
        drama_id = self._canonical_id(drama_id)
        cache_key = f"detail:v4:{drama_id}"
        cached = cache.get(cache_key)
        if cached:
            return cached

        parts = drama_id.split("_", 1)
        provider = parts[0] if len(parts) == 2 else ""
        orig_id = parts[1] if len(parts) == 2 else drama_id
        item: Optional[Dict[str, Any]] = None

        # 1) Live provider detail APIs (Home/Trending IDs live here, not in local catalog)
        if provider == "dramabox":
            try:
                url = f"https://dramabox.goodbos.online/api/dramabox/detail?bookId={orig_id}"
                resp = await self.client.get(url, headers={"x-token": self.api_key})
                if resp.status_code == 200:
                    raw = resp.json()
                    if raw.get("bookName") or raw.get("bookId"):
                        tags = raw.get("tags") or []
                        item = {
                            "id": f"dramabox_{raw.get('bookId', orig_id)}",
                            "provider": "dramabox",
                            "original_id": str(raw.get("bookId", orig_id)),
                            "title": raw.get("bookName", ""),
                            "cover": raw.get("coverWap") or raw.get("cover", ""),
                            "episodes": raw.get("chapterCount", 0),
                            "summary": raw.get("introduction", ""),
                            "badge": "",
                            "tags": tags,
                            "genre": tags[:4] if tags else ["Drama"],
                            "country": "CN",
                            "year": None,
                            "status": "ongoing",
                            "rating": 4.5,
                            "languages": ["en"],
                        }
            except Exception as e:
                print(f"Error getting dramabox detail: {e}")

        elif provider == "shortmax":
            try:
                url = f"https://shortmax.goodbos.online/api/v1/detail/{orig_id}?lang=en&code={self.api_key}"
                resp = await self.client.get(url, follow_redirects=True)
                if resp.status_code == 200:
                    raw = resp.json().get("data") or resp.json()
                    if raw.get("name") or raw.get("id"):
                        item = {
                            "id": f"shortmax_{raw.get('id', orig_id)}",
                            "provider": "shortmax",
                            "original_id": str(raw.get("id", orig_id)),
                            "title": raw.get("name", ""),
                            "cover": raw.get("cover", ""),
                            "episodes": raw.get("episodes", 0),
                            "summary": raw.get("summary", ""),
                            "badge": "NEW",
                            "tags": raw.get("tags") or ["Modern"],
                            "genre": raw.get("tags") or ["Modern"],
                            "country": "CN",
                            "year": None,
                            "status": "ongoing",
                            "rating": 4.5,
                            "languages": ["en"],
                        }
            except Exception as e:
                print(f"Error getting shortmax detail: {e}")

        elif provider == "dramawave":
            try:
                resolved = await self._resolve_dramawave_id(orig_id, drama_id)
                data = await self._fetch_dramawave_drama(resolved)
                if data:
                    item = {
                        "id": f"dramawave_{resolved}",
                        "provider": "dramawave",
                        "original_id": resolved,
                        "title": data.get("name") or "",
                        "cover": data.get("cover") or "",
                        "episodes": data.get("episode_count") or len(data.get("items") or []),
                        "summary": data.get("desc") or data.get("introduction") or "",
                        "badge": "",
                        "tags": ["Romance"],
                        "genre": ["Romance"],
                        "country": "CN",
                        "year": None,
                        "status": "ongoing",
                        "rating": 4.5,
                        "languages": ["en"],
                    }
            except Exception as e:
                print(f"Error getting dramawave detail: {e}")

        elif provider == "melolo":
            try:
                url = f"https://melolo.goodbos.online/api/detail/{orig_id}?lang=en&code={self.api_key}"
                resp = await self.client.get(url)
                if resp.status_code == 200:
                    raw = resp.json()
                    if raw.get("title") or raw.get("id"):
                        item = {
                            "id": f"melolo_{raw.get('id', orig_id)}",
                            "provider": "melolo",
                            "original_id": str(raw.get("id", orig_id)),
                            "title": raw.get("title") or "",
                            "cover": raw.get("cover") or "",
                            "episodes": raw.get("episodes") or len(raw.get("videos") or []),
                            "summary": raw.get("intro") or "",
                            "badge": "",
                            "tags": ["Drama"],
                            "genre": ["Drama"],
                            "country": "",
                            "year": None,
                            "status": "ongoing",
                            "rating": 4.5,
                            "languages": ["en"],
                        }
            except Exception as e:
                print(f"Error getting melolo detail: {e}")

        elif provider == "vigloo":
            try:
                url = f"https://vigloo.goodbos.online/api/detail?id={orig_id}&lang=en&code={self.api_key}"
                resp = await self.client.get(url, headers={"x-token": self.api_key})
                if resp.status_code == 200:
                    raw = resp.json().get("program") or resp.json().get("data") or resp.json()
                    if isinstance(raw, dict) and (raw.get("title") or raw.get("id")):
                        from app.services.catalog import clean_tag_list, clean_text_field, normalize_item
                        normalized = normalize_item("vigloo", raw) or {}
                        tags = clean_tag_list(raw.get("genres") or normalized.get("tags") or [])
                        summary = clean_text_field(
                            raw.get("synopsis")
                            or raw.get("logLine")
                            or raw.get("description")
                            or normalized.get("summary")
                            or ""
                        )
                        item = {
                            "id": f"vigloo_{raw.get('id', orig_id)}",
                            "provider": "vigloo",
                            "original_id": str(raw.get("id", orig_id)),
                            "title": (raw.get("title") or normalized.get("title") or "").strip(),
                            "cover": normalized.get("cover") or "",
                            "episodes": int(raw.get("episodeCount") or raw.get("seasonCount") or normalized.get("episodes") or 0),
                            "summary": summary,
                            "badge": "",
                            "tags": tags or ["Drama"],
                            "genre": tags[:4] if tags else ["Drama"],
                            "country": "",
                            "year": None,
                            "status": "ongoing" if raw.get("ongoingStatus") else "completed",
                            "rating": 4.5,
                            "languages": ["en"],
                        }
                        # Prefer episode count from episodes API when available
                        try:
                            ep_resp = await self.client.get(
                                f"https://vigloo.goodbos.online/api/episodes?id={orig_id}&lang=en&code={self.api_key}",
                                headers={"x-token": self.api_key},
                            )
                            if ep_resp.status_code == 200:
                                payloads = (ep_resp.json() or {}).get("payloads") or []
                                if isinstance(payloads, list) and payloads:
                                    item["episodes"] = len(payloads)
                        except Exception:
                            pass
            except Exception as e:
                print(f"Error getting vigloo detail: {e}")

        elif provider in ("flextv", "reelbuzz", "reelife", "shortswave", "cubetv", "moboreels"):
            # Prefer catalog cache / list entry; detail endpoints vary widely
            pass
        if not item and provider:
            try:
                trending = await self.get_trending(provider)
                hit = next((i for i in trending if i.get("id") in (drama_id, requested_id)), None)
                if hit:
                    item = {
                        **hit,
                        "genre": hit.get("genre") or hit.get("tags") or ["Drama"],
                        "country": hit.get("country", "CN"),
                        "year": hit.get("year"),
                        "status": hit.get("status", "ongoing"),
                        "rating": hit.get("rating", 4.5),
                        "languages": hit.get("languages") or ["en"],
                    }
            except Exception as e:
                print(f"Error resolving detail from trending: {e}")

        # 3) Unified live catalog (covers providers that only have list APIs wired)
        if not item:
            try:
                from app.services.catalog import catalog_service
                catalog = await catalog_service.get_unified_catalog()
                item = next((i for i in catalog if i.get("id") in (drama_id, requested_id)), None)
            except Exception as e:
                print(f"Error resolving detail from catalog: {e}")

        # 4) Local demo catalog fallback
        if not item:
            item = next((i for i in self._catalog() if i["id"] in (drama_id, requested_id)), None)

        if not item:
            return None

        detail = self._normalize_detail(item)
        cache.set(cache_key, detail, ttl_seconds=3600)
        return detail

    async def get_related(self, drama_id: str, limit: int = 6) -> List[Dict[str, Any]]:
        """Same-provider suggestions from the in-memory catalog (no extra upstream hop)."""
        parts = drama_id.split("_", 1)
        provider = parts[0] if len(parts) == 2 else ""

        pool: List[Dict[str, Any]] = []
        try:
            from app.services.catalog import catalog_service
            pool = await catalog_service.get_unified_catalog(lang="en", provider=provider or None)
        except Exception:
            pool = []

        if len(pool) < limit:
            catalog = self._catalog()
            seen = {i["id"] for i in pool}
            pool = pool + [
                i for i in catalog
                if i["id"] not in seen and (not provider or i.get("provider") == provider)
            ]

        from app.services.catalog import filter_hidden_items
        pool = filter_hidden_items(pool)
        return [i for i in pool if i.get("id") != drama_id][:limit]

    def _fallback_episodes(self, orig_id: str) -> List[Dict[str, Any]]:
        # Local demo MP4 (served by Vite from frontend/public) — Google sample bucket now 403s
        demo_stream = "/samples/demo.mp4"
        return [
            {"id": f"{orig_id}_1", "episode_num": 1, "title": "Episode 1: The Encounter", "video_url": demo_stream, "is_locked": False},
            {"id": f"{orig_id}_2", "episode_num": 2, "title": "Episode 2: The Secret Betrayal", "video_url": demo_stream, "is_locked": False},
            {"id": f"{orig_id}_3", "episode_num": 3, "title": "Episode 3: Turning Point (Last Free Ep)", "video_url": demo_stream, "is_locked": False},
            {"id": f"{orig_id}_4", "episode_num": 4, "title": "Episode 4: The Revelation (Locked)", "video_url": demo_stream, "is_locked": True},
            {"id": f"{orig_id}_5", "episode_num": 5, "title": "Episode 5: All In (Locked)", "video_url": demo_stream, "is_locked": True},
        ]

aggregator = ProviderAggregator()

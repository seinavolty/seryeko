#!/usr/bin/env python3
"""
SeryeKo — API Endpoint Analyzer
Crawls all 44 providers from DramaBuzz and analyzes their endpoints.

Usage:
    python3 api_analyzer.py
    python3 api_analyzer.py --provider dramabox
    python3 api_analyzer.py --test         # test endpoints with real requests
    python3 api_analyzer.py --output json  # output to providers_report.json

API Key: Set via DRAMABUZZ_API_KEY env var or --key argument
"""

import os
import asyncio
import json
import re
import sys
import argparse
import time
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin, urlparse

import urllib.request
import urllib.error

try:
    import aiohttp
    HAS_AIOHTTP = True
except ImportError:
    HAS_AIOHTTP = False

# ─── Config ───────────────────────────────────────────────────────────────────

API_KEY         = os.getenv("DRAMABUZZ_API_KEY", "")
STATUS_ENDPOINT = f"https://api.dramabuzz.sbs/api/status?key={API_KEY}" if API_KEY else "https://api.dramabuzz.sbs/api/status"
TIMEOUT         = 15  # seconds per request
CONCURRENCY     = 5   # parallel provider fetches

# Known endpoint patterns from documentation analysis
COMMON_ENDPOINT_PATTERNS = [
    ("GET", "/api/home",                "Homepage content feed"),
    ("GET", "/api/trending",            "Trending dramas"),
    ("GET", "/api/popular",             "Popular dramas"),
    ("GET", "/api/hot",                 "Hot/viral dramas"),
    ("GET", "/api/new",                 "New dramas"),
    ("GET", "/api/latest",              "Latest content"),
    ("GET", "/api/recommended",         "Recommended dramas"),
    ("GET", "/api/recommend",           "Recommended (alt)"),
    ("GET", "/api/ranking",             "Drama rankings"),
    ("GET", "/api/search",              "Search dramas"),
    ("GET", "/api/languages",           "Available languages"),
    ("GET", "/api/detail/{id}",         "Drama detail by ID"),
    ("GET", "/api/allepisodes/{id}",    "All episodes + video URLs"),
    ("GET", "/api/allepisode",          "All episodes (query param bookId)"),
    ("GET", "/api/drama/{id}",          "Drama by ID (alt)"),
    ("GET", "/api/chapters/{id}",       "Chapter/episode list"),
    ("GET", "/api/batchload/{id}",      "Batch load episodes + video"),
    ("GET", "/api/browse",              "Browse with pagination"),
    ("GET", "/api/list",                "Drama list by category"),
    ("GET", "/api/category/{id}",       "Category content"),
    ("GET", "/api/vip",                 "VIP/premium dramas"),
    ("GET", "/api/animate",             "Anime content"),
    ("GET", "/api/anime",               "Anime feed"),
    # Versioned variants
    ("GET", "/api/v1/popular",          "Popular (v1)"),
    ("GET", "/api/v1/new",              "New (v1)"),
    ("GET", "/api/v1/hot",              "Hot (v1)"),
    ("GET", "/api/v1/search",           "Search (v1)"),
    ("GET", "/api/v1/detail/{id}",      "Detail (v1)"),
    ("GET", "/api/v1/alleps/{id}",      "All episodes (v1)"),
    ("GET", "/api/v1/languages",        "Languages (v1)"),
    ("GET", "/api/v1/ranking",          "Ranking (v1)"),
    ("GET", "/api/v1/vip",              "VIP (v1)"),
    ("GET", "/api/v1/category/{id}",    "Category (v1)"),
    # StarShort specific (via drakula proxy)
    ("GET", "/api/starshort/content/hot",         "StarShort Hot"),
    ("GET", "/api/starshort/content/latest",      "StarShort Latest"),
    ("GET", "/api/starshort/content/trending",    "StarShort Trending"),
    ("GET", "/api/starshort/content/recommended", "StarShort Recommended"),
]

# Provider-specific documented endpoints (from API doc analysis)
PROVIDER_KNOWN_ENDPOINTS = {
    "dramabox": [
        ("GET", "/api/dramabox/trending",      "Trending", {"lang": "en"}),
        ("GET", "/api/dramabox/search",        "Search",   {"query": "love", "lang": "en"}),
        ("GET", "/api/dramabox/allepisode",    "Episodes", {"bookId": "41000102982"}),
        ("GET", "/api/dramabox/browse",        "Browse",   {"page": "1", "lang": "en"}),
        ("GET", "/api/dramabox/languages",     "Languages", {}),
    ],
    "shortmax": [
        ("GET", "/api/v1/languages",    "Languages",    {}),
        ("GET", "/api/v1/popular",      "Popular",      {"lang": "en", "page": "1"}),
        ("GET", "/api/v1/new",          "New Dramas",   {"lang": "en", "page": "1"}),
        ("GET", "/api/v1/hot",          "Hot",          {"lang": "en", "page": "1"}),
        ("GET", "/api/v1/vip",          "VIP",          {"lang": "en", "page": "1"}),
        ("GET", "/api/v1/ranking",      "Ranking",      {"lang": "en"}),
        ("GET", "/api/v1/search",       "Search",       {"lang": "en", "q": "love"}),
        ("GET", "/api/v1/detail/12345", "Detail",       {"lang": "en"}),
        ("GET", "/api/v1/alleps/12345", "All Episodes", {"lang": "en"}),
    ],
    "dramawave": [
        ("GET", "/api/home",        "Homepage",     {"lang": "en"}),
        ("GET", "/api/new-drama",   "New Dramas",   {"lang": "en", "next": "1"}),
        ("GET", "/api/recommend",   "Recommended",  {"lang": "en", "next": "1"}),
        ("GET", "/api/anime",       "Anime",        {"lang": "en", "next": "1"}),
        ("GET", "/api/search",      "Search",       {"q": "love", "lang": "en", "next": "1"}),
        ("GET", "/api/drama/1",     "Drama Detail", {"lang": "en"}),
    ],
    "reelshort": [
        ("GET", "/chapters/1",      "Chapters",         {}),
        ("GET", "/allepisodes/1",   "All Episodes",     {}),
        ("GET", "/languages",       "Languages",        {}),
    ],
    "flickreels": [
        ("GET", "/api/home",        "Homepage",     {}),
        ("GET", "/api/list",        "List",         {}),
        ("GET", "/trending",        "Trending",     {}),
        ("GET", "/search",          "Search",       {"q": "love"}),
        ("GET", "/languages",       "Languages",    {}),
        ("GET", "/batchload/1",     "Batch Load",   {}),
    ],
    "starshort": [
        ("GET", "/api/starshort/content/hot",         "Hot",         {"locale": "en"}),
        ("GET", "/api/starshort/content/latest",      "Latest",      {"locale": "en"}),
        ("GET", "/api/starshort/content/trending",    "Trending",    {"locale": "en"}),
        ("GET", "/api/starshort/content/recommended", "Recommended", {"locale": "en"}),
    ],
}

# Authentication patterns per provider
AUTH_PATTERNS = {
    "dramabox":  {"header": "x-token"},
    "default":   {"param": "token"},
    "starshort": {"param": "code"},
    "flickreels":{"param": "token"},
    "dramawave": {"param": "token"},
}

# ─── Sync fetch fallback (if aiohttp not installed) ───────────────────────────

def sync_fetch(url: str, timeout: int = TIMEOUT) -> tuple[int, dict | None, str]:
    """Returns (status_code, json_body, error_string)"""
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "SeryeKo-Analyzer/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            body = resp.read().decode("utf-8", errors="replace")
            try:
                return resp.status, json.loads(body), ""
            except json.JSONDecodeError:
                return resp.status, None, "non-JSON response"
    except urllib.error.HTTPError as e:
        return e.code, None, str(e)
    except Exception as e:
        return 0, None, str(e)


# ─── Provider class ───────────────────────────────────────────────────────────

class Provider:
    def __init__(self, data: dict):
        self.id: str          = data["id"]
        self.name: str        = data["name"]
        self.status: str      = data["status"]
        self.logo: str        = data.get("logo", "")
        self.api_url: str     = data.get("api", "") or ""
        self.api_doc_url: str = self.api_url  # same as api in the status response
        self.endpoints: list  = []
        self.errors: list     = []
        self.base_url: str    = self._extract_base()

    def _extract_base(self) -> str:
        if not self.api_url:
            return ""
        parsed = urlparse(self.api_url)
        return f"{parsed.scheme}://{parsed.netloc}"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "status": self.status,
            "api_doc_url": self.api_doc_url,
            "base_url": self.base_url,
            "endpoints": self.endpoints,
            "errors": self.errors,
        }


# ─── Analyzers ────────────────────────────────────────────────────────────────

def analyze_api_doc_html(html: str, provider_id: str) -> list[dict]:
    """Extract endpoint patterns from HTML API doc pages."""
    endpoints = []

    # Match GET/POST /api/... patterns
    patterns = [
        r"(GET|POST|PUT|DELETE)\s+(/[^\s\"<>]+)",            # method PATH
        r"\"method\":\s*\"(GET|POST)\",\s*\"path\":\s*\"([^\"]+)\"",
        r"href=\"(/api/[^\"]+)\"",
        r"curl[^#\n]*?\"(https?://[^\s\"]+)\"",
    ]

    for pat in patterns:
        for match in re.finditer(pat, html, re.IGNORECASE):
            groups = match.groups()
            if len(groups) == 2:
                method, path = groups
                endpoints.append({
                    "method": method.upper(),
                    "path": path,
                    "description": "discovered from API doc",
                    "source": "html_parse",
                })
            elif len(groups) == 1:
                url = groups[0]
                endpoints.append({
                    "method": "GET",
                    "path": url,
                    "description": "discovered from curl example",
                    "source": "html_parse",
                })

    # Deduplicate
    seen = set()
    deduped = []
    for ep in endpoints:
        key = (ep["method"], ep["path"])
        if key not in seen:
            seen.add(key)
            deduped.append(ep)

    return deduped


def get_known_endpoints(provider_id: str) -> list[dict]:
    """Return documented endpoints for known providers."""
    if provider_id not in PROVIDER_KNOWN_ENDPOINTS:
        return []
    return [
        {
            "method": m,
            "path": p,
            "description": d,
            "params": params,
            "source": "documentation",
        }
        for m, p, d, params in PROVIDER_KNOWN_ENDPOINTS[provider_id]
    ]


# ─── Fetch & test logic ───────────────────────────────────────────────────────

def build_test_url(base_url: str, path: str, provider_id: str) -> str:
    """Build a testable URL with required auth params."""
    auth = AUTH_PATTERNS.get(provider_id, AUTH_PATTERNS["default"])
    # Replace template placeholders with safe test values
    path = re.sub(r"\{[^}]+\}", "1", path)
    url = urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))
    # Add auth param
    sep = "&" if "?" in url else "?"
    if "param" in auth:
        url = f"{url}{sep}{auth['param']}={API_KEY}"
    elif "header" in auth:
        pass  # handle in headers
    return url


def test_endpoint_sync(base_url: str, path: str, provider_id: str) -> dict:
    """Test a single endpoint synchronously."""
    url = build_test_url(base_url, path, provider_id)
    auth = AUTH_PATTERNS.get(provider_id, AUTH_PATTERNS["default"])
    headers = {"User-Agent": "SeryeKo-Analyzer/1.0"}
    if "header" in auth:
        headers[auth["header"]] = API_KEY

    t0 = time.monotonic()
    status, body, error = sync_fetch(url)
    latency_ms = int((time.monotonic() - t0) * 1000)

    result = {
        "url": url,
        "status_code": status,
        "latency_ms": latency_ms,
        "error": error,
        "has_data": False,
        "item_count": None,
        "sample_keys": [],
    }

    if body:
        result["has_data"] = True
        if isinstance(body, list):
            result["item_count"] = len(body)
            if body and isinstance(body[0], dict):
                result["sample_keys"] = list(body[0].keys())[:8]
        elif isinstance(body, dict):
            result["item_count"] = sum(
                len(v) for v in body.values() if isinstance(v, list)
            ) or 1
            result["sample_keys"] = list(body.keys())[:8]

    return result


# ─── Main analyzer ────────────────────────────────────────────────────────────

def fetch_providers() -> list[Provider]:
    """Fetch provider list from status API."""
    print(f"📡  Fetching provider list from DramaBuzz...")
    status, body, error = sync_fetch(STATUS_ENDPOINT)
    if not body:
        raise RuntimeError(f"Failed to fetch providers: HTTP {status} — {error}")
    platforms = body.get("platforms", [])
    providers = [Provider(p) for p in platforms]
    print(f"✅  {len(providers)} providers found\n")
    return providers


def fetch_api_doc(provider: Provider) -> str:
    """Fetch the HTML API doc for a provider."""
    if not provider.api_doc_url:
        return ""
    _, body, _ = sync_fetch(provider.api_doc_url)
    if body and isinstance(body, dict):
        return json.dumps(body)
    try:
        req = urllib.request.Request(
            provider.api_doc_url,
            headers={"User-Agent": "SeryeKo-Analyzer/1.0"}
        )
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception:
        return ""


def analyze_provider(provider: Provider, test_endpoints: bool = False) -> Provider:
    """Run full analysis on a single provider."""
    print(f"  🔍  [{provider.id}] {provider.name} — status: {provider.status}")

    if provider.status != "active":
        print(f"       ⚠️   Skipped (not active)")
        return provider

    if not provider.base_url:
        provider.errors.append("No API base URL available")
        print(f"       ❌  No API URL")
        return provider

    # 1. Use known documented endpoints if available
    known = get_known_endpoints(provider.id)
    if known:
        provider.endpoints = known
        print(f"       📚  {len(known)} documented endpoints loaded")

    # 2. Fetch and parse API doc HTML for additional endpoints
    html = fetch_api_doc(provider)
    if html:
        discovered = analyze_api_doc_html(html, provider.id)
        # Merge without duplicates
        existing_paths = {ep["path"] for ep in provider.endpoints}
        new_eps = [ep for ep in discovered if ep["path"] not in existing_paths]
        if new_eps:
            provider.endpoints.extend(new_eps)
            print(f"       🕸️   {len(new_eps)} additional endpoints discovered from doc")

    # 3. If no endpoints found yet, apply common patterns
    if not provider.endpoints:
        guessed = []
        for method, path, desc in COMMON_ENDPOINT_PATTERNS:
            guessed.append({
                "method": method,
                "path": path,
                "description": desc,
                "source": "common_pattern",
            })
        provider.endpoints = guessed
        print(f"       💡  {len(guessed)} common pattern endpoints applied")

    # 4. Optionally test each endpoint
    if test_endpoints and provider.endpoints:
        print(f"       🚀  Testing {min(5, len(provider.endpoints))} endpoints...")
        for ep in provider.endpoints[:5]:  # limit to 5 per provider in test mode
            path = ep.get("path", "")
            test_result = test_endpoint_sync(provider.base_url, path, provider.id)
            ep["test"] = test_result
            icon = "✅" if test_result["status_code"] in (200, 201) else "❌"
            print(f"           {icon}  {path} → {test_result['status_code']} ({test_result['latency_ms']}ms)")
            time.sleep(0.5)  # polite delay

    return provider


def generate_report(providers: list[Provider], test_mode: bool) -> dict:
    """Build the final analysis report."""
    active   = [p for p in providers if p.status == "active"]
    maint    = [p for p in providers if p.status == "maintenance"]
    coming   = [p for p in providers if p.status == "coming"]
    no_api   = [p for p in providers if p.status == "active" and not p.base_url]

    report = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "api_key_prefix": API_KEY[:8] + "...",
        "summary": {
            "total_providers": len(providers),
            "active": len(active),
            "maintenance": len(maint),
            "coming_soon": len(coming),
            "no_api_url": len(no_api),
            "tested": test_mode,
        },
        "providers": [p.to_dict() for p in providers],
        "endpoint_pattern_matrix": build_endpoint_matrix(active),
        "recommendations": build_recommendations(providers),
    }
    return report


def build_endpoint_matrix(active_providers: list[Provider]) -> dict:
    """
    Build a matrix showing which endpoint types each provider supports.
    """
    endpoint_types = [
        "home", "trending", "popular", "hot", "new", "latest",
        "recommended", "ranking", "vip", "anime",
        "search", "detail", "allepisodes", "chapters",
        "browse", "list", "languages", "batchload",
    ]

    matrix = {}
    for ep_type in endpoint_types:
        matrix[ep_type] = []
        for p in active_providers:
            for ep in p.endpoints:
                path = ep.get("path", "").lower()
                if ep_type in path:
                    matrix[ep_type].append(p.id)
                    break

    return matrix


def build_recommendations(providers: list[Provider]) -> list[dict]:
    """Generate integration recommendations."""
    recs = []

    active_with_api = [
        p for p in providers
        if p.status == "active" and p.base_url and p.id in PROVIDER_KNOWN_ENDPOINTS
    ]

    recs.append({
        "tier": "Tier 1 — MVP Priority",
        "reason": "Fully documented, rich endpoint set, multi-language support",
        "providers": ["dramabox", "shortmax", "dramawave", "reelshort", "flickreels"],
    })
    recs.append({
        "tier": "Tier 2 — Phase 2",
        "reason": "Active with API, needs doc parsing",
        "providers": [
            p.id for p in providers
            if p.status == "active" and p.base_url
            and p.id not in ["dramabox","shortmax","dramawave","reelshort","flickreels","starshort"]
        ][:10],
    })
    recs.append({
        "tier": "Tier 3 — Monitor",
        "reason": "Maintenance mode — check back later",
        "providers": [p.id for p in providers if p.status == "maintenance"],
    })

    return recs


def print_summary_table(report: dict):
    """Print a formatted CLI summary table."""
    print("\n" + "═" * 70)
    print("  SERYEKO — API PROVIDER ANALYSIS REPORT")
    print("═" * 70)
    s = report["summary"]
    print(f"  Generated : {report['generated_at']}")
    print(f"  API Key   : {report['api_key_prefix']}")
    print()
    print(f"  {'Total Providers':<25} {s['total_providers']:>4}")
    print(f"  {'Active (with API)':<25} {s['active']:>4}")
    print(f"  {'Maintenance':<25} {s['maintenance']:>4}")
    print(f"  {'Coming Soon':<25} {s['coming_soon']:>4}")
    print(f"  {'Active / No API URL':<25} {s['no_api_url']:>4}")
    print()

    print("  ─ PROVIDERS (active with API) ─────────────────────────────────")
    print(f"  {'ID':<16} {'Name':<18} {'Endpoints':<10} {'Source'}")
    print(f"  {'─'*16} {'─'*18} {'─'*10} {'─'*20}")
    for p in report["providers"]:
        if p["status"] == "active" and p["base_url"]:
            eps = p["endpoints"]
            sources = set(ep.get("source","?") for ep in eps)
            src_label = "/".join(sorted(sources))
            print(f"  {p['id']:<16} {p['name']:<18} {len(eps):<10} {src_label}")

    print()
    print("  ─ ENDPOINT COVERAGE MATRIX ────────────────────────────────────")
    matrix = report["endpoint_pattern_matrix"]
    for ep_type, providers in matrix.items():
        if providers:
            plist = ", ".join(providers[:6])
            extra = f" +{len(providers)-6} more" if len(providers) > 6 else ""
            print(f"  /{ep_type:<18} → {plist}{extra}")

    print()
    print("  ─ RECOMMENDATIONS ─────────────────────────────────────────────")
    for rec in report["recommendations"]:
        print(f"\n  [{rec['tier']}]")
        print(f"  Reason: {rec['reason']}")
        print(f"  Providers: {', '.join(rec['providers'])}")

    print()
    print("═" * 70)


# ─── CLI entry point ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SeryeKo API Endpoint Analyzer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--key",       help="DramaBuzz API Key (overrides DRAMABUZZ_API_KEY env var)")
    parser.add_argument("--provider",  help="Analyze a single provider ID only")
    parser.add_argument("--test",      action="store_true", help="HTTP-test endpoints (slower)")
    parser.add_argument("--output",    choices=["json", "table", "both"], default="both",
                        help="Output format (default: both)")
    parser.add_argument("--save",      help="Save JSON report to file path")
    args = parser.parse_args()

    print("🎬  SeryeKo API Analyzer")
    print(f"    Key prefix: {API_KEY[:8]}...\n")

    # Fetch all providers
    providers = fetch_providers()

    # Filter if --provider specified
    if args.provider:
        providers = [p for p in providers if p.id == args.provider]
        if not providers:
            print(f"❌  Provider '{args.provider}' not found")
            sys.exit(1)

    # Analyze each
    print("📊  Analyzing providers...\n")
    analyzed = []
    for p in providers:
        analyzed.append(analyze_provider(p, test_endpoints=args.test))
        time.sleep(0.3)  # polite delay between providers

    # Generate report
    report = generate_report(analyzed, test_mode=args.test)

    # Output
    if args.output in ("table", "both"):
        print_summary_table(report)

    if args.output in ("json", "both"):
        output_file = args.save or "providers_report.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        print(f"\n💾  Full JSON report saved → {output_file}")

    return report


if __name__ == "__main__":
    main()

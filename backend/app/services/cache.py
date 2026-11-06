"""Process + optional disk cache with stale-while-revalidate support."""
from __future__ import annotations

import json
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Optional, Tuple


def _default_disk_dir() -> Optional[Path]:
    for candidate in (
        os.getenv("CACHE_DIR"),
        "/data/cache" if Path("/data").is_dir() else None,
        str(Path(tempfile.gettempdir()) / "seryeko_cache"),
    ):
        if not candidate:
            continue
        path = Path(candidate)
        try:
            path.mkdir(parents=True, exist_ok=True)
            return path
        except OSError:
            continue
    return None


class SimpleCache:
    def __init__(self, disk_dir: Optional[Path] = None):
        self._cache: dict[str, Tuple[Any, float, float]] = {}
        # value, soft_expiry (fresh until), hard_expiry (usable stale until)
        self._disk_dir = disk_dir if disk_dir is not None else _default_disk_dir()

    def _disk_path(self, key: str) -> Optional[Path]:
        if not self._disk_dir:
            return None
        safe = "".join(c if c.isalnum() or c in "._-" else "_" for c in key)
        return self._disk_dir / f"{safe}.json"

    def _read_disk(self, key: str) -> Optional[Tuple[Any, float, float]]:
        path = self._disk_path(key)
        if not path or not path.exists():
            return None
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
            return payload["value"], float(payload["soft"]), float(payload["hard"])
        except Exception:
            return None

    def _write_disk(self, key: str, value: Any, soft: float, hard: float) -> None:
        path = self._disk_path(key)
        if not path:
            return
        tmp = path.with_suffix(".tmp")
        try:
            tmp.write_text(
                json.dumps({"value": value, "soft": soft, "hard": hard}, ensure_ascii=False),
                encoding="utf-8",
            )
            tmp.replace(path)
        except Exception:
            try:
                if tmp.exists():
                    tmp.unlink()
            except OSError:
                pass

    def get(self, key: str) -> Optional[Any]:
        """Return value only while still fresh (not stale)."""
        entry = self.get_entry(key)
        if not entry:
            return None
        value, fresh, _stale_ok = entry
        return value if fresh else None

    def get_entry(self, key: str) -> Optional[Tuple[Any, bool, bool]]:
        """
        Returns (value, is_fresh, is_usable).
        - is_fresh: within soft TTL
        - is_usable: within hard TTL (may be stale)
        """
        now = time.time()
        row = self._cache.get(key)
        if row is None:
            row = self._read_disk(key)
            if row is not None:
                self._cache[key] = row

        if row is None:
            return None

        value, soft, hard = row
        if now > hard:
            self._cache.pop(key, None)
            return None
        return value, now <= soft, True

    def set(
        self,
        key: str,
        value: Any,
        ttl_seconds: int = 1200,
        stale_ttl_seconds: Optional[int] = None,
    ):
        now = time.time()
        soft = now + ttl_seconds if ttl_seconds > 0 else now + 10**12
        stale_extra = stale_ttl_seconds if stale_ttl_seconds is not None else max(ttl_seconds * 6, 3600)
        hard = soft + stale_extra
        self._cache[key] = (value, soft, hard)
        self._write_disk(key, value, soft, hard)

    def clear(self):
        self._cache.clear()

    def delete(self, key: str) -> None:
        self._cache.pop(key, None)
        path = self._disk_path(key)
        if path and path.exists():
            try:
                path.unlink()
            except OSError:
                pass

    def delete_prefix(self, prefix: str) -> int:
        """Delete all in-memory (and matching disk) keys starting with prefix."""
        keys = [k for k in list(self._cache.keys()) if k.startswith(prefix)]
        for key in keys:
            self.delete(key)
        # Also sweep disk files that encode the same prefix
        if self._disk_dir and self._disk_dir.is_dir():
            safe_prefix = "".join(c if c.isalnum() or c in "._-" else "_" for c in prefix)
            for path in self._disk_dir.glob(f"{safe_prefix}*.json"):
                try:
                    path.unlink()
                except OSError:
                    pass
        return len(keys)


cache = SimpleCache()

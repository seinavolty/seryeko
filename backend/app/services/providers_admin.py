"""Admin-facing provider enable/disable backed by the ProviderConfig table."""
from __future__ import annotations

import datetime
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from app.models.schema import ProviderConfig
from app.services.catalog import PROVIDER_LIST_SOURCES, catalog_service, invalidate_provider_cache


def sync_provider_configs(db: Session) -> List[ProviderConfig]:
    """Ensure every known provider id has a ProviderConfig row (default: enabled)."""
    existing = {row.id: row for row in db.query(ProviderConfig).all()}
    changed = False
    for source in PROVIDER_LIST_SOURCES:
        pid = source["id"]
        if pid not in existing:
            row = ProviderConfig(id=pid, name=pid.replace("_", " ").title(), is_enabled=True, status="active")
            db.add(row)
            existing[pid] = row
            changed = True
    if changed:
        db.commit()
    return list(existing.values())


def list_providers(db: Session) -> List[Dict[str, Any]]:
    rows = sync_provider_configs(db)
    rows.sort(key=lambda r: r.id)
    return [
        {
            "id": r.id,
            "name": r.name,
            "is_enabled": bool(r.is_enabled),
            "status": r.status,
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


def set_provider_enabled(db: Session, provider_id: str, is_enabled: bool) -> ProviderConfig:
    row = db.query(ProviderConfig).filter(ProviderConfig.id == provider_id).first()
    if not row:
        row = ProviderConfig(id=provider_id, name=provider_id.replace("_", " ").title())
        db.add(row)
    row.is_enabled = is_enabled
    row.updated_at = datetime.datetime.utcnow()
    db.commit()
    db.refresh(row)
    invalidate_provider_cache()
    return row


async def refresh_provider_statuses(db: Session) -> Dict[str, Any]:
    """Pull live status from the DramaBuzz status API (PRD §7.1) and sync into ProviderConfig."""
    data = await catalog_service.fetch_status_platforms()
    platforms = data.get("platforms") or []
    by_id = {p.get("id"): p for p in platforms if isinstance(p, dict) and p.get("id")}

    sync_provider_configs(db)
    rows = db.query(ProviderConfig).all()
    updated = 0
    for row in rows:
        live = by_id.get(row.id)
        if live and live.get("status") and live["status"] != row.status:
            row.status = live["status"]
            row.updated_at = datetime.datetime.utcnow()
            updated += 1
    db.commit()
    return {"checked": len(rows), "updated": updated, "summary": data.get("summary") or {}}

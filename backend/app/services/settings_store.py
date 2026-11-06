"""Typed helpers around the generic AppSetting key/value table.

Keeps field names identical to PRD §10 ("Admin Panel — Pricing Settings")
plus the referral voucher + API key extensions added for the admin
command centre.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models.schema import AppSetting

# Defaults mirror app/config.py so behaviour is unchanged until an admin
# writes an override into the DB.
DEFAULTS: Dict[str, Any] = {
    "lifetime_price_php": settings.DEFAULT_LIFETIME_PRICE_PHP,
    "lifetime_price_usd": settings.DEFAULT_LIFETIME_PRICE_USD,
    "early_bird_enabled": False,
    "early_bird_price_php": settings.DEFAULT_LIFETIME_PRICE_PHP,
    "early_bird_cap": 0,
    "early_bird_sold": 0,
    "guest_preview_enabled": True,
    "guest_preview_episodes": settings.FREE_TRIAL_EPISODES,
    "referral_enabled": True,
    "referral_discount_type": "percent",
    "referral_discount_value": 15.0,
    "referral_commission_pct": 20.0,
    "referral_min_withdraw_php": 100.0,
    "paymongo_mode": "test",
    "dramabuzz_api_key": "",
    "paymongo_public_key": "",
    "paymongo_secret_key": "",
    "paymongo_webhook_secret": "",
}

# Keys that must never be echoed back in full over the admin API.
SECRET_KEYS = {"paymongo_secret_key", "paymongo_webhook_secret", "dramabuzz_api_key", "paymongo_public_key"}

_BOOL_KEYS = {"early_bird_enabled", "guest_preview_enabled", "referral_enabled"}
_FLOAT_KEYS = {
    "lifetime_price_php", "lifetime_price_usd", "early_bird_price_php",
    "referral_discount_value", "referral_commission_pct", "referral_min_withdraw_php",
}
_INT_KEYS = {"early_bird_cap", "early_bird_sold", "guest_preview_episodes"}


def _cast(key: str, raw: str) -> Any:
    if key in _BOOL_KEYS:
        return raw.lower() == "true"
    if key in _FLOAT_KEYS:
        try:
            return float(raw)
        except (TypeError, ValueError):
            return DEFAULTS.get(key)
    if key in _INT_KEYS:
        try:
            return int(float(raw))
        except (TypeError, ValueError):
            return DEFAULTS.get(key)
    return raw


def get_setting(db: Session, key: str, default: Optional[Any] = None) -> Any:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    if row is None or row.value is None or row.value == "":
        return default if default is not None else DEFAULTS.get(key)
    return _cast(key, row.value)


def set_setting(db: Session, key: str, value: Any) -> None:
    row = db.query(AppSetting).filter(AppSetting.key == key).first()
    str_value = "true" if value is True else "false" if value is False else str(value)
    if not row:
        row = AppSetting(key=key, value=str_value)
        db.add(row)
    else:
        row.value = str_value


def get_many(db: Session, keys: list[str]) -> Dict[str, Any]:
    return {k: get_setting(db, k) for k in keys}


def set_many(db: Session, values: Dict[str, Any]) -> None:
    for key, value in values.items():
        if value is None:
            continue
        set_setting(db, key, value)
    db.commit()


def get_pricing_settings(db: Session) -> Dict[str, Any]:
    keys = [
        "lifetime_price_php", "lifetime_price_usd",
        "early_bird_enabled", "early_bird_price_php", "early_bird_cap", "early_bird_sold",
        "guest_preview_enabled", "guest_preview_episodes",
    ]
    return get_many(db, keys)


def get_referral_settings(db: Session) -> Dict[str, Any]:
    keys = [
        "referral_enabled", "referral_discount_type", "referral_discount_value",
        "referral_commission_pct", "referral_min_withdraw_php",
    ]
    return get_many(db, keys)


def _mask(value: str) -> str:
    if not value:
        return ""
    if len(value) <= 4:
        return "••••"
    return f"••••{value[-4:]}"


def get_keys_settings(db: Session, masked: bool = True) -> Dict[str, Any]:
    """Return API key settings, falling back to env vars when unset in DB."""
    env_fallback = {
        "dramabuzz_api_key": settings.DRAMABUZZ_API_KEY,
        "paymongo_public_key": settings.PAYMONGO_PUBLIC_KEY,
        "paymongo_secret_key": settings.PAYMONGO_SECRET_KEY,
        "paymongo_webhook_secret": settings.PAYMONGO_WEBHOOK_SECRET,
    }
    out: Dict[str, Any] = {"paymongo_mode": get_setting(db, "paymongo_mode", "test")}
    for key, env_value in env_fallback.items():
        db_value = get_setting(db, key, "")
        effective = db_value or env_value or ""
        out[key] = _mask(effective) if masked else effective
        out[f"{key}_source"] = "database" if db_value else ("env" if env_value else "unset")
    return out


def get_guest_preview_episodes(db: Session) -> int:
    if not get_setting(db, "guest_preview_enabled", True):
        return 0
    return int(get_setting(db, "guest_preview_episodes", settings.FREE_TRIAL_EPISODES))

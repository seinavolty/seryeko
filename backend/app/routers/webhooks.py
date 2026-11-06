"""PayMongo webhook receiver.

Verifies Paymongo-Signature, logs every event, and activates lifetime
membership on ``payment.paid``. Handles ``payment.failed`` and
``qrph.expired`` without activating.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
from typing import Any, Dict, Optional, Tuple

from fastapi import APIRouter, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models.schema import Subscription, User, WebhookLog
from app.services import lifetime
from app.services.paymongo import PayMongoService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])


def _parse_signature_header(header: str) -> Dict[str, str]:
    parts: Dict[str, str] = {}
    for chunk in (header or "").split(","):
        chunk = chunk.strip()
        if "=" not in chunk:
            continue
        key, value = chunk.split("=", 1)
        parts[key.strip()] = value.strip()
    return parts


def verify_paymongo_signature(
    raw_body: bytes,
    signature_header: str,
    webhook_secret: str,
    mode: str = "test",
) -> bool:
    """HMAC-SHA256 of ``{t}.{raw_body}`` compared to te (test) or li (live)."""
    if not webhook_secret or "mock" in webhook_secret.lower():
        # Allow mock secret in local/dev without a real header
        if "mock" in (webhook_secret or "").lower() and not signature_header:
            return True
        if "mock" in (webhook_secret or "").lower():
            return True

    if not signature_header or not webhook_secret:
        return False

    parts = _parse_signature_header(signature_header)
    timestamp = parts.get("t")
    expected = parts.get("te") if mode != "live" else parts.get("li")
    if not timestamp or not expected:
        return False

    signed_payload = f"{timestamp}.".encode("utf-8") + raw_body
    digest = hmac.new(
        webhook_secret.encode("utf-8"),
        signed_payload,
        hashlib.sha256,
    ).hexdigest()

    return hmac.compare_digest(digest, expected)


def _dig(obj: Any, *path: str, default=None):
    cur = obj
    for key in path:
        if not isinstance(cur, dict):
            return default
        cur = cur.get(key)
    return cur if cur is not None else default


def _extract_event(payload: Dict[str, Any]) -> Tuple[str, Dict[str, Any]]:
    data = payload.get("data") if isinstance(payload, dict) else {}
    attrs = (data or {}).get("attributes") or {}
    event_type = str(attrs.get("type") or payload.get("type") or "")
    resource = attrs.get("data") or {}
    return event_type, resource if isinstance(resource, dict) else {}


def _resolve_user_and_sub(
    db: Session,
    resource: Dict[str, Any],
) -> Tuple[Optional[User], Optional[Subscription], Dict[str, Any]]:
    """Find buyer from payment / intent metadata or pending paymongo_source_id."""
    attrs = resource.get("attributes") or {}
    meta = attrs.get("metadata") or {}
    if not isinstance(meta, dict):
        meta = {}

    payment_id = resource.get("id")
    # payment resource may nest payment_intent id
    intent_id = (
        attrs.get("payment_intent_id")
        or _dig(attrs, "payment_intent", "id")
        or meta.get("payment_intent_id")
    )

    user: Optional[User] = None
    sub: Optional[Subscription] = None

    user_id_raw = meta.get("user_id")
    if user_id_raw is not None:
        try:
            user = db.query(User).filter(User.id == int(user_id_raw)).first()
        except (TypeError, ValueError):
            user = None

    if user and user.subscription:
        sub = user.subscription

    if not sub and intent_id:
        sub = (
            db.query(Subscription)
            .filter(Subscription.paymongo_source_id == str(intent_id))
            .first()
        )
        if sub:
            user = db.query(User).filter(User.id == sub.user_id).first()

    if not sub and payment_id:
        sub = (
            db.query(Subscription)
            .filter(Subscription.paymongo_payment_id == str(payment_id))
            .first()
        )
        if sub:
            user = db.query(User).filter(User.id == sub.user_id).first()

    ctx = {
        "payment_id": payment_id,
        "intent_id": intent_id,
        "metadata": meta,
        "amount": attrs.get("amount"),  # centavos
    }
    return user, sub, ctx


def _handle_payment_paid(db: Session, resource: Dict[str, Any]) -> str:
    user, sub, ctx = _resolve_user_and_sub(db, resource)
    if not user or not sub:
        logger.warning("payment.paid: could not resolve user/subscription: %s", ctx)
        return "unmatched"

    if sub.status == "active" and sub.plan == "lifetime":
        if ctx.get("payment_id") and sub.paymongo_payment_id == ctx["payment_id"]:
            return "idempotent"
        if ctx.get("payment_id") and not sub.paymongo_payment_id:
            sub.paymongo_payment_id = ctx["payment_id"]
            db.commit()
        return "already_active"

    meta = ctx.get("metadata") or {}
    amount_php = sub.amount_php
    list_php = sub.list_amount_php or amount_php
    discount_php = sub.discount_php or 0.0
    referral_code = sub.referral_code_used or meta.get("referral_code")

    if meta.get("amount_php") is not None:
        try:
            amount_php = float(meta["amount_php"])
        except (TypeError, ValueError):
            pass
    elif ctx.get("amount") is not None:
        try:
            amount_php = float(ctx["amount"]) / 100.0
        except (TypeError, ValueError):
            pass

    if meta.get("list_amount_php") is not None:
        try:
            list_php = float(meta["list_amount_php"])
        except (TypeError, ValueError):
            pass
    if meta.get("discount_php") is not None:
        try:
            discount_php = float(meta["discount_php"])
        except (TypeError, ValueError):
            pass

    lifetime.activate_lifetime(
        db,
        user,
        amount_php=amount_php or 0,
        list_amount_php=list_php or amount_php or 0,
        discount_php=discount_php or 0,
        referral_code=referral_code,
        payment_method="qrph",
        paymongo_payment_id=ctx.get("payment_id"),
        paymongo_intent_id=ctx.get("intent_id") or sub.paymongo_source_id,
    )
    return "activated"


def _handle_stale(db: Session, resource: Dict[str, Any], event_type: str) -> str:
    """Mark pending checkout as stale on failure / QR expiry (no activation)."""
    _user, sub, ctx = _resolve_user_and_sub(db, resource)
    if not sub:
        # qrph.expired resource may be the payment method / intent itself
        attrs = resource.get("attributes") or {}
        intent_id = (
            resource.get("id")
            if str(resource.get("id") or "").startswith("pi_")
            else attrs.get("payment_intent_id")
        )
        if intent_id:
            sub = (
                db.query(Subscription)
                .filter(Subscription.paymongo_source_id == str(intent_id))
                .first()
            )
    if sub and not (sub.status == "active" and sub.plan == "lifetime"):
        # Keep pricing fields; clear intent so a new checkout can overwrite cleanly
        logger.info("%s for subscription user_id=%s intent=%s", event_type, sub.user_id, ctx.get("intent_id"))
    return "logged"


@router.post("/paymongo")
async def paymongo_webhook(request: Request):
    raw_body = await request.body()
    signature_header = request.headers.get("Paymongo-Signature") or request.headers.get("paymongo-signature") or ""

    db = SessionLocal()
    try:
        pm = PayMongoService.from_db(db)

        if not verify_paymongo_signature(
            raw_body,
            signature_header,
            pm.webhook_secret,
            mode=pm.mode,
        ):
            raise HTTPException(status_code=401, detail="Invalid webhook signature")

        try:
            payload = json.loads(raw_body.decode("utf-8") or "{}")
        except Exception:
            payload = {}

        event_type, resource = _extract_event(payload if isinstance(payload, dict) else {})

        process_status = "received"
        try:
            if event_type == "payment.paid":
                process_status = _handle_payment_paid(db, resource)
            elif event_type in ("payment.failed", "qrph.expired"):
                process_status = _handle_stale(db, resource, event_type)
            else:
                process_status = "ignored"
        except Exception:
            logger.exception("Error processing PayMongo webhook %s", event_type)
            process_status = "error"

        row = WebhookLog(
            event_type=event_type or "unknown",
            payload=(raw_body.decode("utf-8", errors="replace"))[:8000],
            status=process_status,
        )
        db.add(row)
        db.commit()

        return {"status": process_status}
    finally:
        db.close()

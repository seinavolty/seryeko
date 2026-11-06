"""Shared lifetime membership activation used by checkout polling and PayMongo webhooks."""
from __future__ import annotations

import datetime
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from app.models.schema import Subscription, User
from app.services import referral, settings_store


def get_or_create_subscription(db: Session, user: User) -> Subscription:
    sub = user.subscription
    if not sub:
        sub = Subscription(user_id=user.id)
        db.add(sub)
        db.flush()
        user.subscription = sub
    return sub


def activate_lifetime(
    db: Session,
    user: User,
    *,
    amount_php: float,
    list_amount_php: float,
    discount_php: float = 0.0,
    referral_code: Optional[str] = None,
    payment_method: str = "qrph",
    paymongo_payment_id: Optional[str] = None,
    paymongo_intent_id: Optional[str] = None,
    commit: bool = True,
) -> Dict[str, Any]:
    """Activate lifetime access idempotently.

    If the user is already active with the same ``paymongo_payment_id``, this is a no-op.
    If already active with a different payment id, returns the existing subscription without
    re-attributing referral / early-bird.
    """
    sub = get_or_create_subscription(db, user)

    if (
        sub.status == "active"
        and sub.plan == "lifetime"
        and paymongo_payment_id
        and sub.paymongo_payment_id == paymongo_payment_id
    ):
        return _subscription_payload(sub, already_active=True)

    if sub.status == "active" and sub.plan == "lifetime":
        # Already unlocked (e.g. prior payment); still record payment id if missing.
        if paymongo_payment_id and not sub.paymongo_payment_id:
            sub.paymongo_payment_id = paymongo_payment_id
        if paymongo_intent_id and not sub.paymongo_source_id:
            sub.paymongo_source_id = paymongo_intent_id
        if commit:
            db.commit()
        return _subscription_payload(sub, already_active=True)

    code_row = referral.find_active_code(db, referral_code or "")

    sub.status = "active"
    sub.plan = "lifetime"
    sub.amount_php = float(amount_php)
    sub.list_amount_php = float(list_amount_php)
    sub.discount_php = float(discount_php)
    sub.referral_code_used = (referral_code or None)
    sub.currency = "PHP"
    sub.payment_method = payment_method or "qrph"
    if paymongo_payment_id:
        sub.paymongo_payment_id = paymongo_payment_id
    if paymongo_intent_id:
        sub.paymongo_source_id = paymongo_intent_id
    sub.activated_at = datetime.datetime.utcnow()
    db.flush()

    if code_row:
        referral.attribute_referral(db, user, code_row)
        referral.create_commission_for_purchase(
            db,
            buyer=user,
            subscription=sub,
            code_row=code_row,
            paid_php=float(amount_php),
            list_php=float(list_amount_php),
        )

    pricing_settings = settings_store.get_pricing_settings(db)
    if pricing_settings.get("early_bird_enabled"):
        cap = pricing_settings.get("early_bird_cap") or 0
        sold = pricing_settings.get("early_bird_sold") or 0
        if cap <= 0 or sold < cap:
            settings_store.set_setting(db, "early_bird_sold", sold + 1)

    if commit:
        db.commit()
        db.refresh(sub)
        _send_invoice(db, user, sub, payment_id=paymongo_payment_id, intent_id=paymongo_intent_id)

    return _subscription_payload(sub, already_active=False)


def _send_invoice(db: Session, user: User, sub: Subscription, *, payment_id, intent_id) -> None:
    """Email a receipt once per successful lifetime activation. Never raises."""
    try:
        from app.services import email as mailer

        paid_at = datetime.datetime.utcnow()
        mailer.send_invoice(
            user.email,
            full_name=user.full_name or "",
            reference=payment_id or intent_id or f"SUB-{sub.id}",
            amount_php=float(sub.amount_php or 0),
            list_amount_php=float(sub.list_amount_php or 0) or None,
            discount_php=float(sub.discount_php or 0),
            referral_code=sub.referral_code_used,
            paid_at_text=paid_at.strftime("%d %b %Y, %H:%M UTC"),
        )
    except Exception:  # pragma: no cover — mail must not break activation
        import logging

        logging.getLogger(__name__).exception("Failed to send invoice for user %s", user.id)


def _subscription_payload(sub: Subscription, *, already_active: bool) -> Dict[str, Any]:
    return {
        "status": "success",
        "already_active": already_active,
        "message": "Congratulations! Lifetime Access unlocked.",
        "subscription": {
            "status": sub.status,
            "plan": sub.plan,
            "activated_at": sub.activated_at,
            "amount_php": sub.amount_php,
        },
    }

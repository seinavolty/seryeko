"""Referral codes that double as checkout discount vouchers + commission tracking."""
from __future__ import annotations

import datetime
import random
import string
from typing import Any, Dict, Optional

from sqlalchemy.orm import Session

from sqlalchemy import func

from app.models.schema import ReferralCode, ReferralCommission, Subscription, User, WithdrawalRequest
from app.services import settings_store

_CODE_ALPHABET = string.ascii_uppercase + string.digits

# Philippine payout rails accepted for referral withdrawals
PH_WITHDRAW_METHODS = ("gcash", "maya", "bank", "grabpay")
MIN_WITHDRAW_DEFAULT = 100.0


def _random_suffix(length: int = 6) -> str:
    return "".join(random.choice(_CODE_ALPHABET) for _ in range(length))


def ensure_referral_code(db: Session, user: User) -> ReferralCode:
    """Every user gets exactly one referral code, created lazily on first access."""
    if user.referral_code:
        return user.referral_code

    for _ in range(8):
        candidate = f"DS-{_random_suffix()}"
        if not db.query(ReferralCode).filter(ReferralCode.code == candidate).first():
            row = ReferralCode(user_id=user.id, code=candidate, is_enabled=True)
            db.add(row)
            db.commit()
            db.refresh(row)
            return row
    raise RuntimeError("Could not generate a unique referral code")


def find_active_code(db: Session, code: str) -> Optional[ReferralCode]:
    if not code:
        return None
    row = (
        db.query(ReferralCode)
        .filter(ReferralCode.code == code.strip().upper(), ReferralCode.is_enabled.is_(True))
        .first()
    )
    return row


def compute_price(
    db: Session,
    original_php: float,
    referral_code: Optional[str],
    buyer_user: Optional[User],
) -> Dict[str, Any]:
    """Compute original vs. discounted lifetime price for a (possible) voucher code."""
    referral_enabled = settings_store.get_setting(db, "referral_enabled", True)
    result: Dict[str, Any] = {
        "original_php": round(original_php, 2),
        "discount_php": 0.0,
        "final_php": round(original_php, 2),
        "discount_label": None,
        "referral_code_applied": None,
        "error": None,
    }

    code_input = resolve_checkout_code(db, buyer_user, referral_code) or ""
    if not code_input:
        return result
    if not referral_enabled:
        result["error"] = "Referral vouchers are currently disabled."
        return result

    code_row = find_active_code(db, code_input)
    if not code_row:
        result["error"] = "That referral code is invalid or disabled."
        return result
    if buyer_user and code_row.user_id == buyer_user.id:
        result["error"] = "You can't use your own referral code."
        return result

    discount_type = code_row.discount_type or settings_store.get_setting(db, "referral_discount_type", "percent")
    discount_value = code_row.discount_value
    if discount_value is None:
        discount_value = settings_store.get_setting(db, "referral_discount_value", 15.0)

    if discount_type == "fixed":
        discount_php = min(float(discount_value), original_php)
        label = f"₱{discount_value:.0f} off"
    else:
        discount_php = round(original_php * (float(discount_value) / 100.0), 2)
        label = f"{discount_value:.0f}% off"

    final_php = max(0.0, round(original_php - discount_php, 2))

    result.update(
        {
            "discount_php": discount_php,
            "final_php": final_php,
            "discount_label": label,
            "referral_code_applied": code_row.code,
        }
    )
    return result


def attribute_referral(db: Session, buyer: User, code_row: ReferralCode) -> None:
    """Set User.referred_by_user_id once, immutably, if not already set."""
    if buyer.referred_by_user_id is not None:
        return
    if code_row.user_id == buyer.id:
        return
    buyer.referred_by_user_id = code_row.user_id
    buyer.referred_by_code = code_row.code


def signup_referral_code(db: Session, user: Optional[User]) -> Optional[str]:
    """Referral/voucher code locked in at signup (or recovered from referrer)."""
    if not user:
        return None
    stored = (getattr(user, "referred_by_code", None) or "").strip().upper()
    if stored:
        return stored
    if not user.referred_by_user_id:
        return None
    row = (
        db.query(ReferralCode)
        .filter(ReferralCode.user_id == user.referred_by_user_id)
        .first()
    )
    if not row:
        return None
    # Backfill so Upgrade /me can show it without another join next time
    user.referred_by_code = row.code
    try:
        db.commit()
    except Exception:
        db.rollback()
    return row.code


def resolve_checkout_code(
    db: Session,
    buyer_user: Optional[User],
    referral_code: Optional[str],
) -> Optional[str]:
    """Prefer explicitly entered code; otherwise reuse the code from signup."""
    explicit = (referral_code or "").strip().upper()
    if explicit:
        return explicit
    return signup_referral_code(db, buyer_user)

def create_commission_for_purchase(
    db: Session,
    *,
    buyer: User,
    subscription: Subscription,
    code_row: ReferralCode,
    paid_php: float,
    list_php: float,
) -> ReferralCommission:
    rate_pct = code_row.commission_pct
    if rate_pct is None:
        rate_pct = settings_store.get_setting(db, "referral_commission_pct", 20.0)

    amount_php = round(paid_php * (float(rate_pct) / 100.0), 2)

    commission = ReferralCommission(
        referrer_user_id=code_row.user_id,
        referred_user_id=buyer.id,
        subscription_id=subscription.id,
        referral_code=code_row.code,
        gross_php=round(list_php, 2),
        paid_php=round(paid_php, 2),
        amount_php=amount_php,
        rate_pct=float(rate_pct),
        status="pending",
    )
    db.add(commission)
    return commission


def cancel_commission_for_subscription(db: Session, subscription_id: int, note: str = "") -> None:
    rows = (
        db.query(ReferralCommission)
        .filter(
            ReferralCommission.subscription_id == subscription_id,
            ReferralCommission.status.in_(["pending", "approved"]),
        )
        .all()
    )
    for row in rows:
        row.status = "cancelled"
        if note:
            row.note = note


def approved_balance_php(db: Session, user_id: int) -> float:
    total = db.query(func.coalesce(func.sum(ReferralCommission.amount_php), 0.0)).filter(
        ReferralCommission.referrer_user_id == user_id,
        ReferralCommission.status == "approved",
    ).first()
    return float(total[0] or 0.0)


def locked_withdrawal_php(db: Session, user_id: int) -> float:
    """Amounts tied up in open withdrawal requests (not yet sent/cancelled)."""
    total = db.query(func.coalesce(func.sum(WithdrawalRequest.amount_php), 0.0)).filter(
        WithdrawalRequest.user_id == user_id,
        WithdrawalRequest.status.in_(["pending", "approved"]),
    ).first()
    return float(total[0] or 0.0)


def available_balance_php(db: Session, user_id: int) -> float:
    return round(max(0.0, approved_balance_php(db, user_id) - locked_withdrawal_php(db, user_id)), 2)


def min_withdraw_php(db: Session) -> float:
    return float(settings_store.get_setting(db, "referral_min_withdraw_php", MIN_WITHDRAW_DEFAULT))


def mark_commissions_paid_fifo(db: Session, user_id: int, amount_php: float) -> None:
    """Mark approved commissions as paid until `amount_php` is covered (FIFO)."""
    remaining = round(float(amount_php), 2)
    rows = (
        db.query(ReferralCommission)
        .filter(
            ReferralCommission.referrer_user_id == user_id,
            ReferralCommission.status == "approved",
        )
        .order_by(ReferralCommission.created_at.asc(), ReferralCommission.id.asc())
        .all()
    )
    now = datetime.datetime.utcnow()
    for row in rows:
        if remaining <= 0:
            break
        row.status = "paid"
        row.paid_at = now
        remaining = round(remaining - float(row.amount_php or 0.0), 2)

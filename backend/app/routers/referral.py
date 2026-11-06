from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models.schema import ReferralCommission, User, WithdrawalRequest
from app.services import referral
from app.services.auth import require_current_user

router = APIRouter(prefix="/api/referral", tags=["referral"])


@router.get("/me")
def get_my_referral(
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    code_row = referral.ensure_referral_code(db, user)

    signups = db.query(User).filter(User.referred_by_user_id == user.id).count()
    conversions = db.query(ReferralCommission).filter(
        ReferralCommission.referrer_user_id == user.id,
        ReferralCommission.status != "cancelled",
    ).count()

    totals = {}
    for status in ("pending", "approved", "paid", "cancelled"):
        total = db.query(func.coalesce(func.sum(ReferralCommission.amount_php), 0.0)).filter(
            ReferralCommission.referrer_user_id == user.id,
            ReferralCommission.status == status,
        ).first()
        totals[status] = float(total[0] or 0.0)

    available = referral.available_balance_php(db, user.id)
    min_withdraw = referral.min_withdraw_php(db)

    base_url = settings.FRONTEND_URL.rstrip("/")
    return {
        "code": code_row.code,
        "is_enabled": code_row.is_enabled,
        "share_url": f"{base_url}/register?ref={code_row.code}",
        "stats": {
            "signups": signups,
            "conversions": conversions,
        },
        "commission_totals_php": totals,
        "available_balance_php": available,
        "min_withdraw_php": min_withdraw,
        "withdraw_methods": list(referral.PH_WITHDRAW_METHODS),
    }


class WithdrawCreateRequest(BaseModel):
    amount_php: float = Field(..., gt=0)
    method: str
    account_name: str = ""
    account_number: str = ""
    bank_name: str = ""


def _serialize_withdrawal(row: WithdrawalRequest) -> dict:
    return {
        "id": row.id,
        "amount_php": row.amount_php,
        "method": row.method,
        "account_name": row.account_name,
        "account_number": row.account_number,
        "bank_name": row.bank_name,
        "status": row.status,
        "admin_note": row.admin_note,
        "created_at": row.created_at,
        "reviewed_at": row.reviewed_at,
        "sent_at": row.sent_at,
    }


@router.get("/withdrawals")
def list_my_withdrawals(
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(WithdrawalRequest)
        .filter(WithdrawalRequest.user_id == user.id)
        .order_by(WithdrawalRequest.created_at.desc())
        .limit(50)
        .all()
    )
    return {
        "available_balance_php": referral.available_balance_php(db, user.id),
        "min_withdraw_php": referral.min_withdraw_php(db),
        "methods": list(referral.PH_WITHDRAW_METHODS),
        "withdrawals": [_serialize_withdrawal(r) for r in rows],
    }


@router.post("/withdrawals")
def create_withdrawal(
    req: WithdrawCreateRequest,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    method = (req.method or "").strip().lower()
    if method not in referral.PH_WITHDRAW_METHODS:
        raise HTTPException(
            status_code=400,
            detail=f"Payment method must be one of: {', '.join(referral.PH_WITHDRAW_METHODS)}",
        )

    account_name = (req.account_name or "").strip()
    account_number = (req.account_number or "").strip()
    bank_name = (req.bank_name or "").strip()
    if not account_name:
        raise HTTPException(status_code=400, detail="Account name is required")
    if not account_number:
        raise HTTPException(status_code=400, detail="Account / mobile number is required")
    if method == "bank" and not bank_name:
        raise HTTPException(status_code=400, detail="Bank name is required for bank transfer")

    amount = round(float(req.amount_php), 2)
    min_withdraw = referral.min_withdraw_php(db)
    if amount < min_withdraw:
        raise HTTPException(status_code=400, detail=f"Minimum withdraw is ₱{min_withdraw:.0f}")

    available = referral.available_balance_php(db, user.id)
    if amount > available:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient available balance (₱{available:.2f}). Only approved commissions can be withdrawn.",
        )

    existing_pending = (
        db.query(WithdrawalRequest)
        .filter(WithdrawalRequest.user_id == user.id, WithdrawalRequest.status == "pending")
        .first()
    )
    if existing_pending:
        raise HTTPException(status_code=400, detail="You already have a pending withdraw request")

    row = WithdrawalRequest(
        user_id=user.id,
        amount_php=amount,
        method=method,
        account_name=account_name,
        account_number=account_number,
        bank_name=bank_name if method == "bank" else "",
        status="pending",
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "status": "success",
        "message": "Withdraw request submitted. We'll process it within 1–3 business days.",
        "withdrawal": _serialize_withdrawal(row),
        "available_balance_php": referral.available_balance_php(db, user.id),
    }

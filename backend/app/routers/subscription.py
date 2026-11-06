import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.schema import RefundRequest, User
from app.services import lifetime, referral, settings_store
from app.services.auth import require_current_user
from app.services.paymongo import PayMongoService

router = APIRouter(prefix="/api/subscription", tags=["subscription"])

REFUND_WINDOW_DAYS = 7
QRPH_EXPIRY_SECONDS = 1800


class CheckoutRequest(BaseModel):
    referral_code: Optional[str] = None
    payment_method: str = "qrph"  # ignored; QRPH only


class PreviewPriceRequest(BaseModel):
    referral_code: Optional[str] = None


def _effective_list_price_php(db: Session) -> float:
    pricing = settings_store.get_pricing_settings(db)
    if pricing.get("early_bird_enabled"):
        cap = pricing.get("early_bird_cap") or 0
        sold = pricing.get("early_bird_sold") or 0
        if cap <= 0 or sold < cap:
            return float(pricing["early_bird_price_php"])
    return float(pricing["lifetime_price_php"])


def _subscription_brief(sub) -> dict:
    return {
        "status": sub.status,
        "plan": sub.plan,
        "activated_at": sub.activated_at,
        "amount_php": sub.amount_php,
    }


@router.get("/pricing")
def get_pricing(db: Session = Depends(get_db)):
    pricing = settings_store.get_pricing_settings(db)
    list_price_php = _effective_list_price_php(db)

    return {
        "lifetime_price_php": list_price_php,
        "lifetime_price_usd": pricing["lifetime_price_usd"],
        "early_bird_enabled": pricing["early_bird_enabled"],
        "free_trial_episodes": settings_store.get_guest_preview_episodes(db),
        "payment_method": "qrph",
        "features": [
            "All dramas from 40+ providers",
            "HD streaming · EN / TL / ID subtitles",
            "Simultaneous streaming on 3 devices",
            "Unlimited access forever — no renewals",
            "7-day money-back guarantee",
        ],
    }


@router.post("/preview-price")
def preview_price(
    req: PreviewPriceRequest,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(require_current_user),
):
    list_price_php = _effective_list_price_php(db)
    return referral.compute_price(db, list_price_php, req.referral_code, user)


@router.post("/checkout")
async def create_checkout(
    req: CheckoutRequest,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    """Create a QRPH Payment Intent, attach a QR payment method, return the QR image."""
    sub = lifetime.get_or_create_subscription(db, user)
    if sub.status == "active" and sub.plan == "lifetime":
        raise HTTPException(status_code=400, detail="You already have lifetime access")

    list_price_php = _effective_list_price_php(db)
    pricing = referral.compute_price(db, list_price_php, req.referral_code, user)
    if pricing.get("error") and req.referral_code:
        raise HTTPException(status_code=400, detail=pricing["error"])

    final_price = float(pricing["final_php"])
    if final_price < 1.0:
        raise HTTPException(status_code=400, detail="Minimum payment amount is ₱1.00")

    pm = PayMongoService.from_db(db)
    referral_applied = pricing.get("referral_code_applied") or ""

    intent = await pm.create_payment_intent(
        amount_php=final_price,
        description=f"SeryeKo.com Lifetime Access for {user.email}",
        metadata={
            "user_id": user.id,
            "subscription_id": sub.id,
            "amount_php": final_price,
            "list_amount_php": pricing["original_php"],
            "discount_php": pricing["discount_php"],
            "referral_code": referral_applied,
        },
    )
    if intent.get("error"):
        raise HTTPException(status_code=502, detail=f"PayMongo error: {intent['error']}")

    intent_id = intent.get("id")
    client_key = (intent.get("attributes") or {}).get("client_key")
    if not intent_id:
        raise HTTPException(status_code=502, detail="PayMongo did not return a payment intent id")

    payment_method = await pm.create_qrph_payment_method(expiry_seconds=QRPH_EXPIRY_SECONDS)
    if payment_method.get("error"):
        raise HTTPException(status_code=502, detail=f"PayMongo error: {payment_method['error']}")

    pm_id = payment_method.get("id")
    attached = await pm.attach_payment_method(intent_id, pm_id, client_key=client_key)
    if attached.get("error"):
        raise HTTPException(status_code=502, detail=f"PayMongo error: {attached['error']}")

    qr_image_url = PayMongoService.extract_qr_image_url(attached)
    if not qr_image_url:
        raise HTTPException(status_code=502, detail="PayMongo did not return a QR code image")

    # Persist pending checkout on the subscription row for webhook / status lookup.
    sub.payment_method = "qrph"
    sub.paymongo_source_id = intent_id
    sub.amount_php = final_price
    sub.list_amount_php = float(pricing["original_php"])
    sub.discount_php = float(pricing["discount_php"])
    sub.referral_code_used = referral_applied or None
    sub.currency = "PHP"
    db.commit()

    status = (attached.get("attributes") or {}).get("status") or "awaiting_next_action"

    return {
        "payment_intent_id": intent_id,
        "client_key": client_key,
        "qr_image_url": qr_image_url,
        "amount_php": final_price,
        "original_php": pricing["original_php"],
        "discount_php": pricing["discount_php"],
        "currency": "PHP",
        "payment_method": "qrph",
        "expires_in_seconds": QRPH_EXPIRY_SECONDS,
        "status": status,
        "mock": pm.is_mock,
    }


@router.get("/payment-status")
async def payment_status(
    payment_intent_id: str = Query(..., min_length=3),
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    """Poll Payment Intent status; activate lifetime when PayMongo reports succeeded."""
    sub = user.subscription
    if not sub or sub.paymongo_source_id != payment_intent_id:
        raise HTTPException(status_code=404, detail="Payment intent not found for this account")

    if sub.status == "active" and sub.plan == "lifetime":
        return {
            "status": "succeeded",
            "subscription": _subscription_brief(sub),
        }

    pm = PayMongoService.from_db(db)

    # Local/dev mock keys: first status poll completes the purchase.
    if pm.is_mock and payment_intent_id.startswith("pi_mock_"):
        result = lifetime.activate_lifetime(
            db,
            user,
            amount_php=sub.amount_php,
            list_amount_php=sub.list_amount_php or sub.amount_php,
            discount_php=sub.discount_php or 0.0,
            referral_code=sub.referral_code_used,
            payment_method="qrph",
            paymongo_payment_id=f"pay_mock_{int(datetime.datetime.utcnow().timestamp())}",
            paymongo_intent_id=payment_intent_id,
        )
        return {
            "status": "succeeded",
            "subscription": result["subscription"],
            "mock": True,
        }

    intent = await pm.retrieve_payment_intent(payment_intent_id)
    if intent.get("error"):
        raise HTTPException(status_code=502, detail=f"PayMongo error: {intent['error']}")

    attrs = intent.get("attributes") or {}
    intent_status = attrs.get("status") or "unknown"

    if intent_status == "succeeded":
        payment_id = PayMongoService.extract_payment_id(intent) or payment_intent_id
        result = lifetime.activate_lifetime(
            db,
            user,
            amount_php=sub.amount_php,
            list_amount_php=sub.list_amount_php or sub.amount_php,
            discount_php=sub.discount_php or 0.0,
            referral_code=sub.referral_code_used,
            payment_method="qrph",
            paymongo_payment_id=payment_id,
            paymongo_intent_id=payment_intent_id,
        )
        return {
            "status": "succeeded",
            "subscription": result["subscription"],
        }

    if intent_status in ("awaiting_next_action", "processing"):
        return {"status": "pending", "paymongo_status": intent_status}

    # After QR expiry PayMongo resets the intent to awaiting_payment_method
    if intent_status == "awaiting_payment_method":
        return {"status": "expired", "paymongo_status": intent_status}

    if intent_status in ("failed", "cancelled", "canceled"):
        return {"status": "failed", "paymongo_status": intent_status}

    return {"status": "pending", "paymongo_status": intent_status}


@router.post("/confirm-mock-payment")
def confirm_mock_payment(
    req: CheckoutRequest,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    """Instantly activates lifetime access — only when PayMongo keys are mock."""
    pm = PayMongoService.from_db(db)
    if not pm.is_mock:
        raise HTTPException(
            status_code=403,
            detail="Mock payment is disabled when real PayMongo keys are configured",
        )

    list_price_php = _effective_list_price_php(db)
    pricing = referral.compute_price(db, list_price_php, req.referral_code, user)
    if pricing.get("error") and req.referral_code:
        raise HTTPException(status_code=400, detail=pricing["error"])

    result = lifetime.activate_lifetime(
        db,
        user,
        amount_php=pricing["final_php"],
        list_amount_php=pricing["original_php"],
        discount_php=pricing["discount_php"],
        referral_code=pricing.get("referral_code_applied"),
        payment_method="qrph",
        paymongo_payment_id=f"pay_mock_{int(datetime.datetime.utcnow().timestamp())}",
    )
    return result


# ──────────────────────────────────────────────────────────────────────────
# 7-day cancellation / refund request (user-facing)
# ──────────────────────────────────────────────────────────────────────────

class RefundRequestCreate(BaseModel):
    reason: str
    details: str = ""


@router.post("/refund-request")
def create_refund_request(
    req: RefundRequestCreate,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    sub = user.subscription
    if not sub or sub.status != "active" or sub.plan != "lifetime":
        raise HTTPException(status_code=400, detail="No active lifetime subscription to refund")

    existing_pending = (
        db.query(RefundRequest)
        .filter(RefundRequest.user_id == user.id, RefundRequest.status == "pending")
        .first()
    )
    if existing_pending:
        raise HTTPException(status_code=400, detail="You already have a pending refund request")

    anchor = sub.activated_at or sub.created_at
    eligible_until = anchor + datetime.timedelta(days=REFUND_WINDOW_DAYS)
    if datetime.datetime.utcnow() > eligible_until:
        raise HTTPException(
            status_code=400,
            detail="The 7-day refund window for your purchase has passed",
        )

    row = RefundRequest(
        user_id=user.id,
        subscription_id=sub.id,
        reason=req.reason,
        details=req.details,
        status="pending",
        eligible_until=eligible_until,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    return {
        "status": "success",
        "message": "Refund request received. We'll review it within 1-2 business days.",
        "request": {"id": row.id, "status": row.status, "eligible_until": row.eligible_until},
    }


@router.get("/refund-request/mine")
def get_my_refund_request(
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    row = (
        db.query(RefundRequest)
        .filter(RefundRequest.user_id == user.id)
        .order_by(RefundRequest.created_at.desc())
        .first()
    )
    if not row:
        return {"request": None}
    return {
        "request": {
            "id": row.id,
            "status": row.status,
            "reason": row.reason,
            "eligible_until": row.eligible_until,
            "created_at": row.created_at,
        }
    }

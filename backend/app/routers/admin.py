import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.schema import (
    AppSetting,
    CachedDrama,
    ReferralCode,
    ReferralCommission,
    RefundRequest,
    Subscription,
    User,
    VideoReport,
    WebhookLog,
    WithdrawalRequest,
)
from app.services import providers_admin, referral, settings_store
from app.services.auth import require_current_user
from app.services.provider import aggregator
from app.services.catalog import catalog_service
from app.timeutil import day_bounds_utc_naive, today_gmt8

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_admin_user(user: User = Depends(require_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin permissions required")
    return user


# ──────────────────────────────────────────────────────────────────────────
# Overview
# ──────────────────────────────────────────────────────────────────────────

@router.get("/overview")
def get_admin_overview(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    total_users = db.query(User).count()
    subscribers = db.query(Subscription).filter(
        Subscription.status == "active", Subscription.plan == "lifetime"
    ).count()
    trials = db.query(Subscription).filter(Subscription.status == "trial").count()

    revenue_row = db.query(func.coalesce(func.sum(Subscription.amount_php), 0.0)).filter(
        Subscription.status == "active", Subscription.plan == "lifetime"
    ).first()
    total_revenue_php = float(revenue_row[0] or 0.0)

    pricing = settings_store.get_pricing_settings(db)

    today = today_gmt8()
    signups_7d: List[Dict[str, Any]] = []
    for i in range(6, -1, -1):
        day = today - datetime.timedelta(days=i)
        day_start, day_end = day_bounds_utc_naive(day)
        count = db.query(User).filter(
            User.created_at >= day_start,
            User.created_at < day_end,
        ).count()
        signups_7d.append({"date": day.isoformat(), "count": count})

    pending_cancellations = db.query(RefundRequest).filter(RefundRequest.status == "pending").count()
    pending_commissions = db.query(ReferralCommission).filter(
        ReferralCommission.status.in_(["pending", "approved"])
    ).count()
    pending_withdrawals = db.query(WithdrawalRequest).filter(WithdrawalRequest.status == "pending").count()
    open_video_reports = db.query(VideoReport).filter(VideoReport.status == "open").count()

    return {
        "stats": {
            "total_users": total_users,
            "lifetime_subscribers": subscribers,
            "trial_users": trials,
            "conversion_rate": round((subscribers / total_users * 100), 1) if total_users > 0 else 0,
            "total_revenue_php": total_revenue_php,
            "pending_cancellations": pending_cancellations,
            "pending_commissions": pending_commissions,
            "pending_withdrawals": pending_withdrawals,
            "open_video_reports": open_video_reports,
        },
        "current_pricing": {
            "lifetime_price_php": pricing["lifetime_price_php"],
            "currency": "PHP",
        },
        "signups_7d": signups_7d,
    }


# ──────────────────────────────────────────────────────────────────────────
# Settings — Pricing / Referral / Keys
# ──────────────────────────────────────────────────────────────────────────

class PricingSettingsRequest(BaseModel):
    lifetime_price_php: Optional[float] = None
    lifetime_price_usd: Optional[float] = None
    early_bird_enabled: Optional[bool] = None
    early_bird_price_php: Optional[float] = None
    early_bird_cap: Optional[int] = None
    guest_preview_enabled: Optional[bool] = None
    guest_preview_episodes: Optional[int] = None


@router.get("/settings/pricing")
def get_pricing_settings(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    return settings_store.get_pricing_settings(db)


@router.put("/settings/pricing")
def update_pricing_settings(
    req: PricingSettingsRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    settings_store.set_many(db, req.dict(exclude_none=True))
    return settings_store.get_pricing_settings(db)


class ReferralSettingsRequest(BaseModel):
    referral_enabled: Optional[bool] = None
    referral_discount_type: Optional[str] = None  # "percent" | "fixed"
    referral_discount_value: Optional[float] = None
    referral_commission_pct: Optional[float] = None
    referral_min_withdraw_php: Optional[float] = None


@router.get("/settings/referral")
def get_referral_settings(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    return settings_store.get_referral_settings(db)


@router.put("/settings/referral")
def update_referral_settings(
    req: ReferralSettingsRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    if req.referral_discount_type is not None and req.referral_discount_type not in ("percent", "fixed"):
        raise HTTPException(status_code=400, detail="discount_type must be 'percent' or 'fixed'")
    settings_store.set_many(db, req.dict(exclude_none=True))
    return settings_store.get_referral_settings(db)


class KeysSettingsRequest(BaseModel):
    dramabuzz_api_key: Optional[str] = None
    paymongo_mode: Optional[str] = None  # "test" | "live"
    paymongo_public_key: Optional[str] = None
    paymongo_secret_key: Optional[str] = None
    paymongo_webhook_secret: Optional[str] = None


@router.get("/settings/keys")
def get_keys_settings(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    return settings_store.get_keys_settings(db, masked=True)


@router.put("/settings/keys")
def update_keys_settings(
    req: KeysSettingsRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    if req.paymongo_mode is not None and req.paymongo_mode not in ("test", "live"):
        raise HTTPException(status_code=400, detail="paymongo_mode must be 'test' or 'live'")

    values = req.dict(exclude_none=True)
    # Ignore masked placeholders (e.g. "••••1234") sent back unchanged by the UI
    for key in list(values.keys()):
        if isinstance(values[key], str) and values[key].startswith("••••"):
            values.pop(key)

    settings_store.set_many(db, values)

    # Apply key rotation immediately — no restart needed
    if "dramabuzz_api_key" in values and values["dramabuzz_api_key"]:
        catalog_service.api_key = values["dramabuzz_api_key"]
        aggregator.api_key = values["dramabuzz_api_key"]

    return settings_store.get_keys_settings(db, masked=True)


# ──────────────────────────────────────────────────────────────────────────
# Subscribers
# ──────────────────────────────────────────────────────────────────────────

@router.get("/subscribers")
def list_subscribers(
    q: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    query = db.query(Subscription).join(User, Subscription.user_id == User.id)
    if status:
        query = query.filter(Subscription.status == status)
    if q:
        like = f"%{q.strip()}%"
        query = query.filter(User.email.ilike(like))

    subs = query.order_by(Subscription.created_at.desc()).limit(200).all()
    results = []
    for s in subs:
        u = s.user
        results.append({
            "id": s.id,
            "user_id": s.user_id,
            "user_email": u.email if u else "unknown",
            "status": s.status,
            "plan": s.plan,
            "amount_php": s.amount_php,
            "list_amount_php": s.list_amount_php,
            "discount_php": s.discount_php,
            "referral_code_used": s.referral_code_used,
            "payment_method": s.payment_method,
            "paymongo_payment_id": s.paymongo_payment_id,
            "episodes_watched": s.episodes_watched,
            "activated_at": s.activated_at,
            "created_at": s.created_at,
        })
    return {"subscribers": results}


class SubscriberActionRequest(BaseModel):
    action: str  # "grant" | "deactivate" | "reactivate"


@router.patch("/subscribers/{subscription_id}")
def update_subscriber(
    subscription_id: int,
    req: SubscriberActionRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    sub = db.query(Subscription).filter(Subscription.id == subscription_id).first()
    if not sub:
        raise HTTPException(status_code=404, detail="Subscriber not found")

    if req.action == "grant":
        pricing = settings_store.get_pricing_settings(db)
        sub.status = "active"
        sub.plan = "lifetime"
        if not sub.amount_php:
            sub.amount_php = pricing["lifetime_price_php"]
            sub.list_amount_php = pricing["lifetime_price_php"]
        if not sub.activated_at:
            sub.activated_at = datetime.datetime.utcnow()
    elif req.action == "deactivate":
        sub.status = "cancelled"
    elif req.action == "reactivate":
        sub.status = "active" if sub.plan == "lifetime" else "trial"
    else:
        raise HTTPException(status_code=400, detail="Unknown action")

    db.commit()
    db.refresh(sub)
    return {"status": "success", "subscriber": {"id": sub.id, "status": sub.status, "plan": sub.plan}}


# ──────────────────────────────────────────────────────────────────────────
# 7-day cancellation / refund requests
# ──────────────────────────────────────────────────────────────────────────

@router.get("/cancellations")
def list_cancellations(
    status: str = Query("pending"),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    query = db.query(RefundRequest).join(User, RefundRequest.user_id == User.id)
    if status and status != "all":
        query = query.filter(RefundRequest.status == status)
    rows = query.order_by(RefundRequest.created_at.desc()).limit(200).all()

    now = datetime.datetime.utcnow()
    results = []
    for r in rows:
        u = r.user
        sub = u.subscription if u else None
        days_left = None
        if r.eligible_until:
            days_left = max(0, (r.eligible_until - now).days)
        results.append({
            "id": r.id,
            "user_email": u.email if u else "unknown",
            "reason": r.reason,
            "details": r.details,
            "status": r.status,
            "days_left": days_left,
            "amount_php": sub.amount_php if sub else None,
            "paymongo_payment_id": sub.paymongo_payment_id if sub else None,
            "admin_note": r.admin_note,
            "created_at": r.created_at,
            "reviewed_at": r.reviewed_at,
        })
    return {"cancellations": results}


class CancellationActionRequest(BaseModel):
    action: str  # "approve" | "reject" | "refunded"
    admin_note: Optional[str] = ""


@router.patch("/cancellations/{request_id}")
def update_cancellation(
    request_id: int,
    req: CancellationActionRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    row = db.query(RefundRequest).filter(RefundRequest.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Cancellation request not found")

    sub = row.user.subscription if row.user else None

    if req.action == "approve":
        row.status = "approved"
        if sub:
            sub.status = "cancelled"
            referral.cancel_commission_for_subscription(db, sub.id, note="Refund approved")
    elif req.action == "refunded":
        row.status = "refunded"
        if sub:
            sub.status = "cancelled"
            referral.cancel_commission_for_subscription(db, sub.id, note="Refunded")
    elif req.action == "reject":
        row.status = "rejected"
    else:
        raise HTTPException(status_code=400, detail="Unknown action")

    row.admin_note = req.admin_note or row.admin_note
    row.reviewed_at = datetime.datetime.utcnow()
    db.commit()
    return {"status": "success", "cancellation": {"id": row.id, "status": row.status}}


# ──────────────────────────────────────────────────────────────────────────
# Referrals — referrers + commissions
# ──────────────────────────────────────────────────────────────────────────

@router.get("/referrals/referrers")
def list_referrers(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    codes = db.query(ReferralCode).join(User, ReferralCode.user_id == User.id).all()
    results = []
    for code in codes:
        signups = db.query(User).filter(User.referred_by_user_id == code.user_id).count()
        conversions = db.query(ReferralCommission).filter(
            ReferralCommission.referrer_user_id == code.user_id,
            ReferralCommission.status != "cancelled",
        ).count()
        unpaid = db.query(func.coalesce(func.sum(ReferralCommission.amount_php), 0.0)).filter(
            ReferralCommission.referrer_user_id == code.user_id,
            ReferralCommission.status.in_(["pending", "approved"]),
        ).first()
        results.append({
            "code_id": code.id,
            "user_email": code.user.email if code.user else "unknown",
            "code": code.code,
            "is_enabled": code.is_enabled,
            "discount_type": code.discount_type,
            "discount_value": code.discount_value,
            "commission_pct": code.commission_pct,
            "signups": signups,
            "conversions": conversions,
            "unpaid_balance_php": float(unpaid[0] or 0.0),
        })
    return {"referrers": results}


class ReferralCodeUpdateRequest(BaseModel):
    is_enabled: Optional[bool] = None
    discount_type: Optional[str] = None
    discount_value: Optional[float] = None
    commission_pct: Optional[float] = None


@router.patch("/referrals/codes/{code_id}")
def update_referral_code(
    code_id: int,
    req: ReferralCodeUpdateRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    code = db.query(ReferralCode).filter(ReferralCode.id == code_id).first()
    if not code:
        raise HTTPException(status_code=404, detail="Referral code not found")

    if req.is_enabled is not None:
        code.is_enabled = req.is_enabled
    if req.discount_type is not None:
        if req.discount_type not in ("percent", "fixed", ""):
            raise HTTPException(status_code=400, detail="discount_type must be 'percent' or 'fixed'")
        code.discount_type = req.discount_type or None
    if req.discount_value is not None:
        code.discount_value = req.discount_value
    if req.commission_pct is not None:
        code.commission_pct = req.commission_pct

    db.commit()
    return {"status": "success"}


@router.get("/referrals/commissions")
def list_commissions(
    status: str = Query("all"),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    query = db.query(ReferralCommission)
    if status and status != "all":
        query = query.filter(ReferralCommission.status == status)
    rows = query.order_by(ReferralCommission.created_at.desc()).limit(200).all()

    referrer_ids = {r.referrer_user_id for r in rows}
    referred_ids = {r.referred_user_id for r in rows}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(referrer_ids | referred_ids)).all()}

    results = []
    for r in rows:
        results.append({
            "id": r.id,
            "referrer_email": users.get(r.referrer_user_id).email if users.get(r.referrer_user_id) else "unknown",
            "referred_email": users.get(r.referred_user_id).email if users.get(r.referred_user_id) else "unknown",
            "referral_code": r.referral_code,
            "gross_php": r.gross_php,
            "paid_php": r.paid_php,
            "amount_php": r.amount_php,
            "rate_pct": r.rate_pct,
            "status": r.status,
            "note": r.note,
            "created_at": r.created_at,
            "paid_at": r.paid_at,
        })
    return {"commissions": results}


class CommissionActionRequest(BaseModel):
    action: str  # "mark_paid" | "cancel" | "approve"
    note: Optional[str] = ""


@router.patch("/referrals/commissions/{commission_id}")
def update_commission(
    commission_id: int,
    req: CommissionActionRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    row = db.query(ReferralCommission).filter(ReferralCommission.id == commission_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Commission not found")

    if req.action == "mark_paid":
        row.status = "paid"
        row.paid_at = datetime.datetime.utcnow()
    elif req.action == "approve":
        row.status = "approved"
        row.approved_at = datetime.datetime.utcnow()
    elif req.action == "cancel":
        row.status = "cancelled"
    else:
        raise HTTPException(status_code=400, detail="Unknown action")

    if req.note:
        row.note = req.note
    db.commit()
    return {"status": "success", "commission": {"id": row.id, "status": row.status}}


@router.get("/referrals/withdrawals")
def list_withdrawals(
    status: str = Query("pending"),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    query = db.query(WithdrawalRequest).join(User, WithdrawalRequest.user_id == User.id)
    if status and status != "all":
        query = query.filter(WithdrawalRequest.status == status)
    rows = query.order_by(WithdrawalRequest.created_at.desc()).limit(200).all()

    results = []
    for r in rows:
        u = r.user
        results.append({
            "id": r.id,
            "user_email": u.email if u else "unknown",
            "amount_php": r.amount_php,
            "method": r.method,
            "account_name": r.account_name,
            "account_number": r.account_number,
            "bank_name": r.bank_name,
            "status": r.status,
            "admin_note": r.admin_note,
            "created_at": r.created_at,
            "reviewed_at": r.reviewed_at,
            "sent_at": r.sent_at,
            "available_balance_php": referral.available_balance_php(db, r.user_id),
        })
    return {"withdrawals": results}


class WithdrawalActionRequest(BaseModel):
    action: str  # "approve" | "sent" | "cancel"
    admin_note: Optional[str] = ""


@router.patch("/referrals/withdrawals/{request_id}")
def update_withdrawal(
    request_id: int,
    req: WithdrawalActionRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    row = db.query(WithdrawalRequest).filter(WithdrawalRequest.id == request_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Withdrawal request not found")

    now = datetime.datetime.utcnow()

    if req.action == "approve":
        if row.status not in ("pending",):
            raise HTTPException(status_code=400, detail="Only pending requests can be approved")
        # Ensure balance still covers (approved commissions minus other locks)
        # Temporarily ignore this row's lock by treating it as not pending for check:
        available = referral.available_balance_php(db, row.user_id) + float(row.amount_php)
        if float(row.amount_php) > available + 0.001:
            raise HTTPException(status_code=400, detail="User no longer has enough approved balance")
        row.status = "approved"
        row.reviewed_at = now
    elif req.action == "sent":
        if row.status not in ("pending", "approved"):
            raise HTTPException(status_code=400, detail="Only pending/approved requests can be marked sent")
        # When sending from pending, re-check balance including this request's lock
        if row.status == "pending":
            available = referral.available_balance_php(db, row.user_id) + float(row.amount_php)
            if float(row.amount_php) > available + 0.001:
                raise HTTPException(status_code=400, detail="User no longer has enough approved balance")
        referral.mark_commissions_paid_fifo(db, row.user_id, float(row.amount_php))
        row.status = "sent"
        row.reviewed_at = row.reviewed_at or now
        row.sent_at = now
    elif req.action == "cancel":
        if row.status in ("sent", "cancelled"):
            raise HTTPException(status_code=400, detail="This request can no longer be cancelled")
        row.status = "cancelled"
        row.reviewed_at = now
    else:
        raise HTTPException(status_code=400, detail="Unknown action")

    if req.admin_note:
        row.admin_note = req.admin_note
    db.commit()
    return {"status": "success", "withdrawal": {"id": row.id, "status": row.status}}


# ──────────────────────────────────────────────────────────────────────────
# Providers
# ──────────────────────────────────────────────────────────────────────────

@router.get("/providers")
def get_providers(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    return {"providers": providers_admin.list_providers(db)}


class ProviderUpdateRequest(BaseModel):
    is_enabled: bool


@router.patch("/providers/{provider_id}")
def update_provider(
    provider_id: str,
    req: ProviderUpdateRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    row = providers_admin.set_provider_enabled(db, provider_id, req.is_enabled)
    return {"status": "success", "provider": {"id": row.id, "is_enabled": row.is_enabled}}


@router.post("/providers/refresh-status")
async def refresh_provider_status(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    return await providers_admin.refresh_provider_statuses(db)


# ──────────────────────────────────────────────────────────────────────────
# Catalog CMS
# ──────────────────────────────────────────────────────────────────────────

@router.get("/catalog")
def list_catalog(
    q: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    from app.services import content_store

    query = db.query(CachedDrama)
    if provider:
        query = query.filter(CachedDrama.provider == provider)
    if q:
        query = query.filter(CachedDrama.title.ilike(f"%{q.strip()}%"))

    total = query.count()
    rows = (
        query.order_by(CachedDrama.updated_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        {**content_store.drama_to_dict(r), "drama_id": r.drama_id, "is_hidden": r.is_hidden, "is_featured": r.is_featured}
        for r in rows
    ]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


class CatalogUpdateRequest(BaseModel):
    title: Optional[str] = None
    summary: Optional[str] = None
    badge: Optional[str] = None
    status: Optional[str] = None
    is_hidden: Optional[bool] = None
    is_featured: Optional[bool] = None


@router.patch("/catalog/{drama_id}")
def update_catalog_item(
    drama_id: str,
    req: CatalogUpdateRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    row = db.query(CachedDrama).filter(CachedDrama.drama_id == drama_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Drama not found in cache")

    if req.title is not None:
        row.title = req.title
    if req.summary is not None:
        row.summary = req.summary
        row.synopsis = req.summary
    if req.badge is not None:
        row.badge = req.badge
    if req.status is not None:
        row.status = req.status
    if req.is_hidden is not None:
        row.is_hidden = req.is_hidden
    if req.is_featured is not None:
        row.is_featured = req.is_featured

    row.updated_at = datetime.datetime.utcnow()
    db.commit()

    if req.is_hidden is not None:
        from app.services.catalog import invalidate_hidden_cache
        invalidate_hidden_cache()

    return {"status": "success"}


@router.post("/catalog/{drama_id}/refresh")
async def refresh_catalog_item(
    drama_id: str,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    from app.services import content_store
    from app.services.cache import cache

    cache.delete(f"detail:v2:{drama_id}")
    detail = await aggregator.get_detail(drama_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Provider returned no detail for this drama")

    content_store.upsert_drama(db, detail, source="api")
    return {"status": "success", "drama_id": drama_id}


# ──────────────────────────────────────────────────────────────────────────
# Analytics
# ──────────────────────────────────────────────────────────────────────────

@router.get("/analytics/content")
def analytics_content(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    top = (
        db.query(CachedDrama)
        .filter(CachedDrama.play_count > 0)
        .order_by(CachedDrama.play_count.desc())
        .limit(10)
        .all()
    )
    recent = (
        db.query(CachedDrama)
        .filter(CachedDrama.last_played_at.isnot(None))
        .order_by(CachedDrama.last_played_at.desc())
        .limit(10)
        .all()
    )

    def _row(r: CachedDrama) -> Dict[str, Any]:
        return {
            "drama_id": r.drama_id,
            "title": r.title,
            "provider": r.provider,
            "play_count": r.play_count,
            "last_played_at": r.last_played_at,
        }

    return {"top_played": [_row(r) for r in top], "recently_played": [_row(r) for r in recent]}


@router.get("/analytics/signups")
def analytics_signups(
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    today = today_gmt8()
    rows = []
    for i in range(days - 1, -1, -1):
        day = today - datetime.timedelta(days=i)
        day_start, day_end = day_bounds_utc_naive(day)
        count = db.query(User).filter(
            User.created_at >= day_start,
            User.created_at < day_end,
        ).count()
        rows.append({"date": day.isoformat(), "count": count})
    return {"signups": rows}


# ──────────────────────────────────────────────────────────────────────────
# Webhooks
# ──────────────────────────────────────────────────────────────────────────

@router.get("/webhooks")
def list_webhooks(
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    rows = db.query(WebhookLog).order_by(WebhookLog.created_at.desc()).limit(50).all()
    return {
        "webhooks": [
            {
                "id": r.id,
                "event_type": r.event_type,
                "status": r.status,
                "payload": r.payload,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }


# ──────────────────────────────────────────────────────────────────────────
# Video playback reports
# ──────────────────────────────────────────────────────────────────────────

@router.get("/reports")
def list_video_reports(
    status: str = Query("open"),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    query = db.query(VideoReport)
    if status and status != "all":
        query = query.filter(VideoReport.status == status)
    rows = query.order_by(VideoReport.created_at.desc()).limit(200).all()

    drama_ids = {r.drama_id for r in rows if r.drama_id}
    cached_by_id: Dict[str, CachedDrama] = {}
    if drama_ids:
        for cd in db.query(CachedDrama).filter(CachedDrama.drama_id.in_(drama_ids)).all():
            cached_by_id[cd.drama_id] = cd

    results = []
    for r in rows:
        u = r.user
        cached = cached_by_id.get(r.drama_id)
        results.append({
            "id": r.id,
            "user_email": u.email if u else "guest",
            "drama_id": r.drama_id,
            "episode_num": r.episode_num,
            "episode_id": r.episode_id,
            "provider": r.provider,
            "title": r.title,
            "video_url": r.video_url,
            "reason": r.reason,
            "details": r.details,
            "status": r.status,
            "admin_note": r.admin_note,
            "created_at": r.created_at,
            "reviewed_at": r.reviewed_at,
            "drama": {
                "id": cached.drama_id,
                "title": cached.title,
                "cover": cached.cover or cached.cover_image or "",
                "provider": cached.provider,
                "original_id": cached.original_id,
                "episodes": cached.episodes_count,
                "summary": (cached.summary or cached.synopsis or "")[:280],
            } if cached else None,
        })
    return {"reports": results, "count": len(results)}


@router.get("/reports/probe/{drama_id}")
async def probe_report_drama(
    drama_id: str,
    episode_num: int = Query(1, ge=1, le=5000),
    _admin: User = Depends(require_admin_user),
):
    """Fetch live drama detail + episode stream payload for admin debugging."""
    drama_id = (drama_id or "").strip()
    if not drama_id or "_" not in drama_id:
        raise HTTPException(status_code=400, detail="Invalid drama_id")

    detail = None
    episodes: List[Dict[str, Any]] = []
    try:
        detail = await aggregator.get_detail(drama_id)
    except Exception as e:
        detail = {"error": str(e)}
    try:
        episodes = await aggregator.get_episodes(drama_id)
    except Exception as e:
        episodes = [{"error": str(e)}]

    target = None
    for ep in episodes or []:
        if isinstance(ep, dict) and int(ep.get("episode_num") or 0) == int(episode_num):
            target = ep
            break
    if target is None and episodes:
        target = episodes[0] if isinstance(episodes[0], dict) else None

    # Compact payload for copy/debug — keep stream URLs intact for admins
    episode_rows = []
    for ep in (episodes or [])[:12]:
        if not isinstance(ep, dict):
            continue
        episode_rows.append({
            "episode_num": ep.get("episode_num"),
            "title": ep.get("title"),
            "video_url": ep.get("video_url") or "",
            "is_locked": ep.get("is_locked"),
            "duration": ep.get("duration"),
            "id": ep.get("id"),
        })

    payload = {
        "drama_id": drama_id,
        "provider": drama_id.split("_", 1)[0],
        "original_id": drama_id.split("_", 1)[1],
        "requested_episode": episode_num,
        "detail": detail,
        "episode": target,
        "episodes_preview": episode_rows,
        "episodes_total": len(episodes or []),
    }
    return payload


class VideoReportActionRequest(BaseModel):
    action: str  # reviewing | resolved | dismissed | reopen
    admin_note: Optional[str] = ""


@router.patch("/reports/{report_id}")
def update_video_report(
    report_id: int,
    req: VideoReportActionRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_admin_user),
):
    row = db.query(VideoReport).filter(VideoReport.id == report_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")

    action = (req.action or "").strip().lower()
    if action == "reviewing":
        row.status = "reviewing"
    elif action == "resolved":
        row.status = "resolved"
    elif action == "dismissed":
        row.status = "dismissed"
    elif action == "reopen":
        row.status = "open"
    else:
        raise HTTPException(status_code=400, detail="Unknown action")

    row.admin_note = req.admin_note if req.admin_note is not None else row.admin_note
    if action in ("resolved", "dismissed", "reviewing"):
        row.reviewed_at = datetime.datetime.utcnow()
    elif action == "reopen":
        row.reviewed_at = None
    db.commit()
    return {"status": "success", "report": {"id": row.id, "status": row.status}}

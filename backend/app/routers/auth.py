import datetime
import secrets
from typing import Optional
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session
from app.config import settings
from app.database import get_db
from app.models.schema import User, Subscription, PasswordResetToken
from app.services import referral
from app.services import email as mailer
from app.services.auth import get_password_hash, verify_password, create_access_token, require_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""
    referral_code: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str  # id_token or code


class UpdateProfileRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=255)


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    token: str
    new_password: str = Field(..., min_length=8, max_length=128)


def _user_payload(user: User, db: Optional[Session] = None) -> dict:
    sub = user.subscription
    referred_by_code = (getattr(user, "referred_by_code", None) or "").strip().upper() or None
    if not referred_by_code and db is not None:
        referred_by_code = referral.signup_referral_code(db, user)
    return {
        "id": user.id,
        "email": user.email,
        "full_name": user.full_name,
        "avatar_url": user.avatar_url,
        "is_admin": user.is_admin,
        "referred_by_code": referred_by_code,
        "subscription": {
            "status": sub.status if sub else "trial",
            "plan": sub.plan if sub else "free_trial",
            "episodes_watched": sub.episodes_watched if sub else 0,
        },
    }


@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    if len(req.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    user = User(
        email=req.email.lower(),
        hashed_password=get_password_hash(req.password),
        full_name=req.full_name or req.email.split("@")[0],
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Automatically create free trial subscription (limit from guest_preview_episodes setting)
    sub = Subscription(
        user_id=user.id,
        status="trial",
        plan="free_trial",
        episodes_watched=0,
    )
    db.add(sub)
    db.flush()

    # Every user gets their own referral code; attribute to a referrer if a valid code was supplied
    referral.ensure_referral_code(db, user)
    code_row = referral.find_active_code(db, req.referral_code) if req.referral_code else None
    if code_row:
        referral.attribute_referral(db, user, code_row)

    db.commit()

    token = create_access_token({"sub": str(user.id), "email": user.email})
    db.refresh(user)
    mailer.send_welcome(user.email, user.full_name)
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_payload(user, db),
    }


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if (
        not user
        or not user.hashed_password
        or not verify_password(req.password, user.hashed_password)
    ):
        raise HTTPException(status_code=400, detail="Invalid email or password")

    token = create_access_token({"sub": str(user.id), "email": user.email})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_payload(user, db),
    }


@router.get("/me")
def get_me(
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    return _user_payload(user, db)


@router.patch("/me")
def update_me(
    req: UpdateProfileRequest,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    name = req.full_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Full name is required")
    user.full_name = name
    db.commit()
    db.refresh(user)
    return _user_payload(user, db)


@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    user: User = Depends(require_current_user),
    db: Session = Depends(get_db),
):
    if not user.hashed_password:
        raise HTTPException(
            status_code=400,
            detail="This account uses Google sign-in and has no password to change",
        )
    if not verify_password(req.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if req.current_password == req.new_password:
        raise HTTPException(status_code=400, detail="New password must be different")

    user.hashed_password = get_password_hash(req.new_password)
    db.commit()
    return {"ok": True, "message": "Password updated successfully"}


@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """Always returns the same generic response. When the account exists, the
    one-time reset link is emailed via Resend. The token is never returned to the client.
    """
    generic = {
        "ok": True,
        "message": "If an account exists for that email, we've sent a reset link. Check your inbox.",
    }
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user or not user.hashed_password:
        return generic

    # Invalidate prior unused tokens
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used.is_(False),
    ).update({"used": True})

    token = secrets.token_urlsafe(32)
    row = PasswordResetToken(
        user_id=user.id,
        token=token,
        expires_at=datetime.datetime.utcnow() + datetime.timedelta(hours=1),
        used=False,
    )
    db.add(row)
    db.commit()

    mailer.send_password_reset(user.email, token)
    return generic


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email.lower()).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    row = (
        db.query(PasswordResetToken)
        .filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.token == req.token,
            PasswordResetToken.used.is_(False),
        )
        .first()
    )
    if not row or row.expires_at < datetime.datetime.utcnow():
        raise HTTPException(status_code=400, detail="Invalid or expired reset link")

    user.hashed_password = get_password_hash(req.new_password)
    row.used = True
    db.commit()
    return {"ok": True, "message": "Password has been reset. You can sign in now."}


def _require_google_oauth_config():
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=503,
            detail="Google login is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )


def _frontend_login_redirect(token: str | None = None, error: str | None = None) -> RedirectResponse:
    base = settings.FRONTEND_URL.rstrip("/")
    if token:
        return RedirectResponse(url=f"{base}/login#token={token}", status_code=302)
    q = urlencode({"error": error or "google_auth_failed"})
    return RedirectResponse(url=f"{base}/login?{q}", status_code=302)


def _upsert_google_user(db: Session, *, google_sub: str, email: str, full_name: str, avatar_url: str) -> User:
    email = email.lower().strip()
    user = db.query(User).filter(User.google_sub == google_sub).first()
    if not user:
        user = db.query(User).filter(User.email == email).first()

    created = False
    if user:
        user.google_sub = google_sub
        if full_name and not user.full_name:
            user.full_name = full_name
        if avatar_url and not user.avatar_url:
            user.avatar_url = avatar_url
    else:
        user = User(
            email=email,
            hashed_password=None,
            full_name=full_name or email.split("@")[0],
            avatar_url=avatar_url or "",
            google_sub=google_sub,
        )
        db.add(user)
        db.flush()
        db.add(
            Subscription(
                user_id=user.id,
                status="trial",
                plan="free_trial",
                episodes_watched=0,
            )
        )
        db.flush()
        referral.ensure_referral_code(db, user)
        created = True

    db.commit()
    db.refresh(user)
    if created:
        mailer.send_welcome(user.email, user.full_name)
    return user


@router.get("/google/login")
def google_login_redirect():
    _require_google_oauth_config()
    params = {
        "response_type": "code",
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "scope": "openid email profile",
        "access_type": "online",
        "prompt": "select_account",
    }
    return {"auth_url": f"{GOOGLE_AUTH_URL}?{urlencode(params)}"}


@router.get("/google/callback")
async def google_callback(
    code: str | None = Query(None),
    error: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Exchange Google auth code for profile, upsert user, redirect to frontend with JWT."""
    if error or not code:
        return _frontend_login_redirect(error="google_auth_denied")

    try:
        _require_google_oauth_config()
    except HTTPException:
        return _frontend_login_redirect(error="google_not_configured")

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            token_res = await client.post(
                GOOGLE_TOKEN_URL,
                data={
                    "code": code,
                    "client_id": settings.GOOGLE_CLIENT_ID,
                    "client_secret": settings.GOOGLE_CLIENT_SECRET,
                    "redirect_uri": settings.GOOGLE_REDIRECT_URI,
                    "grant_type": "authorization_code",
                },
                headers={"Accept": "application/json"},
            )
            if token_res.status_code >= 400:
                return _frontend_login_redirect(error="google_token_exchange_failed")

            tokens = token_res.json()
            access_token = tokens.get("access_token")
            if not access_token:
                return _frontend_login_redirect(error="google_token_missing")

            info_res = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if info_res.status_code >= 400:
                return _frontend_login_redirect(error="google_userinfo_failed")

            info = info_res.json()
    except httpx.HTTPError:
        return _frontend_login_redirect(error="google_network_error")

    google_sub = info.get("sub")
    email = info.get("email")
    if not google_sub or not email:
        return _frontend_login_redirect(error="google_profile_incomplete")
    if info.get("email_verified") is False:
        return _frontend_login_redirect(error="google_email_unverified")

    user = _upsert_google_user(
        db,
        google_sub=google_sub,
        email=email,
        full_name=(info.get("name") or "").strip(),
        avatar_url=(info.get("picture") or "").strip(),
    )
    jwt_token = create_access_token({"sub": str(user.id), "email": user.email})
    return _frontend_login_redirect(token=jwt_token)

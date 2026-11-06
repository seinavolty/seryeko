import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=True)
    full_name = Column(String(255), default="")
    avatar_url = Column(String(500), default="")
    google_sub = Column(String(255), unique=True, nullable=True)
    is_active = Column(Boolean, default=True)
    is_admin = Column(Boolean, default=False)
    referred_by_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    referred_by_code = Column(String(32), nullable=True)  # referral/voucher code used at signup
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationships
    subscription = relationship("Subscription", back_populates="user", uselist=False)
    watchlist = relationship("WatchlistItem", back_populates="user", cascade="all, delete-orphan")
    progress = relationship("WatchProgress", back_populates="user", cascade="all, delete-orphan")
    reset_tokens = relationship("PasswordResetToken", back_populates="user", cascade="all, delete-orphan")
    refund_requests = relationship("RefundRequest", back_populates="user", cascade="all, delete-orphan")
    referral_code = relationship("ReferralCode", back_populates="user", uselist=False, cascade="all, delete-orphan")
    withdrawal_requests = relationship("WithdrawalRequest", back_populates="user", cascade="all, delete-orphan")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token = Column(String(128), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="reset_tokens")

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    status = Column(String(50), default="trial")  # "trial", "active", "cancelled"
    plan = Column(String(50), default="free_trial")  # "free_trial", "lifetime"
    episodes_watched = Column(Integer, default=0)  # Count of free episodes watched
    amount_php = Column(Float, default=0.0)  # amount actually paid (post-discount)
    list_amount_php = Column(Float, default=0.0)  # original list price before any voucher discount
    discount_php = Column(Float, default=0.0)  # amount discounted off list price
    referral_code_used = Column(String(32), nullable=True)  # voucher code applied at checkout, if any
    currency = Column(String(10), default="PHP")
    payment_method = Column(String(50), default="")  # "qrph"
    paymongo_payment_id = Column(String(255), nullable=True)
    paymongo_source_id = Column(String(255), nullable=True)
    activated_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="subscription")

class AppSetting(Base):
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    value = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    drama_id = Column(String(100), nullable=False)
    title = Column(String(255), default="")
    cover = Column(String(500), default="")
    provider = Column(String(100), default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="watchlist")

class WatchProgress(Base):
    __tablename__ = "watch_progress"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    drama_id = Column(String(100), nullable=False)
    episode_num = Column(Integer, default=1)
    progress_pct = Column(Float, default=0.0)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    user = relationship("User", back_populates="progress")

class WebhookLog(Base):
    __tablename__ = "webhook_logs"

    id = Column(Integer, primary_key=True, index=True)
    event_type = Column(String(100), default="")
    payload = Column(Text, default="")
    status = Column(String(50), default="processed")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

class ProviderConfig(Base):
    __tablename__ = "provider_configs"

    id = Column(String(100), primary_key=True)
    name = Column(String(100), nullable=False)
    is_enabled = Column(Boolean, default=True)
    status = Column(String(50), default="active")
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)


class RefundRequest(Base):
    """7-day cancellation / money-back guarantee request."""
    __tablename__ = "refund_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=True)
    reason = Column(String(50), default="")
    details = Column(Text, default="")
    status = Column(String(20), default="pending")  # pending | approved | rejected | refunded
    eligible_until = Column(DateTime, nullable=True)
    admin_note = Column(Text, default="")
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="refund_requests")


class ReferralCode(Base):
    """A user's personal referral code — doubles as a checkout discount voucher."""
    __tablename__ = "referral_codes"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    code = Column(String(32), unique=True, index=True, nullable=False)
    is_enabled = Column(Boolean, default=True)
    discount_type = Column(String(10), nullable=True)  # "percent" | "fixed" — null = use global setting
    discount_value = Column(Float, nullable=True)
    commission_pct = Column(Float, nullable=True)  # null = use global referral_commission_pct
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="referral_code")


class ReferralCommission(Base):
    """One row per referred lifetime purchase."""
    __tablename__ = "referral_commissions"

    id = Column(Integer, primary_key=True, index=True)
    referrer_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    referred_user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    subscription_id = Column(Integer, ForeignKey("subscriptions.id"), nullable=True)
    referral_code = Column(String(32), default="")
    gross_php = Column(Float, default=0.0)  # original list price
    paid_php = Column(Float, default=0.0)  # amount buyer actually paid (post-discount)
    amount_php = Column(Float, default=0.0)  # commission payout amount
    rate_pct = Column(Float, default=0.0)
    status = Column(String(20), default="pending")  # pending | approved | paid | cancelled
    note = Column(Text, default="")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    approved_at = Column(DateTime, nullable=True)
    paid_at = Column(DateTime, nullable=True)


class WithdrawalRequest(Base):
    """Referral earning payout request (Philippine payment methods)."""
    __tablename__ = "withdrawal_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    amount_php = Column(Float, nullable=False)
    method = Column(String(20), nullable=False)  # gcash | maya | bank | grabpay
    account_name = Column(String(255), default="")
    account_number = Column(String(100), default="")  # mobile / account no.
    bank_name = Column(String(100), default="")  # used when method=bank
    status = Column(String(20), default="pending")  # pending | approved | sent | cancelled
    admin_note = Column(Text, default="")
    reviewed_at = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User", back_populates="withdrawal_requests")


class CachedDrama(Base):
    """Local durable cache of drama metadata fetched from provider APIs."""
    __tablename__ = "cached_dramas"

    drama_id = Column(String(150), primary_key=True, index=True)
    provider = Column(String(100), default="", index=True)
    original_id = Column(String(150), default="", index=True)
    title = Column(String(500), default="")
    cover = Column(Text, default="")
    cover_image = Column(Text, default="")
    summary = Column(Text, default="")
    synopsis = Column(Text, default="")
    episodes_count = Column(Integer, default=0)
    badge = Column(String(100), default="")
    tags_json = Column(Text, default="[]")
    genre_json = Column(Text, default="[]")
    country = Column(String(50), default="")
    year = Column(Integer, nullable=True)
    status = Column(String(50), default="ongoing")
    rating = Column(Float, default=4.5)
    languages_json = Column(Text, default='["en"]')
    title_localized_json = Column(Text, default="{}")
    raw_json = Column(Text, default="{}")
    play_count = Column(Integer, default=0)
    source = Column(String(50), default="api")  # api | catalog | fallback
    is_hidden = Column(Boolean, default=False)  # admin: hide from public browse/search
    is_featured = Column(Boolean, default=False)  # admin: pin to top of browse
    last_fetched_at = Column(DateTime, default=datetime.datetime.utcnow)
    last_played_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    episodes = relationship(
        "CachedEpisode",
        back_populates="drama",
        cascade="all, delete-orphan",
        order_by="CachedEpisode.episode_num",
    )


class CachedEpisode(Base):
    """Local durable cache of episode metadata + playable video URLs."""
    __tablename__ = "cached_episodes"

    id = Column(Integer, primary_key=True, index=True)
    drama_id = Column(String(150), ForeignKey("cached_dramas.drama_id"), nullable=False, index=True)
    episode_id = Column(String(200), default="")
    episode_num = Column(Integer, default=1, index=True)
    title = Column(String(500), default="")
    video_url = Column(Text, default="")
    cover = Column(Text, default="")
    duration = Column(Integer, nullable=True)
    is_locked_provider = Column(Boolean, default=False)
    raw_json = Column(Text, default="{}")
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    drama = relationship("CachedDrama", back_populates="episodes")


class VideoReport(Base):
    """User-reported playback failures — reviewed in the admin Command Centre."""
    __tablename__ = "video_reports"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    drama_id = Column(String(150), nullable=False, index=True)
    episode_num = Column(Integer, default=1)
    episode_id = Column(String(200), default="")
    provider = Column(String(100), default="", index=True)
    title = Column(String(500), default="")
    video_url = Column(Text, default="")
    reason = Column(String(100), default="playback_failed")
    details = Column(Text, default="")
    status = Column(String(20), default="open", index=True)  # open | reviewing | resolved | dismissed
    admin_note = Column(Text, default="")
    reviewed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, index=True)

    user = relationship("User")


class EpisodeLike(Base):
    """Per-user like on a drama episode (real heart counts on Watch)."""
    __tablename__ = "episode_likes"
    __table_args__ = (
        UniqueConstraint("user_id", "drama_id", "episode_num", name="uq_episode_like_user"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    drama_id = Column(String(150), nullable=False, index=True)
    episode_num = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    user = relationship("User")

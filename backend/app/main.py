import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.database import engine, Base, SessionLocal
from app.models.schema import (  # noqa: F401 — register tables
    User, AppSetting, CachedDrama, CachedEpisode, EpisodeLike,
    RefundRequest, ReferralCode, ReferralCommission, WithdrawalRequest,
    ProviderConfig, WebhookLog,
)
from app.services.auth import get_password_hash
from app.services import settings_store
from app.services.migrations import run_additive_migrations
from app.routers import auth, content, subscription, admin, watchlist, referral, webhooks

# Add any new columns to pre-existing tables (create_all below only handles
# brand-new tables), then create any brand-new tables.
run_additive_migrations(engine)
Base.metadata.create_all(bind=engine)

# Seed default admin and settings if not present
def seed_defaults():
    db = SessionLocal()
    try:
        # Seed admin
        admin_user = db.query(User).filter(User.email == "admin@seryeko.com").first()
        if not admin_user:
            admin_user = User(
                email="admin@seryeko.com",
                hashed_password=get_password_hash("admin123456"),
                full_name="SeryeKo Superadmin",
                is_admin=True
            )
            db.add(admin_user)

        # Seed default prices
        php_setting = db.query(AppSetting).filter(AppSetting.key == "lifetime_price_php").first()
        if not php_setting:
            db.add(AppSetting(key="lifetime_price_php", value="999"))

        usd_setting = db.query(AppSetting).filter(AppSetting.key == "lifetime_price_usd").first()
        if not usd_setting:
            db.add(AppSetting(key="lifetime_price_usd", value="17"))

        db.commit()
    finally:
        db.close()

def _apply_db_overrides():
    """Load any admin-rotated API keys from the DB so they take effect without a restart."""
    db = SessionLocal()
    try:
        dramabuzz_key = settings_store.get_setting(db, "dramabuzz_api_key", "")
        if dramabuzz_key:
            from app.services.catalog import catalog_service
            from app.services.provider import aggregator
            catalog_service.api_key = dramabuzz_key
            aggregator.api_key = dramabuzz_key
    finally:
        db.close()

seed_defaults()
_apply_db_overrides()

is_production = settings.ENVIRONMENT.lower() == "production"


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Warm multi-provider catalog in background so first /browse isn't a cold fan-out
    async def _warm():
        try:
            from app.services.catalog import catalog_service
            await catalog_service.warm("en")
        except Exception as e:
            print(f"Startup catalog warm error: {e}")

    task = asyncio.create_task(_warm())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="SeryeKo API",
    description="Backend API for SeryeKo.com — Short Dramas, Big Kilig",
    version="1.0.0",
    docs_url=None if is_production else "/docs",
    redoc_url=None if is_production else "/redoc",
    openapi_url=None if is_production else "/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API Routers
app.include_router(auth.router)
app.include_router(content.router)
app.include_router(subscription.router)
app.include_router(admin.router)
app.include_router(watchlist.router)
app.include_router(referral.router)
app.include_router(webhooks.router)

# Optional local SPA mount (production frontend is served by seryeko-web)
dist_dir = os.getenv("FRONTEND_DIST_DIR", "")
if dist_dir and os.path.exists(dist_dir):
    app.mount("/app", StaticFiles(directory=dist_dir, html=True), name="app")

@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "seryeko-api",
        "version": "1.0.0"
    }

@app.get("/")
def root():
    payload = {"message": "Welcome to SeryeKo API — Short Dramas, Big Kilig"}
    if not is_production:
        payload["docs"] = "/docs"
    return payload


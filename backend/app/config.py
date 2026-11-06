import os
from pathlib import Path

from pydantic import BaseModel

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parents[1] / ".env")
except ImportError:
    pass

class Settings(BaseModel):
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    # Docker Compose / backend/.env sets postgresql+psycopg://... ; fallback SQLite.
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./seryeko.db")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "seryeko-dev-secret-change-in-production")
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_HOURS: int = 24 * 7  # 7 days
    
    # DramaBuzz API Key
    DRAMABUZZ_API_KEY: str = os.getenv("DRAMABUZZ_API_KEY", "")
    
    # PayMongo Credentials
    PAYMONGO_PUBLIC_KEY: str = os.getenv("PAYMONGO_PUBLIC_KEY", "pk_test_seryeko_mock_public")
    PAYMONGO_SECRET_KEY: str = os.getenv("PAYMONGO_SECRET_KEY", "sk_test_seryeko_mock_secret")
    PAYMONGO_WEBHOOK_SECRET: str = os.getenv("PAYMONGO_WEBHOOK_SECRET", "whsec_mock_secret")
    
    # Google OAuth
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    # Must match Google Cloud Console exactly (prod uses web host; nginx proxies /api → API)
    GOOGLE_REDIRECT_URI: str = os.getenv(
        "GOOGLE_REDIRECT_URI",
        "http://localhost:5173/api/auth/google/callback",
    )
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Resend transactional email (welcome, password reset, payment invoice)
    RESEND_API_KEY: str = os.getenv("RESEND_API_KEY", "")
    EMAIL_FROM: str = os.getenv("EMAIL_FROM", "SeryeKo.com <support@seryeko.com>")

    # Default Pricing
    DEFAULT_LIFETIME_PRICE_PHP: int = 999
    DEFAULT_LIFETIME_PRICE_USD: int = 17
    FREE_TRIAL_EPISODES: int = 3

settings = Settings()

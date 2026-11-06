from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.config import settings

db_url = settings.DATABASE_URL
# Fly attach uses postgres:// ; docker/.env often uses postgresql://
# SQLAlchemy + psycopg3 need postgresql+psycopg://
if db_url.startswith("postgres://"):
    db_url = "postgresql+psycopg://" + db_url[len("postgres://") :]
elif db_url.startswith("postgresql://"):
    db_url = "postgresql+psycopg://" + db_url[len("postgresql://") :]
elif db_url.startswith("postgresql+psycopg2://"):
    db_url = "postgresql+psycopg://" + db_url[len("postgresql+psycopg2://") :]

connect_args = {}
engine_kwargs = {"echo": False}
if db_url.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
else:
    # Small pool suitable for single-node / docker local
    engine_kwargs.update(
        pool_pre_ping=True,
        pool_size=5,
        max_overflow=10,
    )

engine = create_engine(db_url, connect_args=connect_args, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

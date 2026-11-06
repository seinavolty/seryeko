"""Lightweight additive-column migrations.

This project uses `Base.metadata.create_all()` to bootstrap brand-new tables,
but that call never alters existing tables — so new columns added to models
for the Admin Command Centre (referral attribution, voucher pricing, catalog
visibility) must be migrated in by hand for databases that already have the
old table shape (e.g. a running Postgres instance). This runs once at
startup, before `create_all`, and is a no-op once the columns exist.
"""
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# (table, column, DDL type + default, used for both Postgres and SQLite)
_ADDITIVE_COLUMNS = [
    ("users", "referred_by_user_id", "INTEGER"),
    ("users", "referred_by_code", "VARCHAR(32)"),
    ("subscriptions", "list_amount_php", "FLOAT DEFAULT 0.0"),
    ("subscriptions", "discount_php", "FLOAT DEFAULT 0.0"),
    ("subscriptions", "referral_code_used", "VARCHAR(32)"),
    ("cached_dramas", "is_hidden", "BOOLEAN DEFAULT FALSE"),
    ("cached_dramas", "is_featured", "BOOLEAN DEFAULT FALSE"),
]


def run_additive_migrations(engine: Engine) -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table, column, ddl_type in _ADDITIVE_COLUMNS:
            if table not in existing_tables:
                # Table doesn't exist yet — create_all() will create it
                # (with the column already correct), nothing to migrate.
                continue
            cols = {c["name"] for c in inspector.get_columns(table)}
            if column in cols:
                continue
            try:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
                print(f"[migrations] added column {table}.{column}")
            except Exception as e:  # pragma: no cover — best-effort, don't block startup
                print(f"[migrations] could not add {table}.{column}: {e}")

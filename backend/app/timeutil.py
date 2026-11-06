"""App-wide calendar timezone: GMT+8 (Asia/Manila — no DST).

Timestamps are still stored as naive UTC in the database (legacy
`datetime.utcnow()`). Calendar-day bucketing and user-facing “today”
use Asia/Manila so charts and date labels match Philippine local time.
"""
from __future__ import annotations

import datetime
from zoneinfo import ZoneInfo

APP_TZ = ZoneInfo("Asia/Manila")  # GMT+8, no daylight saving
UTC = datetime.timezone.utc


def now_utc_naive() -> datetime.datetime:
    """Naive UTC — matches values written by datetime.utcnow()."""
    return datetime.datetime.now(UTC).replace(tzinfo=None)


def now_gmt8() -> datetime.datetime:
    return datetime.datetime.now(APP_TZ)


def today_gmt8() -> datetime.date:
    return now_gmt8().date()


def day_bounds_utc_naive(day: datetime.date) -> tuple[datetime.datetime, datetime.datetime]:
    """Return [start, end) as naive-UTC datetimes for a GMT+8 calendar day."""
    start_local = datetime.datetime.combine(day, datetime.time.min, tzinfo=APP_TZ)
    end_local = start_local + datetime.timedelta(days=1)
    start_utc = start_local.astimezone(UTC).replace(tzinfo=None)
    end_utc = end_local.astimezone(UTC).replace(tzinfo=None)
    return start_utc, end_utc

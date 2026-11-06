"""Transactional email via Resend (https://resend.com/docs/api-reference/emails/send-email).

Failures are logged and never raised: a mail outage must not break signup,
password reset, or payment activation.
"""
from __future__ import annotations

import html
import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

RESEND_EMAILS_URL = "https://api.resend.com/emails"
BRAND = "SeryeKo.com"


def _send(to: str, subject: str, html_body: str, text_body: str) -> bool:
    if not settings.RESEND_API_KEY:
        logger.warning("RESEND_API_KEY not set; skipping email '%s' to %s", subject, to)
        return False
    try:
        resp = httpx.post(
            RESEND_EMAILS_URL,
            headers={"Authorization": f"Bearer {settings.RESEND_API_KEY}"},
            json={
                "from": settings.EMAIL_FROM,
                "to": [to],
                "subject": subject,
                "html": html_body,
                "text": text_body,
            },
            timeout=8.0,
        )
    except httpx.HTTPError:
        logger.exception("Resend request failed for '%s' to %s", subject, to)
        return False
    if resp.status_code >= 400:
        logger.error("Resend rejected '%s' to %s: %s %s", subject, to, resp.status_code, resp.text)
        return False
    return True


def _wrap(title: str, body_html: str) -> str:
    return (
        '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#111">'
        f'<h2 style="margin:0 0 16px">{html.escape(title)}</h2>'
        f"{body_html}"
        f'<p style="margin-top:32px;font-size:12px;color:#777">{BRAND} · '
        f'<a href="{settings.FRONTEND_URL.rstrip("/")}/help">Support</a></p>'
        "</div>"
    )


def send_welcome(to: str, full_name: str) -> bool:
    name = html.escape(full_name or "there")
    site = settings.FRONTEND_URL.rstrip("/")
    body = (
        f"<p>Hi {name},</p>"
        "<p>Welcome to SeryeKo! Your account is ready. You get free episodes to start, "
        "and you can unlock lifetime access any time for a one-time payment.</p>"
        f'<p><a href="{site}/browse" style="color:#e11d48">Start watching</a></p>'
    )
    text = (
        f"Hi {full_name or 'there'},\n\nWelcome to SeryeKo! Your account is ready.\n"
        f"Start watching: {site}/browse\n"
    )
    return _send(to, f"Welcome to {BRAND}", _wrap(f"Welcome to {BRAND}", body), text)


def send_password_reset(to: str, token: str) -> bool:
    site = settings.FRONTEND_URL.rstrip("/")
    link = f"{site}/reset-password?email={to}&token={token}"
    body = (
        "<p>We received a request to reset your password. This link expires in 1 hour.</p>"
        f'<p><a href="{link}" style="display:inline-block;padding:12px 20px;background:#e11d48;'
        'color:#fff;text-decoration:none;border-radius:999px">Reset password</a></p>'
        "<p>If you didn't request this, you can ignore this email. Your password won't change.</p>"
    )
    text = (
        "We received a request to reset your password. This link expires in 1 hour.\n\n"
        f"{link}\n\nIf you didn't request this, ignore this email.\n"
    )
    return _send(to, f"Reset your {BRAND} password", _wrap("Reset your password", body), text)


def send_invoice(
    to: str,
    *,
    full_name: str,
    reference: str,
    amount_php: float,
    list_amount_php: Optional[float],
    discount_php: float,
    referral_code: Optional[str],
    paid_at_text: str,
) -> bool:
    def row(label: str, value: str) -> str:
        return (
            f'<tr><td style="padding:6px 0;color:#555">{label}</td>'
            f'<td style="padding:6px 0;text-align:right">{value}</td></tr>'
        )

    rows = [
        row("Item", "SeryeKo.com Lifetime Membership"),
        row("Reference", html.escape(reference or "-")),
        row("Date", html.escape(paid_at_text)),
    ]
    if list_amount_php is not None and discount_php:
        rows.append(row("List price", f"₱{list_amount_php:,.2f}"))
        rows.append(row("Discount", f"-₱{discount_php:,.2f}"))
        if referral_code:
            rows.append(row("Code applied", html.escape(referral_code)))
    rows.append(row("<strong>Total paid</strong>", f"<strong>₱{amount_php:,.2f}</strong>"))
    table = (
        '<table style="width:100%;border-collapse:collapse;border-top:1px solid #ddd;'
        'border-bottom:1px solid #ddd">' + "".join(rows) + "</table>"
    )
    name = html.escape(full_name or "there")
    body = (
        f"<p>Hi {name}, thanks for your payment. Your lifetime access is now active.</p>"
        f"{table}"
        '<p style="font-size:13px;color:#555">Payment method: QR Ph. Keep this email as your receipt.</p>'
    )
    text_lines = [
        f"Hi {full_name or 'there'}, thanks for your payment. Lifetime access is active.",
        "",
        "Item: SeryeKo.com Lifetime Membership",
        f"Reference: {reference or '-'}",
        f"Date: {paid_at_text}",
    ]
    if list_amount_php is not None and discount_php:
        text_lines.append(f"List price: PHP {list_amount_php:,.2f}")
        text_lines.append(f"Discount: -PHP {discount_php:,.2f}")
    text_lines.append(f"Total paid: PHP {amount_php:,.2f}")
    return _send(
        to,
        f"Your {BRAND} receipt",
        _wrap("Payment receipt", body),
        "\n".join(text_lines) + "\n",
    )

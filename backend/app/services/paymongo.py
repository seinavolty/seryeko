"""PayMongo client — QRPH-only Payment Intent flow.

Dynamic QR Ph codes are generated per transaction:
  create intent (qrph) → create payment method → attach → display QR image_url
"""
from __future__ import annotations

from typing import Any, Dict, Optional

import httpx
from sqlalchemy.orm import Session

from app.config import settings
from app.services import settings_store


class PayMongoService:
    base_url = "https://api.paymongo.com/v1"

    def __init__(
        self,
        secret_key: Optional[str] = None,
        public_key: Optional[str] = None,
        webhook_secret: Optional[str] = None,
        mode: str = "test",
    ):
        self.secret_key = secret_key or settings.PAYMONGO_SECRET_KEY
        self.public_key = public_key or settings.PAYMONGO_PUBLIC_KEY
        self.webhook_secret = webhook_secret or settings.PAYMONGO_WEBHOOK_SECRET
        self.mode = mode if mode in ("test", "live") else "test"

    @classmethod
    def from_db(cls, db: Session) -> "PayMongoService":
        keys = settings_store.get_keys_settings(db, masked=False)
        return cls(
            secret_key=keys.get("paymongo_secret_key") or settings.PAYMONGO_SECRET_KEY,
            public_key=keys.get("paymongo_public_key") or settings.PAYMONGO_PUBLIC_KEY,
            webhook_secret=keys.get("paymongo_webhook_secret") or settings.PAYMONGO_WEBHOOK_SECRET,
            mode=keys.get("paymongo_mode") or "test",
        )

    @property
    def is_mock(self) -> bool:
        return "mock" in (self.secret_key or "").lower()

    def _auth(self) -> tuple[str, str]:
        return (self.secret_key, "")

    async def create_payment_intent(
        self,
        amount_php: float,
        description: str = "SeryeKo.com Lifetime Membership",
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Create a QRPH-only Payment Intent. Amount in PHP; sent as centavos."""
        centavos = int(round(float(amount_php) * 100))
        meta = {str(k): str(v) for k, v in (metadata or {}).items() if v is not None}

        if self.is_mock:
            return {
                "id": f"pi_mock_{centavos}",
                "type": "payment_intent",
                "attributes": {
                    "amount": centavos,
                    "currency": "PHP",
                    "description": description,
                    "status": "awaiting_payment_method",
                    "client_key": f"pi_mock_{centavos}_client",
                    "metadata": meta,
                },
            }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.base_url}/payment_intents",
                    auth=self._auth(),
                    json={
                        "data": {
                            "attributes": {
                                "amount": centavos,
                                "currency": "PHP",
                                "payment_method_allowed": ["qrph"],
                                "description": description,
                                "metadata": meta,
                            }
                        }
                    },
                )
                if resp.status_code in (200, 201):
                    return resp.json().get("data", {})
                return {"error": resp.text, "status_code": resp.status_code}
        except Exception as e:
            return {"error": str(e)}

    async def create_qrph_payment_method(self, expiry_seconds: int = 1800) -> Dict[str, Any]:
        expiry = max(60, min(int(expiry_seconds), 9000))

        if self.is_mock:
            return {
                "id": f"pm_mock_qrph_{expiry}",
                "type": "payment_method",
                "attributes": {
                    "type": "qrph",
                    "expiry_seconds": expiry,
                },
            }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.base_url}/payment_methods",
                    auth=self._auth(),
                    json={
                        "data": {
                            "attributes": {
                                "type": "qrph",
                                "expiry_seconds": expiry,
                            }
                        }
                    },
                )
                if resp.status_code in (200, 201):
                    return resp.json().get("data", {})
                return {"error": resp.text, "status_code": resp.status_code}
        except Exception as e:
            return {"error": str(e)}

    async def attach_payment_method(
        self,
        payment_intent_id: str,
        payment_method_id: str,
        client_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        if self.is_mock:
            # Base64 1x1 PNG placeholder — frontend still renders an <img>
            placeholder = (
                "data:image/png;base64,"
                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
            )
            return {
                "id": payment_intent_id,
                "type": "payment_intent",
                "attributes": {
                    "status": "awaiting_next_action",
                    "client_key": client_key or f"{payment_intent_id}_client",
                    "next_action": {
                        "type": "qrph",
                        "code": {"image_url": placeholder},
                    },
                    "payments": [],
                },
            }

        body: Dict[str, Any] = {
            "data": {
                "attributes": {
                    "payment_method": payment_method_id,
                }
            }
        }
        if client_key:
            body["data"]["attributes"]["client_key"] = client_key

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    f"{self.base_url}/payment_intents/{payment_intent_id}/attach",
                    auth=self._auth(),
                    json=body,
                )
                if resp.status_code in (200, 201):
                    return resp.json().get("data", {})
                return {"error": resp.text, "status_code": resp.status_code}
        except Exception as e:
            return {"error": str(e)}

    async def retrieve_payment_intent(self, payment_intent_id: str) -> Dict[str, Any]:
        if self.is_mock:
            return {
                "id": payment_intent_id,
                "type": "payment_intent",
                "attributes": {
                    "status": "awaiting_next_action",
                    "payments": [],
                    "next_action": {
                        "type": "qrph",
                        "code": {
                            "image_url": (
                                "data:image/png;base64,"
                                "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
                            )
                        },
                    },
                },
            }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.get(
                    f"{self.base_url}/payment_intents/{payment_intent_id}",
                    auth=self._auth(),
                )
                if resp.status_code in (200, 201):
                    return resp.json().get("data", {})
                return {"error": resp.text, "status_code": resp.status_code}
        except Exception as e:
            return {"error": str(e)}

    @staticmethod
    def extract_qr_image_url(intent: Dict[str, Any]) -> Optional[str]:
        attrs = intent.get("attributes") or {}
        next_action = attrs.get("next_action") or {}
        code = next_action.get("code") or {}
        return code.get("image_url")

    @staticmethod
    def extract_payment_id(intent: Dict[str, Any]) -> Optional[str]:
        attrs = intent.get("attributes") or {}
        payments = attrs.get("payments") or []
        if payments and isinstance(payments[0], dict):
            return payments[0].get("id")
        return None


# Module-level default for backwards compatibility (env keys only).
paymongo = PayMongoService()

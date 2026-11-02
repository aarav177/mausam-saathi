"""SMS provider boundary with a safe simulation adapter and MSG91 transport."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


MSG91_BASE_URL = "https://control.msg91.com/api/v5"


class SmsProviderError(RuntimeError):
    """Provider rejected a request or could not be reached."""


@dataclass(frozen=True)
class SendResult:
    # submitted means the provider accepted the request; only a delivery
    # callback can later establish that a handset received it.
    status: str
    provider_id: str | None = None


class SmsProvider:
    def send(self, recipient: str, message: str) -> SendResult:
        raise NotImplementedError

    def send_otp(self, recipient: str, *, expiry_minutes: int) -> str | None:
        raise NotImplementedError

    def verify_otp(self, recipient: str, otp: str) -> bool:
        raise NotImplementedError


class TestSmsProvider(SmsProvider):
    """Records simulated notifications and never delivers messages."""

    def send(self, recipient: str, message: str) -> SendResult:
        return SendResult(status="simulated")

    def send_otp(self, recipient: str, *, expiry_minutes: int) -> str | None:
        raise SmsProviderError("OTP verification is unavailable in test mode.")

    def verify_otp(self, recipient: str, otp: str) -> bool:
        raise SmsProviderError("OTP verification is unavailable in test mode.")


class Msg91SmsProvider(SmsProvider):
    def __init__(
        self,
        auth_key: str,
        otp_template_id: str,
        sms_template_id: str,
    ):
        self.auth_key = auth_key
        self.otp_template_id = otp_template_id
        self.sms_template_id = sms_template_id

    def _request(
        self,
        method: str,
        url: str,
        *,
        body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        headers = {"authkey": self.auth_key, "Accept": "application/json"}
        data = None
        if body is not None:
            headers["Content-Type"] = "application/json"
            data = json.dumps(body).encode("utf-8")
        request = Request(url, data=data, headers=headers, method=method)
        try:
            with urlopen(request, timeout=12) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, OSError, ValueError) as exc:
            raise SmsProviderError("MSG91 request failed.") from exc
        if not isinstance(payload, dict):
            raise SmsProviderError("MSG91 returned an invalid response.")
        return payload

    @staticmethod
    def _is_success(payload: dict[str, Any]) -> bool:
        has_error = payload.get("hasError")
        if has_error is True or str(has_error).casefold() == "true":
            return False
        if payload.get("type") is not None:
            return str(payload["type"]).casefold() == "success"
        status = payload.get("status")
        return str(status).casefold() == "success"

    def send_otp(self, recipient: str, *, expiry_minutes: int) -> str | None:
        query = urlencode(
            {
                "template_id": self.otp_template_id,
                "mobile": recipient.lstrip("+"),
                "otp_length": 6,
                "otp_expiry": expiry_minutes,
                "realTimeResponse": 1,
            }
        )
        payload = self._request(
            "POST", f"{MSG91_BASE_URL}/otp?{query}", body={}
        )
        if not self._is_success(payload):
            raise SmsProviderError("MSG91 rejected the OTP request.")
        provider_id = payload.get("request_id") or payload.get("requestId")
        return str(provider_id) if provider_id else None

    def verify_otp(self, recipient: str, otp: str) -> bool:
        query = urlencode({"otp": otp, "mobile": recipient.lstrip("+")})
        payload = self._request(
            "GET", f"{MSG91_BASE_URL}/otp/verify?{query}"
        )
        if str(payload.get("type", "")).casefold() == "success":
            return True
        if str(payload.get("type", "")).casefold() == "error":
            if str(payload.get("code", "")) == "201":
                raise SmsProviderError("MSG91 rejected the verification request.")
            return False
        raise SmsProviderError("MSG91 returned an unrecognized OTP response.")

    def send(self, recipient: str, message: str) -> SendResult:
        payload = self._request(
            "POST",
            f"{MSG91_BASE_URL}/flow",
            body={
                "template_id": self.sms_template_id,
                "realTimeResponse": 1,
                "recipients": [
                    {"mobiles": recipient.lstrip("+"), "VAR1": message}
                ],
            },
        )
        if not self._is_success(payload):
            raise SmsProviderError("MSG91 rejected the SMS request.")
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        provider_id = (
            data.get("request_id")
            or data.get("message_uuid")
            or payload.get("request_id")
        )
        return SendResult(
            status="submitted",
            provider_id=str(provider_id) if provider_id else None,
        )


def get_provider(
    *, test_mode: bool, provider: str, credentials: dict[str, str]
) -> SmsProvider:
    if test_mode:
        return TestSmsProvider()
    if provider == "msg91":
        return Msg91SmsProvider(**credentials)
    raise SmsProviderError("Unsupported SMS provider.")

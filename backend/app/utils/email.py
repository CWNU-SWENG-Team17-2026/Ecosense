# utils/email.py
import logging

import httpx

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


def send_verification_email(to_email: str, code: str) -> bool:
    """Brevo API로 이메일 인증코드 발송. 실패 시 False."""
    if not settings.brevo_api_key:
        logger.warning(
            "[개발모드] BREVO_API_KEY 없음 — 이메일 미발송. 인증코드=%s → %s",
            code,
            to_email,
        )
        return False

    if not settings.brevo_sender_email or settings.brevo_sender_email == "noreply@ecosense.app":
        logger.warning(
            "BREVO_SENDER_EMAIL이 기본값이거나 비어 있음 (%s). Brevo에서 verified sender로 설정하세요.",
            settings.brevo_sender_email,
        )

    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": settings.brevo_api_key,
        "content-type": "application/json",
    }
    payload = {
        "sender": {"name": "EcoSense", "email": settings.brevo_sender_email},
        "to": [{"email": to_email}],
        "subject": "[EcoSense] 이메일 인증코드",
        "htmlContent": f"""
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
            <h2 style="color: #2e7d5e;">EcoSense 이메일 인증</h2>
            <p>아래 인증코드를 입력해주세요.</p>
            <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px;
                        background: #f0fdf4; padding: 20px; text-align: center;
                        border-radius: 8px; color: #2e7d5e;">
                {code}
            </div>
            <p style="color: #888; font-size: 12px; margin-top: 16px;">
                이 코드는 10분간 유효합니다.
            </p>
        </div>
        """,
    }

    try:
        response = httpx.post(url, json=payload, headers=headers, timeout=15.0)
        if response.status_code in (200, 201):
            logger.info("인증 메일 발송 성공 → %s", to_email)
            return True
        logger.error(
            "Brevo 발송 실패 status=%s body=%s sender=%s",
            response.status_code,
            response.text[:500],
            settings.brevo_sender_email,
        )
        return False
    except Exception as exc:
        logger.exception("Brevo API 호출 오류 → %s: %s", to_email, exc)
        return False

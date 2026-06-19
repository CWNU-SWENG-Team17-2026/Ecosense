# utils/email.py
import httpx
from app.config import get_settings

settings = get_settings()


def send_verification_email(to_email: str, code: str) -> bool:
    """Brevo API로 이메일 인증코드 발송"""
    if not settings.brevo_api_key:
        print(f"[개발모드] 인증코드: {code}")
        return True

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
        response = httpx.post(url, json=payload, headers=headers, timeout=10)
        return response.status_code in (200, 201)
    except Exception as e:
        print(f"이메일 발송 오류: {e}")
        return False

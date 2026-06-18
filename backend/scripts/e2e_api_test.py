"""Frontend-equivalent E2E API flow test (cookie-based auth)."""

from __future__ import annotations

import sys

import httpx

BASE = "http://127.0.0.1:8000/api"
ORIGIN = "http://127.0.0.1:5173"
EMAIL = "e2e@example.com"
PASSWORD = "E2ePass123!"


def main() -> int:
    failures: list[str] = []

    with httpx.Client(
        base_url=BASE,
        headers={"Origin": ORIGIN},
        timeout=10.0,
    ) as client:
        def check(name: str, fn) -> None:
            try:
                fn()
                print(f"[OK] {name}")
            except Exception as exc:  # noqa: BLE001
                failures.append(name)
                print(f"[FAIL] {name}: {exc}")

        def register_or_login() -> None:
            reg = client.post(
                "/auth/register",
                json={"email": EMAIL, "password": PASSWORD},
            )
            if reg.status_code not in (200, 400):
                reg.raise_for_status()

            login = client.post(
                "/auth/login",
                json={"email": EMAIL, "password": PASSWORD},
            )
            login.raise_for_status()
            cookies = login.cookies
            if "access_token" not in cookies:
                raise RuntimeError("access_token cookie missing")

        def me() -> None:
            res = client.get("/auth/me")
            res.raise_for_status()
            data = res.json()
            if data.get("email") != EMAIL:
                raise RuntimeError(f"unexpected user: {data}")

        def outdoor() -> None:
            res = client.get("/outdoor", params={"location": "경남 창원시"})
            res.raise_for_status()
            data = res.json()
            if "temperature" not in data:
                raise RuntimeError(f"invalid outdoor payload: {data}")

        def sync_flow() -> None:
            upload = client.post(
                "/sync/upload",
                json={
                    "sessions": [
                        {
                            "id": "e2e-session-001",
                            "type": "SLEEP",
                            "started_at": "2026-06-18T22:00:00Z",
                            "ended_at": "2026-06-18T23:00:00Z",
                        }
                    ],
                    "spikes": [
                        {
                            "session_id": "e2e-session-001",
                            "detected_at": "2026-06-18T22:30:00Z",
                            "db_level": 72.5,
                            "duration_sec": 8,
                        }
                    ],
                },
            )
            upload.raise_for_status()
            upload_data = upload.json()
            if upload_data.get("synced_sessions", 0) < 1:
                raise RuntimeError(upload.text)
            if upload_data.get("synced_spikes", 0) < 1:
                raise RuntimeError(f"synced_spikes=0: {upload.text}")

            download = client.get("/sync/download", params={"days": 30})
            download.raise_for_status()
            payload = download.json()
            if not payload.get("spikes"):
                raise RuntimeError("download returned no spikes")

        def report_flow() -> None:
            pdf = client.get("/report/download", params={"period": "weekly"})
            pdf.raise_for_status()
            if "pdf" not in pdf.headers.get("content-type", ""):
                raise RuntimeError(pdf.headers.get("content-type"))

            history = client.get("/report/history", params={"limit": 5})
            history.raise_for_status()
            if not isinstance(history.json(), list):
                raise RuntimeError(history.text)

        def refresh_and_logout() -> None:
            refresh = client.post("/auth/refresh")
            refresh.raise_for_status()

            logout = client.post("/auth/logout")
            logout.raise_for_status()

            denied = client.get("/auth/me")
            if denied.status_code != 401:
                raise RuntimeError("me should be 401 after logout")

        check("register/login (cookie)", register_or_login)
        check("GET /auth/me", me)
        check("GET /outdoor", outdoor)
        check("sync upload/download", sync_flow)
        check("report download/history", report_flow)
        check("refresh/logout", refresh_and_logout)

    if failures:
        print(f"\nFAILED: {', '.join(failures)}")
        return 1

    print("\nE2E API flow passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
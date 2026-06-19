"""Noto Sans KR 폰트를 backend/app/assets/fonts/ 에 다운로드합니다.

보고서 PDF의 matplotlib 그래프 한글 렌더링에 사용됩니다.
최초 1회 실행 후 생성된 .otf 파일을 git에 커밋하세요.

  python backend/scripts/download_korean_font.py
"""
from __future__ import annotations

import urllib.request
from pathlib import Path

FONT_URL = (
    "https://github.com/googlefonts/noto-cjk/raw/main/"
    "Sans/SubsetOTF/KR/NotoSansKR-Regular.otf"
)
OUT_DIR = Path(__file__).resolve().parent.parent / "app" / "assets" / "fonts"
OUT_FILE = OUT_DIR / "NotoSansKR-Regular.otf"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if OUT_FILE.exists() and OUT_FILE.stat().st_size > 100_000:
        print(f"이미 존재: {OUT_FILE}")
        return

    print(f"다운로드 중: {FONT_URL}")
    urllib.request.urlretrieve(FONT_URL, OUT_FILE)
    print(f"저장 완료: {OUT_FILE} ({OUT_FILE.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

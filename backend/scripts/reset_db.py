"""PostgreSQL 전체 테이블 삭제 후 재생성 (실데이터 없을 때만 사용).

Usage:
  cd backend
  python scripts/reset_db.py
"""

from __future__ import annotations

import sys

from app.database import engine, init_db
from app.utils.schema import drop_all_tables


def main() -> int:
    url = str(engine.url)
    if not url.startswith("postgresql"):
        print(f"PostgreSQL URL이 아닙니다: {url[:40]}...")
        print("Render DATABASE_URL을 설정한 뒤 실행하세요.")
        return 1

    confirm = input("모든 테이블을 삭제하고 재생성합니다. 계속? [y/N]: ")
    if confirm.strip().lower() != "y":
        print("취소됨")
        return 0

    drop_all_tables(engine)
    init_db()
    print("DB 재생성 완료")
    return 0


if __name__ == "__main__":
    sys.exit(main())

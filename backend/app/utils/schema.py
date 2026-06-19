"""SQLAlchemy 모델 외 raw SQL 테이블 (설문조사)."""

from sqlalchemy import text
from sqlalchemy.engine import Engine


def create_survey_tables(engine: Engine) -> None:
    if engine.dialect.name == "postgresql":
        ddl = """
        CREATE TABLE IF NOT EXISTS user_preferences (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            q1_age TEXT, q2_lifestyle TEXT, q3_interests TEXT,
            q4_important_factors TEXT, q5_env_impact TEXT, q6_check_frequency TEXT,
            q7_alert_needed TEXT, q8_needed_features TEXT, q9_skin_dryness TEXT,
            q10_respiratory TEXT, q11_sleep_impact TEXT, q12_noise_needed TEXT,
            q13_wanted_alerts TEXT, q14_user_types TEXT,
            q14a_reason TEXT, q14a_display TEXT, q14b_travel_info TEXT, q14b_gps TEXT,
            q14c_air_frequency TEXT, q14c_sensitive_factor TEXT, q14c_alert_type TEXT,
            q14d_skin_factor TEXT, q14d_uv_alert TEXT, q14d_skin_guide TEXT,
            q14e_sleep_factor TEXT, q14e_sleep_alert TEXT, q14e_sleep_feature TEXT
        );
        CREATE TABLE IF NOT EXISTS user_feedback (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            q15_opinion TEXT
        );
        """
    else:
        ddl = """
        CREATE TABLE IF NOT EXISTS user_preferences (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            q1_age TEXT, q2_lifestyle TEXT, q3_interests TEXT,
            q4_important_factors TEXT, q5_env_impact TEXT, q6_check_frequency TEXT,
            q7_alert_needed TEXT, q8_needed_features TEXT, q9_skin_dryness TEXT,
            q10_respiratory TEXT, q11_sleep_impact TEXT, q12_noise_needed TEXT,
            q13_wanted_alerts TEXT, q14_user_types TEXT,
            q14a_reason TEXT, q14a_display TEXT, q14b_travel_info TEXT, q14b_gps TEXT,
            q14c_air_frequency TEXT, q14c_sensitive_factor TEXT, q14c_alert_type TEXT,
            q14d_skin_factor TEXT, q14d_uv_alert TEXT, q14d_skin_guide TEXT,
            q14e_sleep_factor TEXT, q14e_sleep_alert TEXT, q14e_sleep_feature TEXT
        );
        CREATE TABLE IF NOT EXISTS user_feedback (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
            q15_opinion TEXT
        );
        """

    with engine.begin() as conn:
        for statement in ddl.strip().split(";"):
            stmt = statement.strip()
            if stmt:
                conn.execute(text(stmt))


def drop_all_tables(engine: Engine) -> None:
    """전체 테이블 삭제 (PostgreSQL). 실데이터 없을 때만 사용."""
    if not str(engine.url).startswith("postgresql"):
        raise RuntimeError("drop_all_tables는 PostgreSQL 전용입니다.")

    sql = """
    DROP TABLE IF EXISTS user_feedback CASCADE;
    DROP TABLE IF EXISTS user_preferences CASCADE;
    DROP TABLE IF EXISTS outdoor_data_cache CASCADE;
    DROP TABLE IF EXISTS report_histories CASCADE;
    DROP TABLE IF EXISTS spikes CASCADE;
    DROP TABLE IF EXISTS measurement_sessions CASCADE;
    DROP TABLE IF EXISTS users CASCADE;
    """
    with engine.begin() as conn:
        for statement in sql.strip().split(";"):
            stmt = statement.strip()
            if stmt:
                conn.execute(text(stmt))

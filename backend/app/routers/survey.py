# routers/survey.py
import json
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.survey import SurveyRequest, SurveyResponse

router = APIRouter(prefix="/survey", tags=["survey"])


@router.post("", response_model=SurveyResponse, status_code=status.HTTP_201_CREATED)
def submit_survey(
    body: SurveyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """설문조사 제출 - Q1~Q14 → user_preferences, Q15 → user_feedback"""

    existing = db.execute(
        text("SELECT id FROM user_preferences WHERE user_id = :uid"),
        {"uid": current_user.id}
    ).fetchone()

    pref_data = {
        "uid": current_user.id,
        "q1": body.q1_age,
        "q2": body.q2_lifestyle,
        "q3": json.dumps(body.q3_interests or [], ensure_ascii=False),
        "q4": json.dumps(body.q4_important_factors or [], ensure_ascii=False),
        "q5": body.q5_env_impact,
        "q6": body.q6_check_frequency,
        "q7": body.q7_alert_needed,
        "q8": json.dumps(body.q8_needed_features or [], ensure_ascii=False),
        "q9": body.q9_skin_dryness,
        "q10": body.q10_respiratory,
        "q11": body.q11_sleep_impact,
        "q12": body.q12_noise_needed,
        "q13": json.dumps(body.q13_wanted_alerts or [], ensure_ascii=False),
        "q14": json.dumps(body.q14_user_types or [], ensure_ascii=False),
        "q14a_reason": body.q14a_reason,
        "q14a_display": body.q14a_display,
        "q14b_travel_info": body.q14b_travel_info,
        "q14b_gps": body.q14b_gps,
        "q14c_air_frequency": body.q14c_air_frequency,
        "q14c_sensitive_factor": body.q14c_sensitive_factor,
        "q14c_alert_type": body.q14c_alert_type,
        "q14d_skin_factor": body.q14d_skin_factor,
        "q14d_uv_alert": body.q14d_uv_alert,
        "q14d_skin_guide": body.q14d_skin_guide,
        "q14e_sleep_factor": body.q14e_sleep_factor,
        "q14e_sleep_alert": body.q14e_sleep_alert,
        "q14e_sleep_feature": body.q14e_sleep_feature,
    }

    if existing:
        db.execute(text("""
            UPDATE user_preferences SET
                q1_age=:q1, q2_lifestyle=:q2, q3_interests=:q3,
                q4_important_factors=:q4, q5_env_impact=:q5,
                q6_check_frequency=:q6, q7_alert_needed=:q7,
                q8_needed_features=:q8, q9_skin_dryness=:q9,
                q10_respiratory=:q10, q11_sleep_impact=:q11,
                q12_noise_needed=:q12, q13_wanted_alerts=:q13,
                q14_user_types=:q14,
                q14a_reason=:q14a_reason, q14a_display=:q14a_display,
                q14b_travel_info=:q14b_travel_info, q14b_gps=:q14b_gps,
                q14c_air_frequency=:q14c_air_frequency,
                q14c_sensitive_factor=:q14c_sensitive_factor,
                q14c_alert_type=:q14c_alert_type,
                q14d_skin_factor=:q14d_skin_factor,
                q14d_uv_alert=:q14d_uv_alert,
                q14d_skin_guide=:q14d_skin_guide,
                q14e_sleep_factor=:q14e_sleep_factor,
                q14e_sleep_alert=:q14e_sleep_alert,
                q14e_sleep_feature=:q14e_sleep_feature
            WHERE user_id=:uid
        """), pref_data)
    else:
        db.execute(text("""
            INSERT INTO user_preferences (
                user_id, q1_age, q2_lifestyle, q3_interests,
                q4_important_factors, q5_env_impact, q6_check_frequency,
                q7_alert_needed, q8_needed_features, q9_skin_dryness,
                q10_respiratory, q11_sleep_impact, q12_noise_needed,
                q13_wanted_alerts, q14_user_types,
                q14a_reason, q14a_display, q14b_travel_info, q14b_gps,
                q14c_air_frequency, q14c_sensitive_factor, q14c_alert_type,
                q14d_skin_factor, q14d_uv_alert, q14d_skin_guide,
                q14e_sleep_factor, q14e_sleep_alert, q14e_sleep_feature
            ) VALUES (
                :uid, :q1, :q2, :q3, :q4, :q5, :q6, :q7, :q8, :q9,
                :q10, :q11, :q12, :q13, :q14,
                :q14a_reason, :q14a_display, :q14b_travel_info, :q14b_gps,
                :q14c_air_frequency, :q14c_sensitive_factor, :q14c_alert_type,
                :q14d_skin_factor, :q14d_uv_alert, :q14d_skin_guide,
                :q14e_sleep_factor, :q14e_sleep_alert, :q14e_sleep_feature
            )
        """), pref_data)

    if body.q15_opinion is not None:
        existing_fb = db.execute(
            text("SELECT id FROM user_feedback WHERE user_id = :uid"),
            {"uid": current_user.id}
        ).fetchone()
        if existing_fb:
            db.execute(
                text("UPDATE user_feedback SET q15_opinion=:opinion WHERE user_id=:uid"),
                {"opinion": body.q15_opinion, "uid": current_user.id}
            )
        else:
            db.execute(
                text("INSERT INTO user_feedback (user_id, q15_opinion) VALUES (:uid, :opinion)"),
                {"uid": current_user.id, "opinion": body.q15_opinion}
            )

    db.commit()
    return {"message": "설문조사가 저장되었습니다."}


@router.get("/me", response_model=dict)
def get_my_survey(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pref = db.execute(
        text("SELECT * FROM user_preferences WHERE user_id = :uid"),
        {"uid": current_user.id}
    ).fetchone()

    feedback = db.execute(
        text("SELECT q15_opinion FROM user_feedback WHERE user_id = :uid"),
        {"uid": current_user.id}
    ).fetchone()

    if not pref:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="설문조사 결과가 없습니다."
        )

    result = dict(pref._mapping)
    result["q15_opinion"] = feedback.q15_opinion if feedback else None
    return result

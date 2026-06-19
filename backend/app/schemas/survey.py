# schemas/survey.py
from pydantic import BaseModel
from typing import Optional


class SurveyRequest(BaseModel):
    q1_age: Optional[str] = None
    q2_lifestyle: Optional[str] = None
    q3_interests: Optional[list[str]] = None
    q4_important_factors: Optional[list[str]] = None
    q5_env_impact: Optional[str] = None
    q6_check_frequency: Optional[str] = None
    q7_alert_needed: Optional[str] = None
    q8_needed_features: Optional[list[str]] = None
    q9_skin_dryness: Optional[str] = None
    q10_respiratory: Optional[str] = None
    q11_sleep_impact: Optional[str] = None
    q12_noise_needed: Optional[str] = None
    q13_wanted_alerts: Optional[list[str]] = None
    q14_user_types: Optional[list[str]] = None
    q14a_reason: Optional[str] = None
    q14a_display: Optional[str] = None
    q14b_travel_info: Optional[str] = None
    q14b_gps: Optional[str] = None
    q14c_air_frequency: Optional[str] = None
    q14c_sensitive_factor: Optional[str] = None
    q14c_alert_type: Optional[str] = None
    q14d_skin_factor: Optional[str] = None
    q14d_uv_alert: Optional[str] = None
    q14d_skin_guide: Optional[str] = None
    q14e_sleep_factor: Optional[str] = None
    q14e_sleep_alert: Optional[str] = None
    q14e_sleep_feature: Optional[str] = None
    q15_opinion: Optional[str] = None


class SurveyResponse(BaseModel):
    message: str

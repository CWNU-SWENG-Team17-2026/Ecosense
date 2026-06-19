import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';

// ─── 선택지 상수 ────────────────────────────────────────────
const OPTIONS = {
  q1: ['10대', '20대', '30대', '40대 이상'],
  q2: ['학생', '직장인', '프리랜서', '여행/관광 중', '기타'],
  q3: ['피부 관리', '호흡기 건강', '수면 환경', '여행/외부 활동', '실내 쾌적함 관리', '에너지 절약', '기타'],
  q4: ['온도', '습도', '미세먼지(PM10)', '초미세먼지(PM2.5)', '공기질(AQI)', '자외선(UV)', '소음', '강수량'],
  q5: ['매우 그렇다', '그렇다', '보통이다', '아니다'],
  q6: ['하루 여러 번', '하루 1번', '필요할 때만', '거의 확인하지 않음'],
  q7: ['매우 필요', '필요', '보통', '불필요'],
  q8: ['실시간 온습도 확인', '공기질 및 미세먼지 확인', '자외선 위험 알림', '소음 측정 및 수면 분석', 'GPS 기반 지역 환경 정보', '환경 변화 그래프', '사용자 맞춤 건강 가이드', 'PDF 환경 리포트 생성'],
  q9: ['자주 있다', '가끔 있다', '거의 없다'],
  q10: ['자주 있다', '가끔 있다', '거의 없다'],
  q11: ['매우 그렇다', '그렇다', '보통이다', '아니다'],
  q12: ['매우 필요', '필요', '보통', '불필요'],
  q13: ['습도 감소 시 보습 안내', '미세먼지 증가 시 마스크/환기 안내', '자외선 위험 알림', '소음 증가 시 수면 환경 안내', '공기질 악화 시 환기 권장', '온도 변화 알림'],
  q14: ['일반 사용자', '관광객/여행 사용자', '기관지 질환 사용자', '피부 민감 사용자', '수면 환경 민감 사용자'],
  q14a_reason: ['외출 준비', '건강 관리', '생활 편의', '날씨 확인'],
  q14a_display: ['그래프', '숫자 데이터', '색상 표시', '요약 메시지'],
  q14b_travel_info: ['기온', '자외선', '공기질', '강수량'],
  q14b_gps: ['매우 필요', '필요', '보통', '불필요'],
  q14c_air_frequency: ['하루 여러 번', '하루 1번', '필요할 때만'],
  q14c_sensitive_factor: ['미세먼지(PM10)', '초미세먼지(PM2.5)', '황사', '공기질(AQI)'],
  q14c_alert_type: ['마스크 착용 권장', '환기 제한 안내', '공기청정기 사용 권장', '외출 자제 안내'],
  q14d_skin_factor: ['습도', '자외선', '온도', '미세먼지'],
  q14d_uv_alert: ['매우 필요', '필요', '보통', '불필요'],
  q14d_skin_guide: ['보습 권장', '자외선 차단 안내', '실내 습도 유지 안내', '공기질 관리 안내'],
  q14e_sleep_factor: ['온도', '습도', '소음', '공기질'],
  q14e_sleep_alert: ['매우 필요', '필요', '보통', '불필요'],
  q14e_sleep_feature: ['수면 시간대 소음 측정', '수면 환경 점수 제공', '취침 전 환경 분석', '수면 시간대 위험 알림'],
};

// ─── 스타일 ──────────────────────────────────────────────────
const S = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(160deg, #f0faf4 0%, #e8f4fd 100%)',
    padding: '40px 20px 80px',
    fontFamily: "'Pretendard', 'Noto Sans KR', sans-serif",
  },
  card: {
    maxWidth: '720px',
    margin: '0 auto',
    background: '#fff',
    borderRadius: '20px',
    boxShadow: '0 4px 40px rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  header: {
    background: 'linear-gradient(135deg, #2e7d5e 0%, #1a5c8a 100%)',
    padding: '36px 40px',
    color: '#fff',
  },
  headerTitle: {
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '8px',
  },
  headerSub: {
    fontSize: '14px',
    opacity: 0.85,
    lineHeight: 1.6,
  },
  body: {
    padding: '32px 40px',
  },
  section: {
    marginBottom: '40px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 700,
    color: '#1a5c8a',
    borderBottom: '2px solid #e8f4fd',
    paddingBottom: '10px',
    marginBottom: '20px',
  },
  question: {
    marginBottom: '28px',
  },
  qLabel: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1e293b',
    marginBottom: '12px',
    display: 'block',
  },
  qSub: {
    fontSize: '12px',
    color: '#64748b',
    marginLeft: '4px',
    fontWeight: 400,
  },
  optionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
},
  optionItem: (selected) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '10px 14px',
    borderRadius: '10px',
    border: `2px solid ${selected ? '#2e7d5e' : '#e2e8f0'}`,
    background: selected ? '#f0faf4' : '#fafafa',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    fontSize: '14px',
    color: selected ? '#2e7d5e' : '#475569',
    fontWeight: selected ? 600 : 400,
  }),
  radio: (selected) => ({
    width: '18px',
    height: '18px',
    borderRadius: '50%',
    border: `2px solid ${selected ? '#2e7d5e' : '#cbd5e1'}`,
    background: selected ? '#2e7d5e' : '#fff',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  radioInner: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: '#fff',
  },
  checkbox: (selected) => ({
    width: '18px',
    height: '18px',
    borderRadius: '5px',
    border: `2px solid ${selected ? '#2e7d5e' : '#cbd5e1'}`,
    background: selected ? '#2e7d5e' : '#fff',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    color: '#fff',
  }),
  accordion: {
    marginTop: '16px',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  accordionHeader: {
    background: '#f8fafc',
    padding: '14px 18px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#1a5c8a',
    borderBottom: '1px solid #e2e8f0',
  },
  accordionBody: {
    padding: '16px 18px',
  },
  textarea: {
    width: '100%',
    minHeight: '120px',
    padding: '14px',
    borderRadius: '10px',
    border: '2px solid #e2e8f0',
    fontSize: '14px',
    color: '#334155',
    resize: 'vertical',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    lineHeight: 1.6,
  },
  submitBtn: {
    width: '100%',
    padding: '16px',
    background: 'linear-gradient(135deg, #2e7d5e 0%, #1a5c8a 100%)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    fontSize: '16px',
    fontWeight: 700,
    cursor: 'pointer',
    marginTop: '8px',
    transition: 'opacity 0.15s',
  },
  skipBtn: {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    color: '#94a3b8',
    border: 'none',
    fontSize: '14px',
    cursor: 'pointer',
    marginTop: '8px',
  },
  progress: {
    height: '4px',
    background: '#e2e8f0',
    borderRadius: '2px',
    marginBottom: '32px',
    overflow: 'hidden',
  },
  progressBar: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    background: 'linear-gradient(90deg, #2e7d5e, #1a5c8a)',
    borderRadius: '2px',
    transition: 'width 0.3s ease',
  }),
};

// ─── 라디오 옵션 컴포넌트 ─────────────────────────────────────
function Radio({ options, value, onChange }) {
  return (
    <div style={S.optionGrid}>
      {options.map(opt => {
        const sel = value === opt;
        return (
          <div key={opt} style={S.optionItem(sel)} onClick={() => onChange(opt)}>
            <div style={S.radio(sel)}>{sel && <div style={S.radioInner} />}</div>
            {opt}
          </div>
        );
      })}
    </div>
  );
}

// ─── 체크박스 옵션 컴포넌트 ──────────────────────────────────
function Checkbox({ options, value = [], onChange, max = null }) {
  const toggle = (opt) => {
    if (value.includes(opt)) {
      onChange(value.filter(v => v !== opt));
    } else {
      if (max && value.length >= max) return;
      onChange([...value, opt]);
    }
  };
  return (
    <div style={S.optionGrid}>
      {options.map(opt => {
        const sel = value.includes(opt);
        const disabled = max && value.length >= max && !sel;
        return (
          <div
            key={opt}
            style={{ ...S.optionItem(sel), opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
            onClick={() => !disabled && toggle(opt)}
          >
            <div style={S.checkbox(sel)}>{sel && '✓'}</div>
            {opt}
          </div>
        );
      })}
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────
export default function SurveyPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);

  const [form, setForm] = useState({
    q1_age: '', q2_lifestyle: '',
    q3_interests: [], q4_important_factors: [],
    q5_env_impact: '', q6_check_frequency: '', q7_alert_needed: '',
    q8_needed_features: [],
    q9_skin_dryness: '', q10_respiratory: '', q11_sleep_impact: '', q12_noise_needed: '',
    q13_wanted_alerts: [],
    q14_user_types: [],
    q14a_reason: '', q14a_display: '',
    q14b_travel_info: '', q14b_gps: '',
    q14c_air_frequency: '', q14c_sensitive_factor: '', q14c_alert_type: '',
    q14d_skin_factor: '', q14d_uv_alert: '', q14d_skin_guide: '',
    q14e_sleep_factor: '', q14e_sleep_alert: '', q14e_sleep_feature: '',
    q15_opinion: '',
  });

  const set = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  // 진행률 계산
  const answered = [
    form.q1_age, form.q2_lifestyle, form.q5_env_impact,
    form.q6_check_frequency, form.q7_alert_needed, form.q9_skin_dryness,
    form.q10_respiratory, form.q11_sleep_impact, form.q12_noise_needed,
  ].filter(Boolean).length + (form.q3_interests.length > 0 ? 1 : 0) + (form.q4_important_factors.length > 0 ? 1 : 0) + (form.q14_user_types.length > 0 ? 1 : 0);
  const progress = Math.round((answered / 12) * 100);

  const handleSubmit = async () => {
    try {
      setIsLoading(true);
      await api.post('/survey', form);
      alert('설문조사가 완료되었습니다! 감사합니다 😊');
      navigate('/main');
    } catch (err) {
      alert('설문 제출에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const types = form.q14_user_types;

  return (
    <div style={S.page}>
      <div style={S.card}>
        {/* 헤더 */}
        <div style={S.header}>
          <div style={S.headerTitle}>🌿 EcoSense 사용자 설문조사</div>
          <div style={S.headerSub}>
            응답하신 내용을 바탕으로 맞춤형 환경 정보와 건강 가이드를 제공해드립니다.<br />
            모든 항목은 선택 사항입니다.
          </div>
        </div>

        <div style={S.body}>
          {/* 진행률 */}
          <div style={S.progress}>
            <div style={S.progressBar(progress)} />
          </div>

          {/* ── 섹션 1: 기본 정보 ── */}
          <div style={S.section}>
            <div style={S.sectionTitle}>1. 기본 사용자 정보</div>

            <div style={S.question}>
              <span style={S.qLabel}>Q1. 연령대를 선택해주세요.</span>
              <Radio options={OPTIONS.q1} value={form.q1_age} onChange={v => set('q1_age', v)} />
            </div>

            <div style={S.question}>
              <span style={S.qLabel}>Q2. 현재 생활 유형을 선택해주세요.</span>
              <Radio options={OPTIONS.q2} value={form.q2_lifestyle} onChange={v => set('q2_lifestyle', v)} />
            </div>

            <div style={S.question}>
              <span style={S.qLabel}>Q3. 평소 관심 있는 분야를 선택해주세요. <span style={S.qSub}>(중복 선택 가능)</span></span>
              <Checkbox options={OPTIONS.q3} value={form.q3_interests} onChange={v => set('q3_interests', v)} />
            </div>
          </div>

          {/* ── 섹션 2: 환경 정보 이용 패턴 ── */}
          <div style={S.section}>
            <div style={S.sectionTitle}>2. 환경 정보 이용 패턴</div>

            <div style={S.question}>
              <span style={S.qLabel}>Q4. 실내 환경에서 가장 중요한 요소는? <span style={S.qSub}>(최대 3개 선택)</span></span>
              <Checkbox options={OPTIONS.q4} value={form.q4_important_factors} onChange={v => set('q4_important_factors', v)} max={3} />
            </div>

            <div style={S.question}>
              <span style={S.qLabel}>Q5. 환경 상태가 일상생활에 영향을 준다고 생각하시나요?</span>
              <Radio options={OPTIONS.q5} value={form.q5_env_impact} onChange={v => set('q5_env_impact', v)} />
            </div>

            <div style={S.question}>
              <span style={S.qLabel}>Q6. 평소 환경 정보를 얼마나 자주 확인하시나요?</span>
              <Radio options={OPTIONS.q6} value={form.q6_check_frequency} onChange={v => set('q6_check_frequency', v)} />
            </div>

            <div style={S.question}>
              <span style={S.qLabel}>Q7. 실시간 환경 알림 기능이 필요하다고 생각하시나요?</span>
              <Radio options={OPTIONS.q7} value={form.q7_alert_needed} onChange={v => set('q7_alert_needed', v)} />
            </div>

            <div style={S.question}>
              <span style={S.qLabel}>Q8. 가장 필요하다고 생각하는 기능을 선택해주세요. <span style={S.qSub}>(중복 선택 가능)</span></span>
              <Checkbox options={OPTIONS.q8} value={form.q8_needed_features} onChange={v => set('q8_needed_features', v)} />
            </div>
          </div>

          {/* ── 섹션 3: 건강 및 생활 환경 ── */}
          <div style={S.section}>
            <div style={S.sectionTitle}>3. 건강 및 생활 환경</div>

            <div style={S.question}>
              <span style={S.qLabel}>Q9. 건조한 환경에서 피부 불편함을 느낀 적이 있나요?</span>
              <Radio options={OPTIONS.q9} value={form.q9_skin_dryness} onChange={v => set('q9_skin_dryness', v)} />
            </div>

            <div style={S.question}>
              <span style={S.qLabel}>Q10. 미세먼지나 공기질로 인해 호흡기 불편함을 느낀 적이 있나요?</span>
              <Radio options={OPTIONS.q10} value={form.q10_respiratory} onChange={v => set('q10_respiratory', v)} />
            </div>

            <div style={S.question}>
              <span style={S.qLabel}>Q11. 소음이나 온습도가 수면의 질에 영향을 준다고 생각하시나요?</span>
              <Radio options={OPTIONS.q11} value={form.q11_sleep_impact} onChange={v => set('q11_sleep_impact', v)} />
            </div>

            <div style={S.question}>
              <span style={S.qLabel}>Q12. 실내 소음 측정 기능이 필요하다고 생각하시나요?</span>
              <Radio options={OPTIONS.q12} value={form.q12_noise_needed} onChange={v => set('q12_noise_needed', v)} />
            </div>

            <div style={S.question}>
              <span style={S.qLabel}>Q13. 받고 싶은 알림을 선택해주세요. <span style={S.qSub}>(중복 선택 가능)</span></span>
              <Checkbox options={OPTIONS.q13} value={form.q13_wanted_alerts} onChange={v => set('q13_wanted_alerts', v)} />
            </div>
          </div>

          {/* ── 섹션 4: 사용자 유형 ── */}
          <div style={S.section}>
            <div style={S.sectionTitle}>4. 사용자 유형 분류</div>

            <div style={S.question}>
              <span style={S.qLabel}>Q14. 본인과 가장 가까운 유형을 선택해주세요. <span style={S.qSub}>(중복 선택 가능)</span></span>
              <Checkbox options={OPTIONS.q14} value={form.q14_user_types} onChange={v => set('q14_user_types', v)} />
            </div>

            {/* A. 일반 사용자 */}
            {types.includes('일반 사용자') && (
              <div style={S.accordion}>
                <div style={S.accordionHeader}>🙋 일반 사용자 추가 질문</div>
                <div style={S.accordionBody}>
                  <div style={S.question}>
                    <span style={S.qLabel}>A-1. 환경 정보를 확인하는 가장 큰 이유는?</span>
                    <Radio options={OPTIONS.q14a_reason} value={form.q14a_reason} onChange={v => set('q14a_reason', v)} />
                  </div>
                  <div style={{ ...S.question, marginBottom: 0 }}>
                    <span style={S.qLabel}>A-2. 가장 선호하는 정보 표시 방식은?</span>
                    <Radio options={OPTIONS.q14a_display} value={form.q14a_display} onChange={v => set('q14a_display', v)} />
                  </div>
                </div>
              </div>
            )}

            {/* B. 관광객/여행 */}
            {types.includes('관광객/여행 사용자') && (
              <div style={{ ...S.accordion, marginTop: '12px' }}>
                <div style={S.accordionHeader}>✈️ 관광객/여행 사용자 추가 질문</div>
                <div style={S.accordionBody}>
                  <div style={S.question}>
                    <span style={S.qLabel}>B-1. 여행 중 가장 중요한 환경 정보는?</span>
                    <Radio options={OPTIONS.q14b_travel_info} value={form.q14b_travel_info} onChange={v => set('q14b_travel_info', v)} />
                  </div>
                  <div style={{ ...S.question, marginBottom: 0 }}>
                    <span style={S.qLabel}>B-2. GPS 기반 지역 환경 정보 기능이 필요한가요?</span>
                    <Radio options={OPTIONS.q14b_gps} value={form.q14b_gps} onChange={v => set('q14b_gps', v)} />
                  </div>
                </div>
              </div>
            )}

            {/* C. 기관지 질환 */}
            {types.includes('기관지 질환 사용자') && (
              <div style={{ ...S.accordion, marginTop: '12px' }}>
                <div style={S.accordionHeader}>🫁 기관지 질환 사용자 추가 질문</div>
                <div style={S.accordionBody}>
                  <div style={S.question}>
                    <span style={S.qLabel}>C-1. 공기질 정보를 얼마나 자주 확인하시나요?</span>
                    <Radio options={OPTIONS.q14c_air_frequency} value={form.q14c_air_frequency} onChange={v => set('q14c_air_frequency', v)} />
                  </div>
                  <div style={S.question}>
                    <span style={S.qLabel}>C-2. 가장 민감하게 반응하는 환경 요소는?</span>
                    <Radio options={OPTIONS.q14c_sensitive_factor} value={form.q14c_sensitive_factor} onChange={v => set('q14c_sensitive_factor', v)} />
                  </div>
                  <div style={{ ...S.question, marginBottom: 0 }}>
                    <span style={S.qLabel}>C-3. 원하는 공기질 알림 기능은?</span>
                    <Radio options={OPTIONS.q14c_alert_type} value={form.q14c_alert_type} onChange={v => set('q14c_alert_type', v)} />
                  </div>
                </div>
              </div>
            )}

            {/* D. 피부 민감 */}
            {types.includes('피부 민감 사용자') && (
              <div style={{ ...S.accordion, marginTop: '12px' }}>
                <div style={S.accordionHeader}>🧴 피부 민감 사용자 추가 질문</div>
                <div style={S.accordionBody}>
                  <div style={S.question}>
                    <span style={S.qLabel}>D-1. 피부 상태에 가장 영향을 주는 요소는?</span>
                    <Radio options={OPTIONS.q14d_skin_factor} value={form.q14d_skin_factor} onChange={v => set('q14d_skin_factor', v)} />
                  </div>
                  <div style={S.question}>
                    <span style={S.qLabel}>D-2. 자외선 위험 알림 기능이 필요한가요?</span>
                    <Radio options={OPTIONS.q14d_uv_alert} value={form.q14d_uv_alert} onChange={v => set('q14d_uv_alert', v)} />
                  </div>
                  <div style={{ ...S.question, marginBottom: 0 }}>
                    <span style={S.qLabel}>D-3. 가장 받고 싶은 피부 관련 안내는?</span>
                    <Radio options={OPTIONS.q14d_skin_guide} value={form.q14d_skin_guide} onChange={v => set('q14d_skin_guide', v)} />
                  </div>
                </div>
              </div>
            )}

            {/* E. 수면 환경 민감 */}
            {types.includes('수면 환경 민감 사용자') && (
              <div style={{ ...S.accordion, marginTop: '12px' }}>
                <div style={S.accordionHeader}>🌙 수면 환경 민감 사용자 추가 질문</div>
                <div style={S.accordionBody}>
                  <div style={S.question}>
                    <span style={S.qLabel}>E-1. 수면 환경에 가장 영향을 주는 요소는?</span>
                    <Radio options={OPTIONS.q14e_sleep_factor} value={form.q14e_sleep_factor} onChange={v => set('q14e_sleep_factor', v)} />
                  </div>
                  <div style={S.question}>
                    <span style={S.qLabel}>E-2. 취침 시간대 환경 알림 기능이 필요한가요?</span>
                    <Radio options={OPTIONS.q14e_sleep_alert} value={form.q14e_sleep_alert} onChange={v => set('q14e_sleep_alert', v)} />
                  </div>
                  <div style={{ ...S.question, marginBottom: 0 }}>
                    <span style={S.qLabel}>E-3. 원하는 수면 환경 기능은?</span>
                    <Radio options={OPTIONS.q14e_sleep_feature} value={form.q14e_sleep_feature} onChange={v => set('q14e_sleep_feature', v)} />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* ── 섹션 5: 자유 의견 ── */}
          <div style={S.section}>
            <div style={S.sectionTitle}>5. 자유 의견</div>
            <div style={S.question}>
              <span style={S.qLabel}>Q15. 추가되었으면 하는 기능이나 의견을 자유롭게 작성해주세요. <span style={S.qSub}>(선택)</span></span>
              <textarea
                style={S.textarea}
                placeholder="의견을 입력해주세요..."
                value={form.q15_opinion}
                onChange={e => set('q15_opinion', e.target.value)}
              />
            </div>
          </div>

          {/* 제출 버튼 */}
          <button
            style={{ ...S.submitBtn, opacity: isLoading ? 0.7 : 1 }}
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? '제출 중...' : '✅ 설문조사 제출하기'}
          </button>
          <button style={S.skipBtn} onClick={() => navigate('/main')}>
            건너뛰기 (나중에 하기)
          </button>
        </div>
      </div>
    </div>
  );
}

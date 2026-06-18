/**
 * EcoSense Domain Types
 * 프로젝트 전반에서 사용하는 핵심 도메인 타입 정의
 */

// 세션 타입 (실외 / 실내 / 수면)
export type SessionType = 'OUTDOOR' | 'INDOOR' | 'SLEEP';

// AQI 등급 (한국 에어코리아 기준)
export type AqiGrade = 'good' | 'moderate' | 'bad' | 'very_bad';

// 사용자 정보
export interface User {
  id: string;
  email: string;
  created_at: string;
  // 필요시 추가: name, profile_image 등
}

// 측정 세션 (마스터)
export interface Session {
  id: string;
  type: SessionType;
  started_at: string;      // ISO 8601
  ended_at?: string;
  spike_count?: number;    // 수면 모드에서만 사용
}

// 스파이크 (소음 이벤트) - 메타데이터
export interface Spike {
  id: string;
  session_id: string;      // IndexedDB 연동 핵심
  detected_at: string;     // ISO 8601
  db_level: number;        // dBFS
  duration_sec: number;
}

/** IndexedDB에 실제 저장되는 레코드 (Blob 포함) */
export interface SpikeRecord extends Spike {
  blob: Blob;              // 실제 오디오 녹음 데이터
  expires_at: number;      // Unix timestamp (30일 후 삭제용)
}

// 실외 환경 데이터 (기상청 + AQI)
export interface OutdoorData {
  location: string;
  temperature: number;
  humidity: number;
  rainfall?: number;
  aqi: number;
  aqi_grade: AqiGrade;
  pm25: number;
  pm10?: number;
  uv_index?: number;
  weather_description: string;
  cached: boolean;
  is_mock?: boolean;
  last_updated: string;    // ISO 8601
}

// 보고서 이력
export interface ReportHistory {
  id: string;
  period: 'weekly' | 'monthly';
  created_at: string;
  summary_text?: string;
  // 추후 PDF URL 등 추가 가능
}

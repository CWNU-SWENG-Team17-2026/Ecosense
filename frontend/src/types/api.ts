/**
 * EcoSense API Types
 * 백엔드와 주고받는 Request / Response 타입 (v1.0)
 */

import type { SessionType, Spike, AqiGrade, ReportHistory } from './domain';

// 공통 응답 래퍼
export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  errorCode?: string;
  timestamp: string;
}

// ==================== Sync ====================
export interface SyncUploadRequest {
  sessions: {
    id: string;
    type: SessionType;
    started_at: string;
    ended_at?: string;
  }[];
  spikes: {
    session_id: string;
    detected_at: string;
    db_level: number;
    duration_sec: number;
  }[];
}

export interface SyncUploadResponse {
  synced_sessions: number;
  synced_spikes: number;
  failed_session_ids?: string[];
}

// ==================== Sessions ====================
export interface SessionListResponse {
  sessions: {
    id: string;
    type: SessionType;
    started_at: string;
    ended_at?: string;
    spike_count: number;
  }[];
  total: number;
  has_more: boolean;
}

export interface SessionDetailResponse {
  id: string;
  type: SessionType;
  started_at: string;
  ended_at?: string;
  spike_summary: {
    count: number;
    avg_db_level?: number;
    max_db_level?: number;
  };
}

export interface SessionSpikesResponse {
  spikes: Spike[];
}

// ==================== Spikes ====================
export interface CreateSpikeRequest {
  detected_at: string;
  db_level: number;
  duration_sec: number;
}

export interface CreateSpikeResponse {
  spike_id: string;
}

// ==================== Outdoor ====================
export interface OutdoorResponse {
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
  last_updated: string;
}

export interface OutdoorHistoryResponse {
  records: OutdoorResponse[];
}

// ==================== Reports ====================
export interface ReportHistoryItem {
  id: string;
  period: 'weekly' | 'monthly';
  created_at: string;
  summary_text?: string;
}

// 레거시 alias (ReportsPage 호환)
export interface ReportHistoryResponse {
  history: ReportHistory[];
}


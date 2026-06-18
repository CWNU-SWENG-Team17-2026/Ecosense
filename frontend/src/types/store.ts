/**
 * EcoSense Zustand Store Types
 * 각 스토어의 State + Action 인터페이스
 */

import type { User, OutdoorData, ReportHistory, Spike } from './domain';

// Auth
export interface AuthState {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
}

// Outdoor (실외 대시보드)
export interface OutdoorState {
  data: OutdoorData | null;
  lastUpdated: string | null;
  isLoading: boolean;
  isCached: boolean;
  error: string | null;
}

// Sensor (실내 BLE 센서 - LYWSD03MMC)
export interface SensorState {
  temperature: number;
  humidity: number;
  battery: number;
  connected: boolean;
  lastUpdated: string | null;
  isConnecting: boolean;
  error: string | null;
}

// Noise / Sleep (소음 측정 + 스파이크)
export interface NoiseState {
  currentDb: number;
  backgroundDb: number;
  spikes: Spike[];
  isMeasuring: boolean;
  sessionId: string | null;
  isSpiking: boolean;
  sessionStartTime: string | null;
}

// Report
export interface ReportState {
  history: ReportHistory[];
  isLoading: boolean;
  error: string | null;
}

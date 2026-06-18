/**
 * useSensorStore
 * 실내 BLE 센서 (LYWSD03MMC) 데이터 상태 관리
 */
import { create } from 'zustand';
import type { SensorState } from '../types/store';

interface SensorStore extends SensorState {
  setIndoorData: (data: { temperature: number; humidity: number; battery: number }) => void;
  setConnected: (connected: boolean) => void;
  setConnecting: (connecting: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

const initialState: SensorState = {
  temperature: 0,
  humidity: 0,
  battery: 0,
  connected: false,
  lastUpdated: null,
  isConnecting: false,
  error: null,
};

export const useSensorStore = create<SensorStore>((set) => ({
  ...initialState,

  setIndoorData: ({ temperature, humidity, battery }) =>
    set({
      temperature,
      humidity,
      battery,
      lastUpdated: new Date().toISOString(),
    }),

  setConnected: (connected) => set({ connected }),

  setConnecting: (isConnecting) => set({ isConnecting }),

  setError: (error) => set({ error }),

  reset: () => set(initialState),
}));

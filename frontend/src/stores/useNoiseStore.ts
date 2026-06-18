import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { Spike, SessionType } from '../types/domain';
import type { NoiseState } from '../types/store';

export type NoiseMode = 'normal' | 'sleep';

interface NoiseStore extends NoiseState {
  mode: NoiseMode;
  history: number[];
  setMode: (mode: NoiseMode) => void;
  setCurrentDb: (db: number) => void;
  setBackgroundDb: (db: number) => void;
  addSpike: (spike: Spike) => void;
  setSessionId: (id: string | null) => void;
  setIsSpiking: (isSpiking: boolean) => void;
  setIsMeasuring: (isMeasuring: boolean) => void;
  startNewSession: (type: SessionType) => string;
  endCurrentSession: () => void;
  clearCurrentSpikes: () => void;
  clearSpikes: () => void;
}

const normalizeChartDb = (db: number) =>
  isFinite(db) ? Math.max(20, Math.min(100, db + 100)) : null;

export const useNoiseStore = create<NoiseStore>()(
  persist(
    (set) => ({
      mode: 'sleep',
      currentDb: -Infinity,
      backgroundDb: -60,
      spikes: [],
      history: [],
      isMeasuring: false,
      sessionId: null,
      isSpiking: false,
      sessionStartTime: null,
      setMode: (mode) => set({ mode }),
      setCurrentDb: (db) =>
        set((state) => {
          const chartDb = normalizeChartDb(db);
          return {
            currentDb: db,
            history:
              chartDb !== null
                ? [...state.history, chartDb].slice(-150)
                : state.history,
          };
        }),
      setBackgroundDb: (db) => set({ backgroundDb: db }),
      addSpike: (spike) =>
        set((state) => ({ spikes: [...state.spikes, spike] })),
      setSessionId: (id) => set({ sessionId: id }),
      setIsSpiking: (isSpiking) => set({ isSpiking }),
      setIsMeasuring: (isMeasuring) => set({ isMeasuring }),
      startNewSession: (_type: SessionType) => {
        const id = crypto.randomUUID();
        const startTime = new Date().toISOString();
        set({
          sessionId: id,
          sessionStartTime: startTime,
          spikes: [],
          history: [],
          isSpiking: false,
          currentDb: -Infinity,
        });
        return id;
      },
      endCurrentSession: () => {
        set({
          sessionId: null,
          sessionStartTime: null,
          isSpiking: false,
          isMeasuring: false,
        });
      },
      clearCurrentSpikes: () => set({ spikes: [] }),
      clearSpikes: () => set({ spikes: [], history: [] }),
    }),
    {
      name: 'noise-storage',
      partialize: (state) => ({
        spikes: state.spikes,
        sessionId: state.sessionId,
        sessionStartTime: state.sessionStartTime,
        mode: state.mode,
      }),
    }
  )
);
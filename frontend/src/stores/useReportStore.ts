/**
 * useReportStore
 * PDF 보고서 생성 이력 관리
 */
import { create } from 'zustand';
import type { ReportState } from '../types/store';
import type { ReportHistory } from '../types/domain';

interface ReportStore extends ReportState {
  setHistory: (history: ReportHistory[]) => void;
  addReport: (report: ReportHistory) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useReportStore = create<ReportStore>((set) => ({
  history: [],
  isLoading: false,
  error: null,

  setHistory: (history) => set({ history, isLoading: false, error: null }),

  addReport: (report) =>
    set((state) => ({
      history: [report, ...state.history],
    })),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error, isLoading: false }),
}));

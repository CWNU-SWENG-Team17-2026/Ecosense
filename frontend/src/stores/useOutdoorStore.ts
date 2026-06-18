import { create } from 'zustand';

import type { OutdoorData } from '../types/domain';
import type { OutdoorState } from '../types/store';

interface OutdoorStore extends OutdoorState {
  location: string;
  setLocation: (location: string) => void;
  setOutdoorData: (data: OutdoorData) => void;
  setData: (data: OutdoorData) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  clearCache: () => void;
}

export const useOutdoorStore = create<OutdoorStore>((set) => ({
  data: null,
  location: '경남 창원시 의창구',
  lastUpdated: null,
  isLoading: false,
  isCached: false,
  error: null,
  setLocation: (location) => set({ location }),
  setOutdoorData: (data) =>
    set({
      data,
      lastUpdated: new Date().toISOString(),
      isCached: data.cached,
      isLoading: false,
      error: null,
    }),
  setData: (data) =>
    set({
      data,
      lastUpdated: new Date().toISOString(),
      isCached: data.cached ?? false,
      isLoading: false,
      error: null,
    }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error, isLoading: false }),
  clearCache: () =>
    set({ data: null, lastUpdated: null, isCached: false }),
}));
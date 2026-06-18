import { create } from 'zustand';

interface AuthUser {
  email: string;
  id?: string;
}

interface AuthStore {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isInitializing: boolean;
  login: (user: AuthUser) => void;
  logout: () => void;
  setInitializing: (value: boolean) => void;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isInitializing: true,
  login: (user) => set({ user, isAuthenticated: true }),
  logout: () => set({ user: null, isAuthenticated: false }),
  setInitializing: (value) => set({ isInitializing: value }),
}));
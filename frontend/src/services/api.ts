import axios from 'axios';

import { useAuthStore } from '../stores/useAuthStore';

const rawBaseUrl =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';
// axios는 url이 '/'로 시작하면 baseURL의 /api 경로가 빠지므로 trailing slash 고정
const API_BASE_URL = (rawBaseUrl.endsWith('/api')
  ? rawBaseUrl
  : `${rawBaseUrl.replace(/\/$/, '')}/api`
).replace(/\/?$/, '/');

const normalizeUrl = (url: string) => url.replace(/^\/+/, '');

const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

const refreshApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

const shouldSkipRefresh = (url?: string) => {
  if (!url) return true;
  const path = normalizeUrl(url);
  return (
    path.startsWith('auth/me') ||
    path.startsWith('auth/refresh') ||
    path.startsWith('auth/login') ||
    path.startsWith('auth/register')
  );
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (!originalRequest) {
      return Promise.reject(error);
    }

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !shouldSkipRefresh(originalRequest.url)
    ) {
      originalRequest._retry = true;

      try {
        await refreshApi.post(normalizeUrl('/auth/refresh'));
        return api(originalRequest);
      } catch (refreshError) {
        useAuthStore.getState().logout();
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

api.interceptors.request.use((config) => {
  if (config.url) {
    config.url = normalizeUrl(config.url);
  }
  return config;
});

refreshApi.interceptors.request.use((config) => {
  if (config.url) {
    config.url = normalizeUrl(config.url);
  }
  return config;
});

export default api;
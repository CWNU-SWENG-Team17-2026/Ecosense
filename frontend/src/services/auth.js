import api from './api';

export const register = async (data) => {
  const response = await api.post('/auth/register', data);
  return response.data;
};

export const login = async (data) => {
  const response = await api.post('/auth/login', data);
  return response.data;
};

export const logout = async () => {
  const response = await api.post('/auth/logout');
  return response.data;
};

export const getMe = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

export const verifyEmail = async (email, code) => {
  const response = await api.post('/auth/verify', { email, code });
  return response.data;
};

export const resendVerify = async (email) => {
  const response = await api.post('/auth/resend-verify', { email });
  return response.data;
};

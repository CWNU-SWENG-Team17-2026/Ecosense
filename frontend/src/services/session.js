import api from './api';

export const getSessions = async ({ offset = 0, limit = 50 } = {}) => {
  const response = await api.get('/sessions', {
    params: { offset, limit },
  });

  return response.data;
};

export const getSessionDetail = async (id) => {
  const response = await api.get(`/sessions/${id}`);
  return response.data;
};

export const getSessionSpikes = async (id) => {
  const response = await api.get(`/sessions/${id}/spikes`);
  return response.data;
};

export const saveSpikeToSession = async (sessionId, data) => {
  const response = await api.post(`/sessions/${sessionId}/spikes`, data);
  return response.data;
};

export const deleteSession = async (id) => {
  const response = await api.delete(`/sessions/${id}`);
  return response.data;
};

export const clearSessions = async () => {
  const response = await api.delete('/sessions');
  return response.data;
};

export const deleteSpike = async (id) => {
  const response = await api.delete(`/spikes/${id}`);
  return response.data;
};

export const clearSessionSpikes = async (id) => {
  const response = await api.delete(`/sessions/${id}/spikes`);
  return response.data;
};

export const cleanupSessions = async () => {
  const response = await api.post('/sessions/cleanup');
  return response.data;
};
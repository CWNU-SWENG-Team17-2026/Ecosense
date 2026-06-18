import api from './api';

export const uploadSyncData = async (data) => {
  const response = await api.post('/sync/upload', data);
  return response.data;
};

export const downloadSyncData = async (days = 30) => {
  const response = await api.get('/sync/download', {
    params: { days },
  });

  return response.data;
};
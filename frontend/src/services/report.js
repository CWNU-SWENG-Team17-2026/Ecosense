import api from './api';

export const getReportHistory = async (limit = 10) => {
  const response = await api.get('/report/history', {
    params: { limit },
  });

  return response.data;
};

export const downloadReport = async (period) => {
  const response = await api.get('/report/download', {
    params: { period },
    responseType: 'blob',
  });

  return response.data;
};
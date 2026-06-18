import api from './api';

export const searchLocations = async (keyword) => {
  const response = await api.get('/location/search', {
    params: { keyword },
  });

  return response.data;
};
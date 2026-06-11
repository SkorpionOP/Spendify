import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.PROD ? '/_/backend/api' : '/api',
  withCredentials: true,
});

export default api;

import axios from 'axios';

const apiBaseUrl = (import.meta.env.VITE_API_URL as string) || '/api';

const api = axios.create({
  baseURL: apiBaseUrl,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Attach token from localStorage on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('musely_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('musely_token');
      localStorage.removeItem('musely_user');
      // Don't redirect automatically - let auth context handle it
    }
    return Promise.reject(error);
  }
);

export default api;

// Helper to extract error message
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const apiError = error.response?.data?.error;

    if (typeof apiError === 'string') {
      return apiError;
    }

    if (
      apiError &&
      typeof apiError === 'object' &&
      'message' in apiError &&
      typeof apiError.message === 'string'
    ) {
      return apiError.message;
    }

    return error.message || 'An error occurred';
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'An unexpected error occurred';
}

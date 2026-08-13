export const API_BASE = import.meta.env.VITE_API_URL
  ? (import.meta.env.VITE_API_URL.replace(/\/+$/, '').endsWith('/api')
      ? import.meta.env.VITE_API_URL.replace(/\/+$/, '')
      : `${import.meta.env.VITE_API_URL.replace(/\/+$/, '')}/api`)
  : `http://${typeof window !== 'undefined' ? window.location.hostname : 'localhost'}:3001/api`;

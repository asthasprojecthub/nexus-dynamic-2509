const API_BASE = '/api';

export async function api(path, options = {}) {
  const token = localStorage.getItem('nexus_token');
  const headers = {
    ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
    ...(options.headers || {}),
  };

  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && path !== '/auth/login') {
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_user');
    if (window.location.pathname !== '/login') window.location.replace('/login');
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API ${res.status}`);
  }

  if (res.status === 204) return null;
  return res.json();
}

export const apiBase = API_BASE;

export async function downloadApiFile(path, filename = 'download') {
  const token = localStorage.getItem('nexus_token');
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const res = await fetch(`${API_BASE}${path}`, { headers });

  if (res.status === 401) {
    localStorage.removeItem('nexus_token');
    localStorage.removeItem('nexus_user');
    if (window.location.pathname !== '/login') window.location.replace('/login');
    throw new Error('Session expired. Please sign in again.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Download failed (${res.status})`);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename || 'download';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

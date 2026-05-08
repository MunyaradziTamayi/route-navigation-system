export const DEFAULT_API_BASE_URL = 'http://localhost:8080';

export function getApiBaseUrl(): string {
  const fromWindow = (globalThis as any)?.ROUTENAV_API_BASE_URL;
  if (typeof fromWindow === 'string' && fromWindow.trim()) return fromWindow.trim();

  const fromStorage = globalThis?.localStorage?.getItem('routenav_api_base_url');
  if (typeof fromStorage === 'string' && fromStorage.trim()) return fromStorage.trim();

  return DEFAULT_API_BASE_URL;
}

export const API_ENDPOINTS = {
  computeRoute: () => `${getApiBaseUrl()}/api/routes/compute`,
  listJourneys: () => `${getApiBaseUrl()}/api/journeys`,
  journeyRoute: (id: string) => `${getApiBaseUrl()}/api/journeys/${encodeURIComponent(id)}`
};


export const DEFAULT_API_BASE_URL = 'https://route-navigator-backend.onrender.com';

export function getApiBaseUrl(): string {
  const fromWindow = (globalThis as any)?.ROUTENAV_API_BASE_URL;
  if (typeof fromWindow === 'string' && fromWindow.trim()) return fromWindow.trim();

  const fromStorage = globalThis?.localStorage?.getItem('routenav_api_base_url');
  if (typeof fromStorage === 'string' && fromStorage.trim()) return fromStorage.trim();

  return DEFAULT_API_BASE_URL;
}

export const API_ENDPOINTS = {
  login: () => `${getApiBaseUrl()}/api/auth/login`,
  register: () => `${getApiBaseUrl()}/api/auth/register`,
  computeRoute: () => `${getApiBaseUrl()}/api/routes/compute`,
  geocode: () => `${getApiBaseUrl()}/api/geocode`,
  listJourneys: () => `${getApiBaseUrl()}/api/journeys`,
  journeyRoute: (id: string) => `${getApiBaseUrl()}/api/journeys/${encodeURIComponent(id)}`,
  visits: () => `${getApiBaseUrl()}/api/visits`,
  visit: (id: string) => `${getApiBaseUrl()}/api/visits/${encodeURIComponent(id)}`,
  mileageUpload: () => `${getApiBaseUrl()}/api/mileage/upload`,
  mileageUploads: () => `${getApiBaseUrl()}/api/mileage/uploads`,
  mileageReports: () => `${getApiBaseUrl()}/api/mileage/reports`,
  mileageTotals: () => `${getApiBaseUrl()}/api/mileage/totals`,
  mileageReport: (id: string | number) => `${getApiBaseUrl()}/api/mileage/reports/${encodeURIComponent(String(id))}`,
  mileageReportDownload: (id: string | number) => `${getApiBaseUrl()}/api/mileage/reports/${encodeURIComponent(String(id))}/download`,
  workerMileageVisits: (staffNumber: string) => `${getApiBaseUrl()}/api/mileage/visits/staff/${encodeURIComponent(staffNumber)}`,
  workers: () => `${getApiBaseUrl()}/api/workers`,
  workerUpload: () => `${getApiBaseUrl()}/api/workers/upload`,
  worker: (id: string | number) => `${getApiBaseUrl()}/api/workers/${encodeURIComponent(String(id))}`,
  resetDatabase: () => `${getApiBaseUrl()}/api/admin/reset`
};





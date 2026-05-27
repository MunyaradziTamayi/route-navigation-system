import { HttpClient, HttpErrorResponse, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_ENDPOINTS } from './api.config';

export type WorkerMileageReportRow = {
  staffNumber: string;
  totalMileage?: number;
  totalMileageKm?: number;
  totalMileageMiles?: number;
  totalStraightLineMileage?: number;
  totalStraightLineMileageKm?: number;
  totalStraightLineMileageMiles?: number;
  totalSavedMileage?: number;
  totalSavedMileageKm?: number;
  totalSavedMileageMiles?: number;
  straightLineMileage?: number;
  straightLineMileageKm?: number;
  straightLineMileageMiles?: number;
  straightlinemileageMiles?: number;
};

export type WorkerMileageVisit = {
  id: number | string;
  reportId: number | string;
  staffNumber: string;
  visitDate: string;
  startTime?: string | null;
  endTime?: string | null;
  address: string;
  lat?: number | null;
  lon?: number | null;
};

export type WorkerMileageReport = {
  id?: number | string;
  uploadId?: number | string;
  reportMonth: string;
  label?: string;
  totalMileageMiles?: number;
  totalStraightLineMileageMiles?: number;
  reportCount?: number;
  fileName?: string;
  downloadUrl?: string;
  createdAt?: string;
  rows: WorkerMileageReportRow[];
  visits?: WorkerMileageVisit[];
};

export type WorkerMileageUpload = {
  id: number | string;
  fileName?: string;
  createdAt?: string;
  reportCount?: number;
  reportMonths?: string[];
  totals?: WorkerMileageReport[];
  reports?: WorkerMileageReport[];
};

export type MileageDownloadResult = {
  blob: Blob;
  filename: string;
};

export type MileageReportFilters = {
  month?: string;
  year?: string | number | null;
};

const MONTH_OPTIONS = [
  { full: 'January', short: 'jan' },
  { full: 'February', short: 'feb' },
  { full: 'March', short: 'mar' },
  { full: 'April', short: 'apr' },
  { full: 'May', short: 'may' },
  { full: 'June', short: 'jun' },
  { full: 'July', short: 'jul' },
  { full: 'August', short: 'aug' },
  { full: 'September', short: 'sep' },
  { full: 'October', short: 'oct' },
  { full: 'November', short: 'nov' },
  { full: 'December', short: 'dec' }
];

@Injectable({ providedIn: 'root' })
export class MileageUploadService {
  private readonly http = inject(HttpClient);

  async upload(file: File, filters: MileageReportFilters = {}): Promise<WorkerMileageUpload> {
    const body = new FormData();
    const params = this.paramsFromFilters(filters);

    body.append('file', file, file.name);

    try {
      return await firstValueFrom(
        this.http.post<WorkerMileageUpload>(API_ENDPOINTS.mileageUpload(), body, { params })
      );
    } catch (error) {
      throw new Error(await this.errorMessage(error));
    }
  }

  listReports(filters: MileageReportFilters = {}) {
    const params = this.paramsFromFilters(filters);

    return this.http.get<WorkerMileageReport[]>(API_ENDPOINTS.mileageTotals(), { params });
  }

  listUploads() {
    return this.http.get<WorkerMileageUpload[]>(API_ENDPOINTS.mileageUploads());
  }

  listDownloadableReports(filters: MileageReportFilters = {}) {
    const params = this.paramsFromFilters(filters);

    return this.http.get<WorkerMileageReport[]>(API_ENDPOINTS.mileageReports(), { params });
  }

  getReport(id: string | number) {
    return this.http.get<WorkerMileageReport>(API_ENDPOINTS.mileageReport(id));
  }

  getVisitsByStaffNumber(staffNumber: string) {
    return this.http.get<WorkerMileageVisit[]>(API_ENDPOINTS.workerMileageVisits(staffNumber));
  }

  private paramsFromFilters(filters: MileageReportFilters): HttpParams {
    let params = new HttpParams();
    const month = filters.month?.trim();
    const year = filters.year == null ? '' : String(filters.year).trim();
    const normalizedMonth = month ? this.normalizedMonthFilter(month) : null;

    if (normalizedMonth) params = params.set('month', normalizedMonth);
    if (year) params = params.set('year', year);
    return params;
  }

  private normalizedMonthFilter(value: string): string | null {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    if (/^\d{4}-\d{2}$/.test(normalized)) return value.trim();
    if (/^\d{1,2}$/.test(normalized)) {
      const month = Number(normalized);
      return month >= 1 && month <= 12 ? value.trim() : null;
    }

    const exactMonth = MONTH_OPTIONS.find((month) =>
      normalized === month.full.toLowerCase() || normalized === month.short
    );
    if (exactMonth) return exactMonth.full;

    const parts = normalized.replace(/[,/-]/g, ' ').split(/\s+/).filter(Boolean);
    if (parts.length !== 2) return null;

    const year = parts.find((part) => /^\d{4}$/.test(part));
    const month = parts.find((part) =>
      MONTH_OPTIONS.some((option) => part === option.full.toLowerCase() || part === option.short)
    );
    if (!year || !month) return null;

    const monthOption = MONTH_OPTIONS.find((option) =>
      month === option.full.toLowerCase() || month === option.short
    );
    return monthOption ? `${monthOption.full} ${year}` : null;
  }

  async downloadReport(id: string | number): Promise<MileageDownloadResult> {
    const response = await firstValueFrom(
      this.http.get(API_ENDPOINTS.mileageReportDownload(id), {
        observe: 'response',
        responseType: 'blob'
      })
    );

    return {
      blob: response.body ?? new Blob(),
      filename: this.filenameFromResponse(response) ?? 'worker-mileage.xlsx'
    };
  }

  async downloadMasterReport(filters: MileageReportFilters = {}): Promise<MileageDownloadResult> {
    const response = await firstValueFrom(
      this.http.get(API_ENDPOINTS.mileageMasterReportDownload(), {
        params: this.paramsFromFilters(filters),
        observe: 'response',
        responseType: 'blob'
      })
    );

    return {
      blob: response.body ?? new Blob(),
      filename: this.filenameFromResponse(response) ?? 'worker-mileage-master.xlsx'
    };
  }

  async downloadOptimizedRoutes(filters: MileageReportFilters = {}): Promise<MileageDownloadResult> {
    const response = await firstValueFrom(
      this.http.get(API_ENDPOINTS.mileageOptimizedRoutesDownload(), {
        params: this.paramsFromFilters(filters),
        observe: 'response',
        responseType: 'blob'
      })
    );

    return {
      blob: response.body ?? new Blob(),
      filename: this.filenameFromResponse(response) ?? 'worker-mileage-optimized-routes.xlsx'
    };
  }

  private async errorMessage(error: unknown): Promise<string> {
    if (error instanceof HttpErrorResponse) {
      if (error.error instanceof Blob) {
        const text = await error.error.text();
        const parsed = this.messageFromJson(text);
        if (parsed) return parsed;
        if (text.trim()) return text.trim();
      }

      if (typeof error.error?.message === 'string' && error.error.message.trim()) {
        return error.error.message;
      }

      if (typeof error.message === 'string' && error.message.trim()) return error.message;
    }

    return 'Failed to calculate mileage.';
  }

  private messageFromJson(text: string): string | null {
    try {
      const parsed = JSON.parse(text) as { message?: unknown };
      return typeof parsed.message === 'string' && parsed.message.trim() ? parsed.message : null;
    } catch {
      return null;
    }
  }

  private filenameFromResponse(response: HttpResponse<Blob>): string | null {
    const disposition = response.headers.get('content-disposition');
    if (!disposition) return null;

    const utfMatch = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
    if (utfMatch?.[1]) return decodeURIComponent(utfMatch[1].replace(/"/g, ''));

    const match = /filename="?([^";]+)"?/i.exec(disposition);
    return match?.[1] ?? null;
  }
}


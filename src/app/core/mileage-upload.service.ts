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

@Injectable({ providedIn: 'root' })
export class MileageUploadService {
  private readonly http = inject(HttpClient);

  async upload(file: File, filters: MileageReportFilters = {}): Promise<WorkerMileageUpload> {
    const body = new FormData();
    let params = new HttpParams();
    const month = filters.month?.trim();
    const year = filters.year == null ? '' : String(filters.year).trim();

    if (month) params = params.set('month', month);
    if (year) params = params.set('year', year);

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
    let params = new HttpParams();
    const month = filters.month?.trim();
    const year = filters.year == null ? '' : String(filters.year).trim();

    if (month) params = params.set('month', month);
    if (year) params = params.set('year', year);

    return this.http.get<WorkerMileageReport[]>(API_ENDPOINTS.mileageTotals(), { params });
  }

  listUploads() {
    return this.http.get<WorkerMileageUpload[]>(API_ENDPOINTS.mileageUploads());
  }

  listDownloadableReports(filters: MileageReportFilters = {}) {
    let params = new HttpParams();
    const month = filters.month?.trim();
    const year = filters.year == null ? '' : String(filters.year).trim();

    if (month) params = params.set('month', month);
    if (year) params = params.set('year', year);

    return this.http.get<WorkerMileageReport[]>(API_ENDPOINTS.mileageReports(), { params });
  }

  getReport(id: string | number) {
    return this.http.get<WorkerMileageReport>(API_ENDPOINTS.mileageReport(id));
  }

  getVisitsByStaffNumber(staffNumber: string) {
    return this.http.get<WorkerMileageVisit[]>(API_ENDPOINTS.workerMileageVisits(staffNumber));
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


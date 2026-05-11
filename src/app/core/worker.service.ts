import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_ENDPOINTS } from './api.config';

export type WorkerPayload = {
  staffNumber: string;
  name: string;
  email: string;
  phone?: string;
  area?: string;
  homeAddress?: string | null;
};

export type WorkerResponse = WorkerPayload & {
  id: number | string;
  createdAt: string;
  updatedAt?: string;
};

@Injectable({ providedIn: 'root' })
export class WorkerService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<WorkerResponse[]>(API_ENDPOINTS.workers());
  }

  create(payload: WorkerPayload): Promise<WorkerResponse> {
    return firstValueFrom(this.http.post<WorkerResponse>(API_ENDPOINTS.workers(), payload));
  }

  update(id: string | number, payload: WorkerPayload): Promise<WorkerResponse> {
    return firstValueFrom(this.http.put<WorkerResponse>(API_ENDPOINTS.worker(id), payload));
  }

  delete(id: string | number): Promise<void> {
    return firstValueFrom(this.http.delete<void>(API_ENDPOINTS.worker(id)));
  }

  uploadWorkers(file: File): Promise<WorkerResponse[]> {
    const body = new FormData();
    body.append('file', file, file.name);
    return firstValueFrom(this.http.post<WorkerResponse[]>(API_ENDPOINTS.workerUpload(), body));
  }
}



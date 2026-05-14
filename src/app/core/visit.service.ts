import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_ENDPOINTS } from './api.config';

export type VisitPayload = {
  origin: { label: string; lat: number; lon: number };
  destination: { label: string; lat: number; lon: number };
  workerIds: string[];
  workerNames: string[];
  clientLabel?: string;
  notes?: string;
  startTime: string;
  endTime: string;
  durationMinutes?: number;
  visitsPerDay: number;
  distanceKm: number;
  durationSeconds: number;
  geoJson: any;
  scheduledDate?: string;
  status?: 'pending' | 'completed';
};

export type VisitResponse = VisitPayload & {
  id: number | string;
  originLabel?: string;
  destinationLabel?: string;
  originLat?: number;
  originLon?: number;
  destinationLat?: number;
  destinationLon?: number;
  straightLineDistanceKm?: number;
  createdAt: string;
  updatedAt?: string;
};

@Injectable({ providedIn: 'root' })
export class VisitService {
  private readonly http = inject(HttpClient);

  list() {
    return this.http.get<VisitResponse[]>(API_ENDPOINTS.visits());
  }

  create(payload: VisitPayload): Promise<VisitResponse> {
    return firstValueFrom(this.http.post<VisitResponse>(API_ENDPOINTS.visits(), payload));
  }

  update(id: string, payload: VisitPayload): Promise<VisitResponse> {
    return firstValueFrom(this.http.put<VisitResponse>(API_ENDPOINTS.visit(id), payload));
  }

  delete(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(API_ENDPOINTS.visit(id)));
  }

  uploadVisits(file: File): Promise<VisitResponse[]> {
    const body = new FormData();
    body.append('file', file, file.name);
    return firstValueFrom(this.http.post<VisitResponse[]>(API_ENDPOINTS.visitUpload(), body));
  }

  assignStaff(): Promise<VisitResponse[]> {
    return firstValueFrom(this.http.post<VisitResponse[]>(API_ENDPOINTS.assignVisitStaff(), {}));
  }
}

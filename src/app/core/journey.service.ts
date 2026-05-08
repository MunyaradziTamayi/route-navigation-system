import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, map, of } from 'rxjs';
import { API_ENDPOINTS } from './api.config';

export type JourneySummary = {
  id: string;
  originLabel: string;
  destinationLabel: string;
  distanceKm: number;
  createdAt: string;
};

@Injectable({ providedIn: 'root' })
export class JourneyService {
  private readonly http = inject(HttpClient);

  list(limit = 5) {
    const params = new HttpParams().set('limit', String(limit));
    return this.http.get<any>(API_ENDPOINTS.listJourneys(), { params }).pipe(
      map((data) => {
        const rows = Array.isArray(data) ? data : data?.items ?? data?.content ?? [];
        const mapped = (rows as any[]).map((j) => ({
          id: String(j.id ?? j.journeyId ?? ''),
          originLabel: String(j.originLabel ?? j.origin ?? j.origin_name ?? 'Origin'),
          destinationLabel: String(
            j.destinationLabel ?? j.destination ?? j.destination_name ?? 'Destination'
          ),
          distanceKm: Number(
            j.distanceKm ?? j.distance_km ?? (j.distanceMeters ?? j.distance_m ?? 0) / 1000
          ),
          createdAt: String(j.createdAt ?? j.created_at ?? j.timestamp ?? new Date().toISOString())
        })) as JourneySummary[];

        mapped.sort(
          (a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || '')
        );
        return mapped.slice(0, limit);
      }),
      catchError(() => of<JourneySummary[]>([]))
    );
  }
}

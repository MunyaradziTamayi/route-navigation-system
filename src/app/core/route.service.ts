import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { catchError, firstValueFrom, map, of, throwError } from 'rxjs';
import { API_ENDPOINTS } from './api.config';

export type RouteRequest = {
  origin: { lat: number; lon: number; label?: string };
  destination: { lat: number; lon: number; label?: string };
  algorithm: 'dijkstra' | 'astar';
};

export type RouteResponse = {
  geoJson: any;
  distanceKm: number;
  straightLineDistanceKm: number;
  durationSeconds: number;
};

@Injectable({ providedIn: 'root' })
export class RouteService {
  private readonly http = inject(HttpClient);

  async computeRoute(request: RouteRequest): Promise<RouteResponse> {
    const obs = this.http.post<any>(API_ENDPOINTS.computeRoute(), request).pipe(
      map((raw) => this.normalize(raw)),
      catchError((err) =>
        throwError(() => new Error(err?.error?.message ?? err?.message ?? 'Backend unavailable'))
      )
    );
    return firstValueFrom(obs);
  }

  getJourneyRoute(id: string) {
    return this.http.get<any>(API_ENDPOINTS.journeyRoute(id)).pipe(
      map((raw) => this.normalize(raw)),
      catchError(() => of<RouteResponse>({ geoJson: null, distanceKm: 0, straightLineDistanceKm: 0, durationSeconds: 0 }))
    );
  }

  private normalize(raw: any): RouteResponse {
    const geoJson = raw?.geoJson ?? raw?.geojson ?? raw?.routeGeoJson ?? raw?.geometry ?? raw?.route;
    const distanceMeters = Number(raw?.distanceMeters ?? raw?.distance_m ?? raw?.distance ?? NaN);
    const durationSeconds = Number(raw?.durationSeconds ?? raw?.duration_s ?? raw?.duration ?? NaN);

    const distanceKm = Number.isFinite(distanceMeters) ? distanceMeters / 1000 : Number(raw?.distanceKm ?? raw?.distance_km ?? 0);
    const straightLineDistanceKm = Number(raw?.straightLineDistanceKm ?? raw?.straight_line_distance_km ?? 0);
    const duration = Number.isFinite(durationSeconds)
      ? durationSeconds
      : Number(raw?.durationMinutes ?? raw?.duration_min ?? 0) * 60;

    return {
      geoJson,
      distanceKm: Number.isFinite(distanceKm) ? distanceKm : 0,
      straightLineDistanceKm: Number.isFinite(straightLineDistanceKm) ? straightLineDistanceKm : 0,
      durationSeconds: Number.isFinite(duration) ? duration : 0
    };
  }
}

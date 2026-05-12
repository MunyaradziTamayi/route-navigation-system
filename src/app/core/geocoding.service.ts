import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map, of } from 'rxjs';
import { API_ENDPOINTS } from './api.config';

export type GeocodeResult = {
  displayName: string;
  lat: number;
  lon: number;
};

type GeocodeItem = {
  displayName?: string;
  display_name?: string;
  lat: string | number;
  lon: string | number;
};

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly http = inject(HttpClient);

  search(query: string) {
    const q = query.trim();
    if (q.length < 3) return of<GeocodeResult[]>([]);

    return this.http
      .get<GeocodeItem[]>(API_ENDPOINTS.geocode(), { params: { q } })
      .pipe(
        map((items) =>
          (items ?? [])
            .map((i) => ({
              displayName: i.displayName ?? i.display_name ?? '',
              lat: Number(i.lat),
              lon: Number(i.lon)
            }))
            .filter(
              (r) =>
                Number.isFinite(r.lat) &&
                Number.isFinite(r.lon) &&
                !!r.displayName
            )
        )
      );
  }

  async bestMatch(query: string): Promise<GeocodeResult | null> {
    const results = await firstValueFrom(this.search(query));
    return results[0] ?? null;
  }
}


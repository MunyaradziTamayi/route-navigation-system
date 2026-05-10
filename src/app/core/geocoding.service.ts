import { HttpClient, HttpParams } from '@angular/common/http';
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
  lat: string;
  lon: string;
};

const ZIMBABWE_BOUNDS = {
  minLat: -22.5,
  maxLat: -15.5,
  minLon: 25,
  maxLon: 33.2
};

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly http = inject(HttpClient);

  search(query: string) {
    const q = query.trim();
    if (q.length < 3) return of<GeocodeResult[]>([]);

    const params = new HttpParams()
      .set('q', `${q}, Zimbabwe`)
      .set('countrycodes', 'zw')
      .set('viewbox', '25,-15.5,33.2,-22.5')
      .set('bounded', '1')
      .set('addressdetails', '1')
      .set('dedupe', '1')
      .set('limit', '10');

    return this.http
      .get<GeocodeItem[]>(API_ENDPOINTS.geocode(), { params })
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
                !!r.displayName &&
                this.isInZimbabwe(r)
            )
        )
      );
  }

  async bestMatch(query: string): Promise<GeocodeResult | null> {
    const results = await firstValueFrom(this.search(query));
    return results[0] ?? null;
  }

  private isInZimbabwe(result: GeocodeResult): boolean {
    return (
      result.lat >= ZIMBABWE_BOUNDS.minLat &&
      result.lat <= ZIMBABWE_BOUNDS.maxLat &&
      result.lon >= ZIMBABWE_BOUNDS.minLon &&
      result.lon <= ZIMBABWE_BOUNDS.maxLon
    );
  }
}


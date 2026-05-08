import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, map, of } from 'rxjs';

export type GeocodeResult = {
  displayName: string;
  lat: number;
  lon: number;
};

type NominatimItem = {
  display_name: string;
  lat: string;
  lon: string;
};

@Injectable({ providedIn: 'root' })
export class GeocodingService {
  private readonly http = inject(HttpClient);

  search(query: string) {
    const q = query.trim();
    if (q.length < 3) return of<GeocodeResult[]>([]);

    // Zimbabwe bounds: left,top,right,bottom (lon,lat,lon,lat)
    const zimbabweViewbox = '25.0,-15.5,33.5,-22.5';

    const params = new HttpParams()
      .set('q', q)
      .set('format', 'jsonv2')
      .set('addressdetails', '1')
      .set('limit', '5')
      .set('viewbox', zimbabweViewbox)
      .set('bounded', '1')
      .set('countrycodes', 'zw');

    return this.http
      .get<NominatimItem[]>('https://nominatim.openstreetmap.org/search', { params })
      .pipe(
        map((items) =>
          (items ?? [])
            .map((i) => ({
              displayName: i.display_name,
              lat: Number(i.lat),
              lon: Number(i.lon)
            }))
            .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && !!r.displayName)
        )
      );
  }

  async bestMatch(query: string): Promise<GeocodeResult | null> {
    const results = await firstValueFrom(this.search(query));
    return results[0] ?? null;
  }
}


import { AfterViewInit, Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import type { GeocodeResult } from '../core/geocoding.service';

@Component({
  selector: 'app-map-canvas',
  standalone: true,
  imports: [],
  template: `<div #map class="map-canvas"></div>`,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
      }

      .map-canvas {
        height: 100%;
        width: 100%;
      }
    `
  ]
})
export class MapCanvasComponent implements AfterViewInit, OnChanges {
  @ViewChild('map', { static: true }) private readonly mapEl?: ElementRef<HTMLDivElement>;

  @Input() origin: GeocodeResult | null = null;
  @Input() destination: GeocodeResult | null = null;
  @Input() routeGeoJson: any | null = null;

  private map: any;
  private markersLayer: any;
  private routeLayer: any;
  private leaflet: any;

  ngAfterViewInit(): void {
    if (!this.mapEl) return;

    this.leaflet = (globalThis as any).L;
    if (!this.leaflet) throw new Error('Leaflet failed to load.');

    this.map = this.leaflet.map(this.mapEl.nativeElement, {
      zoomControl: true,
      attributionControl: true
    }).setView([0, 0], 2);

    this.leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap'
    }).addTo(this.map);

    this.markersLayer = this.leaflet.layerGroup().addTo(this.map);
    this.routeLayer = this.leaflet.geoJSON(null, {
      style: { color: '#15557f', weight: 6, opacity: 0.95 }
    }).addTo(this.map);

    setTimeout(() => this.map?.invalidateSize?.(), 0);
    this.refreshLayers();
  }

  ngOnChanges(): void {
    this.refreshLayers();
  }

  private refreshLayers() {
    if (!this.map || !this.markersLayer || !this.routeLayer) return;

    this.markersLayer.clearLayers();
    this.routeLayer.clearLayers();

    const bounds: any[] = [];

    if (this.origin) {
      const latlng = [this.origin.lat, this.origin.lon];
      bounds.push(latlng);
      this.leaflet.circleMarker(latlng, { radius: 7, color: '#7fff98', weight: 3, fillOpacity: 0.9 })
        .bindPopup('Origin')
        .addTo(this.markersLayer);
    }

    if (this.destination) {
      const latlng = [this.destination.lat, this.destination.lon];
      bounds.push(latlng);
      this.leaflet.circleMarker(latlng, { radius: 7, color: '#ff7b7b', weight: 3, fillOpacity: 0.9 })
        .bindPopup('Destination')
        .addTo(this.markersLayer);
    }

    if (this.routeGeoJson) {
      try {
        const geo = this.coerceGeoJson(this.routeGeoJson);
        this.drawRouteGeometry(geo);
        const routeBounds = this.routeLayer.getBounds?.();
        if (routeBounds?.isValid?.()) {
          this.routeLayer.bringToFront?.();
          this.map.fitBounds(routeBounds.pad(0.15), { padding: [40, 40], maxZoom: 17 });
          return;
        }
      } catch {
        // Ignore invalid route geometry. Do not draw a straight-line fallback.
      }
    }

    if (bounds.length >= 2) {
      this.map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
      return;
    }

    if (bounds.length === 1) {
      this.map.setView(bounds[0], 13);
    }
  }

  private coerceGeoJson(input: any): any {
    if (!input) return input;

    if (typeof input === 'string') {
      try {
        return JSON.parse(input);
      } catch {
        return input;
      }
    }

    const encodedPolyline = this.findEncodedPolyline(input);
    if (encodedPolyline) return this.decodePolyline(encodedPolyline);

    const nested = input?.geoJson ?? input?.geojson ?? input?.geometry ?? input?.routeGeometry;
    if (nested && nested !== input) return this.coerceGeoJson(nested);

    if (Array.isArray(input?.routes) && input.routes.length > 0) {
      return this.coerceGeoJson(input.routes[0]);
    }

    if (Array.isArray(input)) {
      // Assume an array of [lon,lat] coordinates
      return { type: 'LineString', coordinates: input };
    }

    if (
      input?.type === 'LineString' ||
      input?.type === 'MultiLineString' ||
      input?.type === 'Feature' ||
      input?.type === 'FeatureCollection'
    ) {
      return input;
    }

    if (Array.isArray(input?.coordinates)) {
      return { type: input.type ?? 'LineString', coordinates: input.coordinates };
    }

    return input;
  }

  private drawRouteGeometry(geo: any) {
    try {
      this.routeLayer.addData(geo);
      if (this.routeLayer.getLayers?.().length > 0) return;
    } catch {
      // Fall through to manual coordinate extraction below.
    }

    const coordinates = this.extractCoordinates(geo);
    const decoded = coordinates.length === 0 && typeof geo === 'string' ? this.decodePolyline(geo).coordinates : [];
    const latLngs = coordinates
      .concat(decoded)
      .map((point) => this.toLatLng(point))
      .filter((point): point is [number, number] => !!point);

    if (latLngs.length >= 2) {
      this.leaflet.polyline(latLngs, {
        color: '#15557f',
        weight: 6,
        opacity: 0.95,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(this.routeLayer);
    }
  }

  private extractCoordinates(geo: any): any[] {
    if (!geo) return [];
    if (Array.isArray(geo)) {
      if (geo.length >= 2 && typeof geo[0] === 'number' && typeof geo[1] === 'number') return [geo];
      return geo.flatMap((item) => this.extractCoordinates(item));
    }

    if (Array.isArray(geo.coordinates)) return this.extractCoordinates(geo.coordinates);
    if (Array.isArray(geo.features)) return geo.features.flatMap((feature: any) => this.extractCoordinates(feature));
    if (geo.geometry) return this.extractCoordinates(geo.geometry);
    if (geo.lat != null || geo.latitude != null) return [geo];

    return [];
  }

  private findEncodedPolyline(input: any): string {
    const candidates = [
      input?.encodedPolyline,
      input?.polyline,
      input?.polyline?.encodedPolyline,
      input?.overview_polyline?.points,
      input?.routes?.[0]?.polyline?.encodedPolyline,
      input?.routes?.[0]?.overview_polyline?.points
    ];

    return candidates.find((value) => typeof value === 'string' && value.trim().length > 0) ?? '';
  }

  private decodePolyline(encodedPolyline: string): { type: 'LineString'; coordinates: number[][] } {
    const coordinates: number[][] = [];
    let index = 0;
    let lat = 0;
    let lon = 0;

    while (index < encodedPolyline.length) {
      const latResult = this.decodePolylineValue(encodedPolyline, index);
      index = latResult.nextIndex;
      lat += latResult.value;

      const lonResult = this.decodePolylineValue(encodedPolyline, index);
      index = lonResult.nextIndex;
      lon += lonResult.value;

      coordinates.push([lon / 100000, lat / 100000]);
    }

    return { type: 'LineString', coordinates };
  }

  private decodePolylineValue(encodedPolyline: string, startIndex: number): { value: number; nextIndex: number } {
    let result = 0;
    let shift = 0;
    let index = startIndex;
    let byte = 0;

    do {
      byte = encodedPolyline.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encodedPolyline.length);

    return {
      value: (result & 1) !== 0 ? ~(result >> 1) : result >> 1,
      nextIndex: index
    };
  }

  private toLatLng(point: any): [number, number] | null {
    if (Array.isArray(point)) {
      const first = Number(point[0]);
      const second = Number(point[1]);
      if (!Number.isFinite(first) || !Number.isFinite(second)) return null;

      // GeoJSON is [lon, lat]. If the order is clearly [lat, lon], correct it.
      if (Math.abs(first) <= 90 && Math.abs(second) > 90) return [first, second];
      return [second, first];
    }

    const lat = Number(point?.lat ?? point?.latitude);
    const lon = Number(point?.lon ?? point?.lng ?? point?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return [lat, lon];
  }
}

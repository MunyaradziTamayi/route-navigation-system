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
      attribution: '© OpenStreetMap'
    }).addTo(this.map);

    this.markersLayer = this.leaflet.layerGroup().addTo(this.map);
    this.routeLayer = this.leaflet.geoJSON(null, {
      style: { color: '#2fd0ff', weight: 5, opacity: 0.9 }
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
        this.routeLayer.addData(geo);
        const routeBounds = this.routeLayer.getBounds?.();
        if (routeBounds?.isValid?.()) {
          this.map.fitBounds(routeBounds.pad(0.15), { padding: [40, 40], maxZoom: 17 });
        }
        return;
      } catch {
        // ignore invalid GeoJSON
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
}

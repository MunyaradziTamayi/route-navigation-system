import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { GeocodingService, type GeocodeResult } from './core/geocoding.service';
import { JourneyService, type JourneySummary } from './core/journey.service';
import { RouteService, type RouteRequest, type RouteResponse } from './core/route.service';
import { MapCanvasComponent } from './map/map-canvas.component';


@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, MapCanvasComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly geocoding = inject(GeocodingService);
  private readonly routes = inject(RouteService);
  private readonly journeysApi = inject(JourneyService);

  readonly form = new FormGroup({
    origin: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    destination: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly originSuggestions = signal<GeocodeResult[]>([]);
  readonly destinationSuggestions = signal<GeocodeResult[]>([]);
  readonly originSelected = signal<GeocodeResult | null>(null);
  readonly destinationSelected = signal<GeocodeResult | null>(null);

  readonly isRouting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly route = signal<RouteResponse | null>(null);

  readonly journeys = signal<JourneySummary[]>([]);
  readonly isLoadingJourneys = signal(false);

  readonly tripsControl = new FormControl(2, { nonNullable: true });
  readonly roundTripControl = new FormControl(true, { nonNullable: true });
  readonly unitControl = new FormControl<'miles' | 'km'>('miles', { nonNullable: true });
  private readonly trips = signal(2);
  private readonly roundTrip = signal(true);
  private readonly unit = signal<'miles' | 'km'>('miles');

  readonly distanceText = computed(() => {
    const distanceKm = this.route()?.distanceKm;
    return typeof distanceKm === 'number' && distanceKm > 0 ? `${distanceKm.toFixed(2)} km` : '—';
  });

  readonly durationText = computed(() => {
    const durationSeconds = this.route()?.durationSeconds;
    if (typeof durationSeconds !== 'number' || durationSeconds <= 0) return '—';
    const minutes = Math.round(durationSeconds / 60);
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rem = minutes % 60;
    return `${hours}h ${rem}m`;
  });

  readonly oneTripText = computed(() => {
    const distanceKm = this.route()?.distanceKm;
    if (typeof distanceKm !== 'number' || distanceKm <= 0) return '—';

    return this.formatDistance(distanceKm);
  });

  readonly roundTripText = computed(() => {
    const distanceKm = this.route()?.distanceKm;
    if (typeof distanceKm !== 'number' || distanceKm <= 0) return '—';

    return this.formatDistance(distanceKm * 2);
  });

  readonly totalDistanceText = computed(() => {
    const distanceKm = this.route()?.distanceKm;
    if (typeof distanceKm !== 'number' || distanceKm <= 0) return '—';

    const trips = Math.max(1, Math.floor(Number(this.trips()) || 1));
    const multiplier = this.roundTrip() ? 2 : 1;
    return this.formatDistance(distanceKm * trips * multiplier);
  });

  constructor() {
    const originControl = this.form.controls.origin;
    const destinationControl = this.form.controls.destination;

    this.tripsControl.valueChanges.subscribe((v) => {
      const n = Math.max(1, Math.floor(Number(v) || 1));
      this.trips.set(n);
      if (this.tripsControl.value !== n) this.tripsControl.setValue(n, { emitEvent: false });
    });

    this.roundTripControl.valueChanges.subscribe((v) => {
      this.roundTrip.set(!!v);
    });

    this.unitControl.valueChanges.subscribe((v) => {
      this.unit.set(v === 'km' ? 'km' : 'miles');
    });

    originControl.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => this.geocoding.search(q))
      )
      .subscribe({
        next: (results) => this.originSuggestions.set(results),
        error: () => this.originSuggestions.set([])
      });

    destinationControl.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => this.geocoding.search(q))
      )
      .subscribe({
        next: (results) => this.destinationSuggestions.set(results),
        error: () => this.destinationSuggestions.set([])
      });

    effect(() => {
      const typed = originControl.value;
      const selected = this.originSelected();
      if (selected && typed !== selected.displayName) this.originSelected.set(null);
    });

    effect(() => {
      const typed = destinationControl.value;
      const selected = this.destinationSelected();
      if (selected && typed !== selected.displayName) this.destinationSelected.set(null);
    });

    this.refreshJourneys();
  }

  selectOrigin(result: GeocodeResult) {
    this.originSelected.set(result);
    this.form.controls.origin.setValue(result.displayName);
    this.originSuggestions.set([]);
  }

  selectDestination(result: GeocodeResult) {
    this.destinationSelected.set(result);
    this.form.controls.destination.setValue(result.displayName);
    this.destinationSuggestions.set([]);
  }

  swap() {
    const origin = this.form.controls.origin.value;
    const destination = this.form.controls.destination.value;
    const originSelected = this.originSelected();
    const destinationSelected = this.destinationSelected();

    this.form.controls.origin.setValue(destination);
    this.form.controls.destination.setValue(origin);
    this.originSelected.set(destinationSelected);
    this.destinationSelected.set(originSelected);
    this.route.set(null);
    this.errorMessage.set(null);
  }

  clearRoute() {
    this.route.set(null);
    this.errorMessage.set(null);
  }

  async submit() {
    this.errorMessage.set(null);
    this.route.set(null);
    if (this.form.invalid) {
      this.errorMessage.set('Enter an origin and destination.');
      return;
    }

    this.isRouting.set(true);
    try {
      const origin = await this.ensureSelected(
        this.form.controls.origin.value,
        this.originSelected()
      );
      const destination = await this.ensureSelected(
        this.form.controls.destination.value,
        this.destinationSelected()
      );

      if (!origin || !destination) {
        this.errorMessage.set('Pick a valid origin and destination from the suggestions.');
        return;
      }

      this.originSelected.set(origin);
      this.destinationSelected.set(destination);

      const request: RouteRequest = {
        origin: { lat: origin.lat, lon: origin.lon, label: origin.displayName },
        destination: { lat: destination.lat, lon: destination.lon, label: destination.displayName },
        algorithm: 'astar'
      };

      const response = await this.routes.computeRoute(request);
      this.route.set(response);
      this.refreshJourneys();
    } catch (e: any) {
      this.errorMessage.set(e?.message ?? 'Failed to calculate route.');
    } finally {
      this.isRouting.set(false);
    }
  }

  private async ensureSelected(
    query: string,
    selected: GeocodeResult | null
  ): Promise<GeocodeResult | null> {
    if (selected) return selected;
    return this.geocoding.bestMatch(query);
  }

  refreshJourneys() {
    this.isLoadingJourneys.set(true);
    this.journeysApi.list().subscribe({
      next: (rows) => this.journeys.set(rows),
      error: () => this.journeys.set([]),
      complete: () => this.isLoadingJourneys.set(false)
    });
  }

  loadJourney(journey: JourneySummary) {
    this.isRouting.set(true);
    this.errorMessage.set(null);
    this.routes.getJourneyRoute(journey.id).subscribe({
      next: (response) => this.route.set(response),
      error: () => this.errorMessage.set('Failed to load journey.'),
      complete: () => this.isRouting.set(false)
    });
  }

  private formatDistance(distanceKm: number): string {
    const unit = this.unit();
    if (unit === 'km') return `${distanceKm.toFixed(2)} km`;
    const milesPerKm = 0.621371;
    return `${(distanceKm * milesPerKm).toFixed(2)} miles`;
  }
}

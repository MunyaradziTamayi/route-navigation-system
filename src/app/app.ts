import { CommonModule, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, signal, type WritableSignal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { GeocodingService, type GeocodeResult } from './core/geocoding.service';
import { RouteService, type RouteRequest, type RouteResponse } from './core/route.service';
import { VisitService, type VisitPayload, type VisitResponse } from './core/visit.service';
import { WorkerService, type WorkerResponse } from './core/worker.service';
import { MapCanvasComponent } from './map/map-canvas.component';

type AppPage = 'dashboard' | 'schedule' | 'workers' | 'route' | 'reports' | 'settings';

type CareWorker = {
  id: string;
  name: string;
  email: string;
  phone: string;
  area: string;
  homeAddress: string | null;
};

type ScheduleAssignment = {
  id: string;
  workerIds: string[];
  workerNames: string[];
  clientLabel: string;
  notes: string;
  originLabel: string;
  originLat: number;
  originLon: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLon: number;
  distanceKm: number;
  durationSeconds: number;
  geoJson: any;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  visitsPerDay: number;
  assignedAt: string;
  status: 'pending' | 'completed';
};

type WorkerReportRow = {
  workerId: string;
  workerName: string;
  visits: number;
  distanceKm: number;
  firstVisit: string;
  lastVisit: string;
};

type AppSettings = {
  startAddress: string;
  startLat: number | null;
  startLon: number | null;
};

type AppNotice = {
  id: number;
  type: 'success' | 'error';
  message: string;
};

const SETTINGS_STORAGE_KEY = 'careroute_settings';

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
  private readonly visitsApi = inject(VisitService);
  private readonly workersApi = inject(WorkerService);

  readonly form = new FormGroup({
    origin: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    destination: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
  });

  readonly originSuggestions = signal<GeocodeResult[]>([]);
  readonly destinationSuggestions = signal<GeocodeResult[]>([]);
  readonly scheduleOriginSuggestions = signal<GeocodeResult[]>([]);
  readonly scheduleDestinationSuggestions = signal<GeocodeResult[]>([]);
  readonly originSelected = signal<GeocodeResult | null>(null);
  readonly destinationSelected = signal<GeocodeResult | null>(null);
  readonly scheduleOriginSelected = signal<GeocodeResult | null>(null);
  readonly scheduleDestinationSelected = signal<GeocodeResult | null>(null);

  readonly isRouting = signal(false);
  readonly errorMessage = signal<string | null>(null);
  readonly notice = signal<AppNotice | null>(null);
  readonly route = signal<RouteResponse | null>(null);
  readonly useSettingsOrigin = signal(false);

  readonly activePage = signal<AppPage>('dashboard');
  readonly isSidebarCollapsed = signal(false);
  readonly today = new Date();
  readonly workers = signal<CareWorker[]>([]);
  readonly schedules = signal<ScheduleAssignment[]>([]);
  readonly selectedRouteWorkerIds = signal<string[]>(this.firstWorkerIdList());
  readonly selectedScheduleWorkerIds = signal<string[]>(this.firstWorkerIdList());
  readonly workerSearchControl = new FormControl('', { nonNullable: true });
  readonly workerNameControl = new FormControl('', { nonNullable: true });
  readonly workerEmailControl = new FormControl('', { nonNullable: true });
  readonly workerPhoneControl = new FormControl('', { nonNullable: true });
  readonly workerAreaControl = new FormControl('', { nonNullable: true });
  readonly workerHomeAddressControl = new FormControl('', { nonNullable: true });
  readonly workerAddressSuggestions = signal<GeocodeResult[]>([]);
  readonly isWorkerFormOpen = signal(false);
  readonly editingWorkerId = signal<string | null>(null);
  readonly workerFormMessage = signal<string | null>(null);
  readonly routeVisitStartControl = new FormControl('13:00', { nonNullable: true });
  readonly routeVisitEndControl = new FormControl('14:00', { nonNullable: true });
  readonly routeVisitsPerDayControl = new FormControl(1, { nonNullable: true });
  readonly routeClientLabelControl = new FormControl('', { nonNullable: true });
  readonly routeNotesControl = new FormControl('', { nonNullable: true });
  readonly scheduleClientLabelControl = new FormControl('', { nonNullable: true });
  readonly scheduleDestinationControl = new FormControl('', { nonNullable: true });
  readonly scheduleVisitTimeControl = new FormControl('09:00', { nonNullable: true });
  readonly scheduleDurationControl = new FormControl(30, { nonNullable: true });
  readonly scheduleNotesControl = new FormControl('', { nonNullable: true });
  readonly scheduleFilterWorkerControl = new FormControl(this.firstWorkerId(), { nonNullable: true });
  readonly scheduleDateControl = new FormControl(this.formatDateInput(this.today), {
    nonNullable: true
  });
  readonly scheduleSearchControl = new FormControl('', { nonNullable: true });
  readonly isScheduleFormOpen = signal(false);
  readonly editingScheduleId = signal<string | null>(null);
  readonly scheduleFormMessage = signal<string | null>(null);
  readonly pendingScheduleVisit = signal<ScheduleAssignment | null>(null);
  readonly assignmentMessage = signal<string | null>(null);
  readonly reportFromControl = new FormControl(this.formatDateInput(this.today), {
    nonNullable: true
  });
  readonly reportToControl = new FormControl(this.formatDateInput(this.today), {
    nonNullable: true
  });
  readonly reportWorkerControl = new FormControl('all', { nonNullable: true });
  readonly reportSearchControl = new FormControl('', { nonNullable: true });
  readonly settingsStartAddressControl = new FormControl(this.loadSettingsStartAddress(), {
    nonNullable: true
  });
  readonly settingsStartSelected = signal<GeocodeResult | null>(this.loadSettingsStartLocation());
  readonly settingsStartAddressSuggestions = signal<GeocodeResult[]>([]);
  readonly settingsMessage = signal<string | null>(null);
  readonly todaySchedules = computed(() => {
    const today = new Date().toDateString();
    return this.schedules().filter((item) => new Date(item.assignedAt).toDateString() === today);
  });

  readonly tripsControl = new FormControl(2, { nonNullable: true });
  readonly roundTripControl = new FormControl(true, { nonNullable: true });
  readonly unitControl = new FormControl<'miles' | 'km'>('miles', { nonNullable: true });
  private readonly trips = signal(2);
  private readonly roundTrip = signal(true);
  private readonly unit = signal<'miles' | 'km'>('miles');
  private readonly workerSearch = signal('');
  private readonly settingsStartAddress = signal(this.settingsStartAddressControl.value);
  private readonly scheduleFilterWorkerId = signal(this.firstWorkerId());
  private readonly scheduleDate = signal(this.formatDateInput(this.today));
  private readonly scheduleSearch = signal('');
  private readonly reportFromDate = signal(this.formatDateInput(this.today));
  private readonly reportToDate = signal(this.formatDateInput(this.today));
  private readonly reportWorkerId = signal('all');
  private readonly reportSearch = signal('');
  private readonly messageDurationMs = 10000;
  private readonly messageTimers = new Map<WritableSignal<string | null>, ReturnType<typeof setTimeout>>();
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;
  private noticeId = 0;

  readonly selectedScheduleFilterWorker = computed(
    () => this.workers().find((worker) => worker.id === this.scheduleFilterWorkerId()) ?? null
  );

  readonly filteredWorkers = computed(() => {
    const query = this.workerSearch().trim().toLowerCase();
    if (!query) return this.workers();

    return this.workers().filter((worker) =>
      [worker.name, worker.email, worker.phone, worker.area, worker.homeAddress ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  });

  readonly configuredStartAddress = computed(() => this.settingsStartAddress().trim());

  readonly filteredSchedules = computed(() => {
    const workerId = this.scheduleFilterWorkerId();
    const date = this.scheduleDate();
    const query = this.scheduleSearch().trim().toLowerCase();

    return this.schedules().filter((item) => {
      const matchesWorker = item.workerIds.includes(workerId);
      const matchesDate = this.formatDateInput(new Date(item.assignedAt)) === date;
      const searchable = [
        item.destinationLabel,
        item.originLabel,
        item.clientLabel,
        item.notes,
        ...item.workerNames,
        item.startTime,
        item.endTime
      ].join(' ').toLowerCase();

      return (!workerId || matchesWorker) && matchesDate && (!query || searchable.includes(query));
    });
  });

  readonly pendingSchedules = computed(() =>
    this.filteredSchedules().filter((item) => item.status === 'pending')
  );

  readonly completedSchedules = computed(() =>
    this.filteredSchedules().filter((item) => item.status === 'completed')
  );

  readonly reportVisits = computed(() => {
    const from = this.dateOnlyTime(this.reportFromDate(), false);
    const to = this.dateOnlyTime(this.reportToDate(), true);
    const workerId = this.reportWorkerId();
    const query = this.reportSearch().trim().toLowerCase();

    return this.schedules().filter((item) => {
      const time = new Date(item.assignedAt).getTime();
      const matchesDate = time >= from && time <= to;
      const matchesWorker = workerId === 'all' || item.workerIds.includes(workerId);
      const searchable = [
        item.originLabel,
        item.destinationLabel,
        item.clientLabel,
        item.notes,
        ...item.workerNames,
        item.startTime,
        item.endTime
      ].join(' ').toLowerCase();

      return matchesDate && matchesWorker && (!query || searchable.includes(query));
    });
  });

  readonly reportRows = computed<WorkerReportRow[]>(() => {
    const rows = new Map<string, WorkerReportRow>();

    for (const visit of this.reportVisits()) {
      visit.workerIds.forEach((workerId, index) => {
        const workerName = visit.workerNames[index] ?? this.workerNameById(workerId);
        const row = rows.get(workerId) ?? {
          workerId,
          workerName,
          visits: 0,
          distanceKm: 0,
          firstVisit: visit.startTime,
          lastVisit: visit.endTime
        };

        row.visits += 1;
        row.distanceKm += visit.distanceKm;
        if (visit.startTime < row.firstVisit) row.firstVisit = visit.startTime;
        if (visit.endTime > row.lastVisit) row.lastVisit = visit.endTime;
        rows.set(workerId, row);
      });
    }

    return Array.from(rows.values()).sort((a, b) => a.workerName.localeCompare(b.workerName));
  });

  readonly reportTotalVisits = computed(() =>
    this.reportRows().reduce((total, row) => total + row.visits, 0)
  );

  readonly reportTotalDistanceKm = computed(() =>
    this.reportRows().reduce((total, row) => total + row.distanceKm, 0)
  );

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

    this.scheduleFilterWorkerControl.valueChanges.subscribe((v) => {
      this.scheduleFilterWorkerId.set(v);
      this.selectedScheduleWorkerIds.set([v]);
    });

    this.scheduleDateControl.valueChanges.subscribe((v) => {
      this.scheduleDate.set(v);
    });

    this.scheduleSearchControl.valueChanges.subscribe((v) => {
      this.scheduleSearch.set(v);
    });

    this.workerSearchControl.valueChanges.subscribe((v) => {
      this.workerSearch.set(v);
    });

    this.reportFromControl.valueChanges.subscribe((v) => {
      this.reportFromDate.set(v);
    });

    this.reportToControl.valueChanges.subscribe((v) => {
      this.reportToDate.set(v);
    });

    this.reportWorkerControl.valueChanges.subscribe((v) => {
      this.reportWorkerId.set(v);
    });

    this.reportSearchControl.valueChanges.subscribe((v) => {
      this.reportSearch.set(v);
    });

    this.workerHomeAddressControl.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => this.geocoding.search(q))
      )
      .subscribe({
        next: (results) => this.workerAddressSuggestions.set(results),
        error: () => this.workerAddressSuggestions.set([])
      });

    this.settingsStartAddressControl.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => this.geocoding.search(q))
      )
      .subscribe({
        next: (results) => this.settingsStartAddressSuggestions.set(results),
        error: () => this.settingsStartAddressSuggestions.set([])
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

    this.scheduleDestinationControl.valueChanges
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((q) => this.geocoding.search(q))
      )
      .subscribe({
        next: (results) => this.scheduleDestinationSuggestions.set(results),
        error: () => this.scheduleDestinationSuggestions.set([])
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

    effect(() => {
      const selected = this.scheduleDestinationSelected();
      if (selected && this.scheduleDestinationControl.value !== selected.displayName) {
        this.scheduleDestinationSelected.set(null);
      }
    });

    this.refreshWorkers();
    this.refreshVisits();
  }

  private refreshVisits() {
    this.visitsApi.list().subscribe({
      next: (rows) => this.schedules.set((rows ?? []).map((row) => this.fromVisitResponse(row))),
      error: () =>
        this.showError(this.scheduleFormMessage, 'Could not load visits from the backend.')
    });
  }

  private refreshWorkers() {
    this.workersApi.list().subscribe({
      next: (workers) => {
        const converted = (workers ?? []).map((w) => ({
          id: String(w.id),
          name: w.name,
          email: w.email,
          phone: w.phone ?? '',
          area: w.area ?? '',
          homeAddress: w.homeAddress ?? null
        }));
        this.workers.set(converted);
        this.syncWorkerSelections();
      },
      error: () => {
        this.showError(this.workerFormMessage, 'Could not load workers from the backend.');
        this.workers.set([]);
      }
    });
  }

  dismissNotice() {
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = null;
    this.notice.set(null);
  }

  private showSuccess(target: WritableSignal<string | null>, message: string) {
    this.showTimedMessage(target, message, 'success');
  }

  private showError(target: WritableSignal<string | null>, message: string) {
    this.showTimedMessage(target, message, 'error');
  }

  private showSuccessNotice(message: string) {
    this.showNotice(message, 'success');
  }

  private showTimedMessage(
    target: WritableSignal<string | null>,
    message: string,
    type: AppNotice['type']
  ) {
    const previousTimer = this.messageTimers.get(target);
    if (previousTimer) clearTimeout(previousTimer);

    target.set(message);
    this.showNotice(message, type);

    const messageTimer = setTimeout(() => {
      if (target() === message) target.set(null);
      this.messageTimers.delete(target);
    }, this.messageDurationMs);
    this.messageTimers.set(target, messageTimer);
  }

  private showNotice(message: string, type: AppNotice['type']) {
    const id = ++this.noticeId;
    this.notice.set({ id, type, message });

    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => {
      if (this.notice()?.id === id) this.notice.set(null);
      this.noticeTimer = null;
    }, this.messageDurationMs);
  }

  selectOrigin(result: GeocodeResult) {
    this.originSelected.set(result);
    this.form.controls.origin.setValue(result.displayName);
    this.originSuggestions.set([]);
    this.useSettingsOrigin.set(false); // Clear settings flag when manually selecting
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

  useSettingsAsOrigin() {
    if (this.settingsStartSelected()) {
      this.useSettingsOrigin.set(true);
      this.form.controls.origin.setValue(this.settingsStartSelected()!.displayName);
      this.originSelected.set(null); // Clear manual selection to trigger settings usage
    }
  }

  clearOriginAndUseManual() {
    this.useSettingsOrigin.set(false);
    this.originSelected.set(null);
    this.form.controls.origin.setValue('');
  }

  async submit() {
    this.errorMessage.set(null);
    this.route.set(null);

    this.isRouting.set(true);
    try {
      // Determine which origin to use with priority: manual selection > use settings > manual entry
      let origin: GeocodeResult | null = null;

      // Priority 1: If user manually selected origin on the route page
      if (this.originSelected()) {
        origin = this.originSelected();
      }
      // Priority 2: If user chose to use settings origin
      else if (this.useSettingsOrigin() && this.settingsStartSelected()) {
        origin = this.settingsStartSelected();
        // Update the form to show the settings origin
        this.form.controls.origin.setValue(origin!.displayName, { emitEvent: false });
        this.originSelected.set(origin);
      }
      // Priority 3: Try to resolve from manual entry
      else {
        const originText = this.form.controls.origin.value.trim();
        if (!originText) {
          this.showError(this.errorMessage, 'Enter an origin and destination, or use your settings origin.');
          return;
        }
        origin = await this.ensureSelected(originText, null);
        if (origin) this.originSelected.set(origin);
      }

      // Get destination
      const destinationText = this.form.controls.destination.value.trim();
      if (!destinationText) {
        this.showError(this.errorMessage, 'Enter an origin and destination.');
        return;
      }

      const destination = await this.ensureSelected(
        destinationText,
        this.destinationSelected()
      );

      if (!origin || !destination) {
        this.showError(this.errorMessage, 'Pick a valid origin and destination from the suggestions.');
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
      if (this.pendingScheduleVisit()) {
        this.pendingScheduleVisit.update((pending) =>
          pending
            ? {
                ...pending,
                distanceKm: response.distanceKm,
                durationSeconds: response.durationSeconds,
                geoJson: response.geoJson
              }
            : null
        );
      }
      this.showSuccessNotice('Route calculated successfully.');
    } catch (e: any) {
      this.showError(this.errorMessage, e?.message ?? 'Failed to calculate route.');
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

  async assignRouteToWorker() {
    const route = this.route();
    if (!route) {
      this.showError(this.assignmentMessage, 'Calculate a route before assigning a worker.');
      return;
    }

    const origin = this.originSelected();
    const destination = this.destinationSelected();
    if (!origin || !destination) {
      this.showError(
        this.assignmentMessage,
        'Choose a valid origin and destination before saving this visit.'
      );
      return;
    }

    const workers = this.selectedWorkers(this.selectedRouteWorkerIds());
    if (workers.length === 0) {
      this.showError(this.assignmentMessage, 'Choose at least one worker for this visit.');
      return;
    }

    const assignment: ScheduleAssignment = {
      id: `schedule-${Date.now()}`,
      workerIds: workers.map((worker) => worker.id),
      workerNames: workers.map((worker) => worker.name),
      clientLabel: this.routeClientLabelControl.value.trim() || destination.displayName,
      notes: this.routeNotesControl.value.trim(),
      originLabel: origin.displayName,
      originLat: origin.lat,
      originLon: origin.lon,
      destinationLabel: destination.displayName,
      destinationLat: destination.lat,
      destinationLon: destination.lon,
      distanceKm: route.distanceKm,
      durationSeconds: route.durationSeconds,
      geoJson: route.geoJson,
      startTime: this.routeVisitStartControl.value,
      endTime: this.routeVisitEndControl.value,
      durationMinutes: Math.max(1, Math.round(route.durationSeconds / 60)),
      visitsPerDay: this.normalizedVisitsPerDay(this.routeVisitsPerDayControl.value),
      assignedAt: new Date().toISOString(),
      status: 'pending'
    };

    try {
      const saved = await this.visitsApi.create(this.toVisitPayload(assignment));
      const next = [this.fromVisitResponse(saved), ...this.schedules()];
      this.schedules.set(next);
      
      this.routeClientLabelControl.setValue('');
      this.routeNotesControl.setValue('');
      
      this.showSuccess(
        this.assignmentMessage,
        `${this.workerNamesLabel(workers)} assigned and saved as a visit.`
      );
    } catch (e: any) {
      this.showError(this.assignmentMessage, e?.message ?? 'Failed to save visit to the backend.');
    }
  }

  selectScheduleDestination(result: GeocodeResult) {
    this.scheduleDestinationSelected.set(result);
    this.scheduleDestinationControl.setValue(result.displayName);
    this.scheduleDestinationSuggestions.set([]);
  }

  selectWorkerHomeAddress(result: GeocodeResult) {
    this.workerHomeAddressControl.setValue(result.displayName);
    this.workerAddressSuggestions.set([]);
  }

  selectSettingsStartAddress(result: GeocodeResult) {
    this.settingsStartSelected.set(result);
    this.settingsStartAddressControl.setValue(result.displayName);
    this.settingsStartAddressSuggestions.set([]);
  }

  async saveSettings() {
    const startAddress = this.settingsStartAddressControl.value.trim();
    let selected = this.settingsStartSelected();

    if (!selected || selected.displayName !== startAddress) {
      selected = await this.geocoding.bestMatch(startAddress);
      this.settingsStartSelected.set(selected);
    }

    if (startAddress && !selected) {
      this.showError(
        this.settingsMessage,
        'Pick a valid Zimbabwe place or road from the suggestions.'
      );
      return;
    }

    globalThis.localStorage?.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        startAddress,
        startLat: selected?.lat ?? null,
        startLon: selected?.lon ?? null
      } satisfies AppSettings)
    );
    this.settingsStartAddress.set(startAddress);
    this.settingsStartAddressSuggestions.set([]);
    this.showSuccess(this.settingsMessage, 'Starting address saved.');
  }

  openWorkerForm() {
    this.resetWorkerForm();
    this.isWorkerFormOpen.set(true);
  }

  closeWorkerForm() {
    this.resetWorkerForm();
  }

  async saveWorker() {
    const name = this.workerNameControl.value.trim();
    const email = this.workerEmailControl.value.trim();
    const phone = this.workerPhoneControl.value.trim();
    const area = this.workerAreaControl.value.trim();
    const homeAddress = this.workerHomeAddressControl.value.trim();

    if (!name || !email || !phone || !area) {
      this.showError(this.workerFormMessage, 'Enter a name, email, phone number, and area.');
      return;
    }

    const id = this.editingWorkerId();
    const payload = {
      name,
      email,
      phone,
      area,
      homeAddress: homeAddress || null
    };

    try {
      if (id) {
        // Update existing worker
        await this.workersApi.update(id, payload);
        this.showSuccess(this.workerFormMessage, 'Worker updated.');
      } else {
        // Create new worker
        await this.workersApi.create(payload);
        this.showSuccess(this.workerFormMessage, 'Worker added.');
      }
      this.refreshWorkers();
      this.resetWorkerForm();
    } catch (error) {
      this.showError(this.workerFormMessage, 'Failed to save worker. Please try again.');
    }
  }

  editWorker(worker: CareWorker) {
    this.editingWorkerId.set(worker.id);
    this.isWorkerFormOpen.set(true);
    this.workerNameControl.setValue(worker.name);
    this.workerEmailControl.setValue(worker.email);
    this.workerPhoneControl.setValue(worker.phone);
    this.workerAreaControl.setValue(worker.area);
    this.workerHomeAddressControl.setValue(worker.homeAddress ?? '');
    this.workerFormMessage.set(null);
  }

  async deleteWorker(workerId: string) {
    try {
      await this.workersApi.delete(workerId);

      // Remove from schedules
      this.schedules.update((items) =>
        items.map((item) => {
          if (!item.workerIds.includes(workerId)) return item;
          const workerPairs = item.workerIds
            .map((id, index) => ({ id, name: item.workerNames[index] ?? this.workerNameById(id) }))
            .filter((worker) => worker.id !== workerId);

          return {
            ...item,
            workerIds: workerPairs.map((worker) => worker.id),
            workerNames: workerPairs.map((worker) => worker.name)
          };
        }).filter((item) => item.workerIds.length > 0)
      );

      if (this.editingWorkerId() === workerId) this.resetWorkerForm();
      this.refreshWorkers();
      this.showSuccess(this.workerFormMessage, 'Worker deleted.');
    } catch (error) {
      this.showError(this.workerFormMessage, 'Failed to delete worker. Please try again.');
    }
  }

  async createOrUpdateVisit() {
    const clientLabel = this.scheduleClientLabelControl.value.trim();
    const destinationText = this.scheduleDestinationControl.value.trim();
    if (!clientLabel || !destinationText) {
      this.showError(this.scheduleFormMessage, 'Enter a client label and address.');
      return;
    }

    const workers = this.selectedWorkers(this.selectedScheduleWorkerIds());
    if (workers.length === 0) {
      this.showError(this.scheduleFormMessage, 'Choose at least one worker.');
      return;
    }

    this.scheduleFormMessage.set('Preparing visit details for route confirmation...');
    this.isRouting.set(true);
    try {
      const origin = await this.scheduleOriginForVisit();
      if (!origin) {
        this.showError(
          this.scheduleFormMessage,
          'Set a valid starting address in Settings before adding visits.'
        );
        return;
      }

      const destination = await this.ensureSelected(
        destinationText,
        this.scheduleDestinationSelected()
      );

      if (!destination) {
        this.showError(this.scheduleFormMessage, 'Pick a valid visit address from the suggestions.');
        return;
      }

      const editingId = this.editingScheduleId();
      if (editingId) {
        const request = {
          origin: { lat: origin.lat, lon: origin.lon, label: origin.displayName },
          destination: { lat: destination.lat, lon: destination.lon, label: destination.displayName },
          algorithm: 'astar' as const
        };
        const response = await this.routes.computeRoute(request);
        const visit = this.buildScheduleVisit(editingId, workers, origin, destination, response);
        const saved = await this.visitsApi.update(editingId, this.toVisitPayload(visit));
        
        const mapped = this.fromVisitResponse(saved);
        this.schedules.update(items => items.map(item => item.id === editingId ? mapped : item));
        
        this.resetScheduleForm();
        this.showSuccess(this.scheduleFormMessage, 'Visit updated successfully.');
        return;
      }

      const pending = this.buildPendingScheduleVisit(
        null,
        workers,
        origin,
        destination
      );

      this.pendingScheduleVisit.set(pending);
      this.selectedRouteWorkerIds.set(workers.map((worker) => worker.id));
      this.originSelected.set(origin);
      this.destinationSelected.set(destination);
      this.form.controls.origin.setValue(origin.displayName, { emitEvent: false });
      this.form.controls.destination.setValue(destination.displayName, { emitEvent: false });
      this.route.set(null);
      this.resetScheduleForm();
      this.setActivePage('route');
      this.assignmentMessage.set(
        `A pending visit for ${pending.clientLabel} is ready. Calculate the route and confirm it to save.`
      );
      this.showSuccess(this.scheduleFormMessage, 'Visit details forwarded to the Route page.');
    } catch (e: any) {
      this.showError(this.scheduleFormMessage, e?.message ?? 'Failed to prepare the visit.');
    } finally {
      this.isRouting.set(false);
    }
  }

  async confirmPendingVisit() {
    const pending = this.pendingScheduleVisit();
    if (!pending) return;

    const route = this.route();
    if (!route) {
      this.showError(this.assignmentMessage, 'Calculate the route before confirming this visit.');
      return;
    }

    try {
      const visit = {
        ...pending,
        distanceKm: route.distanceKm,
        durationSeconds: route.durationSeconds,
        geoJson: route.geoJson
      };

      const id = this.editingScheduleId();
      const saved = id
        ? await this.visitsApi.update(id, this.toVisitPayload(visit))
        : await this.visitsApi.create(this.toVisitPayload(visit));

      const mapped: ScheduleAssignment = {
        id: String(saved.id),
        workerIds: saved.workerIds ?? [],
        workerNames: saved.workerNames ?? [],
        clientLabel: visit.clientLabel,
        notes: visit.notes,
        originLabel: saved.originLabel ?? saved.origin?.label ?? 'Origin',
        originLat: Number(saved.originLat ?? saved.origin?.lat ?? 0),
        originLon: Number(saved.originLon ?? saved.origin?.lon ?? 0),
        destinationLabel: saved.destinationLabel ?? saved.destination?.label ?? 'Destination',
        destinationLat: Number(saved.destinationLat ?? saved.destination?.lat ?? 0),
        destinationLon: Number(saved.destinationLon ?? saved.destination?.lon ?? 0),
        distanceKm: visit.distanceKm,
        durationSeconds: visit.durationSeconds,
        geoJson: visit.geoJson,
        startTime: visit.startTime,
        endTime: visit.endTime,
        durationMinutes: visit.durationMinutes,
        visitsPerDay: visit.visitsPerDay,
        assignedAt: visit.assignedAt,
        status: visit.status
      };
      const next = id
        ? this.schedules().map((item) => (item.id === id ? mapped : item))
        : [mapped, ...this.schedules()];

      this.schedules.set(next);
      this.pendingScheduleVisit.set(null);
      this.resetScheduleForm();
      this.showSuccess(this.assignmentMessage, 'Visit confirmed and saved to Schedule.');
      this.showSuccess(this.scheduleFormMessage, id ? 'Visit updated.' : 'Visit created.');
    } catch (e: any) {
      this.showError(this.assignmentMessage, e?.message ?? 'Failed to save visit to the backend.');
    }
  }

  cancelPendingVisit() {
    this.pendingScheduleVisit.set(null);
    this.showSuccess(this.assignmentMessage, 'Visit confirmation cancelled.');
  }

  private buildScheduleVisit(
    id: string | null,
    workers: CareWorker[],
    origin: GeocodeResult,
    destination: GeocodeResult,
    response: RouteResponse
  ): ScheduleAssignment {
    const durationMinutes = Math.max(1, Math.floor(Number(this.scheduleDurationControl.value) || 30));
    const startTime = this.scheduleVisitTimeControl.value;

    return {
      id: id ?? `schedule-${Date.now()}`,
      workerIds: workers.map((worker) => worker.id),
      workerNames: workers.map((worker) => worker.name),
      clientLabel: this.scheduleClientLabelControl.value.trim(),
      notes: this.scheduleNotesControl.value.trim(),
      originLabel: origin.displayName,
      originLat: origin.lat,
      originLon: origin.lon,
      destinationLabel: destination.displayName,
      destinationLat: destination.lat,
      destinationLon: destination.lon,
      distanceKm: response.distanceKm,
      durationSeconds: response.durationSeconds,
      geoJson: response.geoJson,
      startTime,
      endTime: this.addMinutesToTime(startTime, durationMinutes),
      durationMinutes,
      visitsPerDay: 1,
      assignedAt: this.scheduleDateToIso(this.scheduleDateControl.value),
      status: 'pending'
    };
  }

  private buildPendingScheduleVisit(
    id: string | null,
    workers: CareWorker[],
    origin: GeocodeResult,
    destination: GeocodeResult
  ): ScheduleAssignment {
    const durationMinutes = Math.max(1, Math.floor(Number(this.scheduleDurationControl.value) || 30));
    const startTime = this.scheduleVisitTimeControl.value;

    return {
      id: id ?? `schedule-${Date.now()}`,
      workerIds: workers.map((worker) => worker.id),
      workerNames: workers.map((worker) => worker.name),
      clientLabel: this.scheduleClientLabelControl.value.trim(),
      notes: this.scheduleNotesControl.value.trim(),
      originLabel: origin.displayName,
      originLat: origin.lat,
      originLon: origin.lon,
      destinationLabel: destination.displayName,
      destinationLat: destination.lat,
      destinationLon: destination.lon,
      distanceKm: 0,
      durationSeconds: 0,
      geoJson: null,
      startTime,
      endTime: this.addMinutesToTime(startTime, durationMinutes),
      durationMinutes,
      visitsPerDay: 1,
      assignedAt: this.scheduleDateToIso(this.scheduleDateControl.value),
      status: 'pending'
    };
  }

  editVisit(item: ScheduleAssignment) {
    this.editingScheduleId.set(item.id);
    this.isScheduleFormOpen.set(true);
    this.scheduleClientLabelControl.setValue(item.clientLabel || item.destinationLabel);
    this.scheduleDestinationControl.setValue(item.destinationLabel);
    this.scheduleVisitTimeControl.setValue(item.startTime);
    this.scheduleDurationControl.setValue(item.durationMinutes || Math.max(1, Math.round(item.durationSeconds / 60) || 30));
    this.scheduleNotesControl.setValue(item.notes ?? '');
    this.scheduleDateControl.setValue(this.formatDateInput(new Date(item.assignedAt)));
    this.selectedScheduleWorkerIds.set([...item.workerIds]);
    this.scheduleFormMessage.set(null);
  }

  deleteVisit(id: string) {
    this.visitsApi
      .delete(id)
      .then(() => {
        const next = this.schedules().filter((item) => item.id !== id);
        this.schedules.set(next);
        if (this.editingScheduleId() === id) this.resetScheduleForm();
        this.showSuccess(this.scheduleFormMessage, 'Visit deleted.');
      })
      .catch(() => this.showError(this.scheduleFormMessage, 'Failed to delete visit from the backend.'));
  }

  toggleVisitStatus(id: string) {
    const schedules = this.schedules();
    const visit = schedules.find((item) => item.id === id);
    if (!visit) return;

    const newStatus: 'pending' | 'completed' = visit.status === 'pending' ? 'completed' : 'pending';
    const updatedVisit = { ...visit, status: newStatus };

    // Update locally first
    const next = schedules.map((item) => (item.id === id ? updatedVisit : item));
    this.schedules.set(next);

    // Update on backend
    this.visitsApi
      .update(id, this.toVisitPayload(updatedVisit))
      .then(() =>
        this.showSuccess(
          this.scheduleFormMessage,
          newStatus === 'completed' ? 'Visit marked as completed.' : 'Visit marked as pending.'
        )
      )
      .catch(() => {
        // Revert on error
        this.schedules.set(schedules);
        this.showError(this.scheduleFormMessage, 'Failed to update visit status.');
      });
  }

  resetScheduleForm() {
    this.editingScheduleId.set(null);
    this.isScheduleFormOpen.set(false);
    this.scheduleClientLabelControl.setValue('');
    this.scheduleDestinationControl.setValue('');
    this.scheduleVisitTimeControl.setValue('09:00');
    this.scheduleDurationControl.setValue(30);
    this.scheduleNotesControl.setValue('');
    this.selectedScheduleWorkerIds.set(this.scheduleFilterWorkerId() ? [this.scheduleFilterWorkerId()] : this.firstWorkerIdList());
    this.scheduleOriginSelected.set(null);
    this.scheduleDestinationSelected.set(null);
    this.scheduleFormMessage.set(null);
  }

  openScheduleForm() {
    this.resetScheduleForm();
    const workerId = this.scheduleFilterWorkerControl.value;
    this.selectedScheduleWorkerIds.set([workerId]);
    this.isScheduleFormOpen.set(true);
  }

  closeScheduleForm() {
    this.resetScheduleForm();
  }

  toggleRouteWorker(workerId: string) {
    this.selectedRouteWorkerIds.update((ids) => this.toggleWorkerId(ids, workerId));
  }

  toggleScheduleWorker(workerId: string) {
    this.selectedScheduleWorkerIds.update((ids) => this.toggleWorkerId(ids, workerId));
  }

  isRouteWorkerSelected(workerId: string): boolean {
    return this.selectedRouteWorkerIds().includes(workerId);
  }

  isScheduleWorkerSelected(workerId: string): boolean {
    return this.selectedScheduleWorkerIds().includes(workerId);
  }

  async viewVisitOnMap(item: ScheduleAssignment) {
    this.route.set(
      item.geoJson
        ? {
            distanceKm: item.distanceKm,
            durationSeconds: item.durationSeconds,
            geoJson: item.geoJson
          }
        : null
    );
    this.destinationSelected.set({
      displayName: item.destinationLabel,
      lat: item.destinationLat,
      lon: item.destinationLon
    });
    this.form.controls.destination.setValue(item.destinationLabel, { emitEvent: false });

    const origin = await this.scheduleOriginForVisit();
    if (!origin) return;
    this.originSelected.set(origin);
    this.form.controls.origin.setValue(origin.displayName, { emitEvent: false });
    this.setActivePage('route');
  }

  workerNamesLabel(workersOrNames: CareWorker[] | string[]): string {
    const names =
      typeof workersOrNames[0] === 'string'
        ? (workersOrNames as string[])
        : (workersOrNames as CareWorker[]).map((worker) => worker.name);

    return names.join(', ');
  }

  formatMiles(distanceKm: number): string {
    const milesPerKm = 0.621371;
    return `${(distanceKm * milesPerKm).toFixed(2)} miles`;
  }

  private formatDistance(distanceKm: number): string {
    const unit = this.unit();
    if (unit === 'km') return `${distanceKm.toFixed(2)} km`;
    const milesPerKm = 0.621371;
    return `${(distanceKm * milesPerKm).toFixed(2)} miles`;
  }

  setActivePage(page: AppPage) {
    this.activePage.set(page);
  }

  toggleSidebar() {
    this.isSidebarCollapsed.update((collapsed) => !collapsed);
  }

  private formatDateInput(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private scheduleDateToIso(value: string): string {
    const [year, month, day] = value.split('-').map((part) => Number(part));
    const date = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(year, month - 1, day)
      : new Date();

    const now = new Date();
    date.setHours(now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
    return date.toISOString();
  }

  private selectedWorkers(ids: string[]): CareWorker[] {
    return this.workers().filter((worker) => ids.includes(worker.id));
  }

  private toggleWorkerId(ids: string[], workerId: string): string[] {
    if (ids.includes(workerId)) {
      const next = ids.filter((id) => id !== workerId);
      return next.length > 0 ? next : ids;
    }

    return [...ids, workerId];
  }

  private normalizedVisitsPerDay(value: number): number {
    return Math.max(1, Math.floor(Number(value) || 1));
  }

  private toVisitPayload(item: ScheduleAssignment): VisitPayload {
    return {
      origin: { label: item.originLabel, lat: item.originLat, lon: item.originLon },
      destination: {
        label: item.destinationLabel,
        lat: item.destinationLat,
        lon: item.destinationLon
      },
      workerIds: item.workerIds,
      workerNames: item.workerNames,
      startTime: item.startTime,
      endTime: item.endTime,
      visitsPerDay: item.visitsPerDay,
      distanceKm: item.distanceKm,
      durationSeconds: item.durationSeconds,
      geoJson: item.geoJson,
      clientLabel: item.clientLabel,
      durationMinutes: item.durationMinutes,
      notes: item.notes,
      scheduledDate: item.assignedAt
    };
  }

  private fromVisitResponse(row: VisitResponse): ScheduleAssignment {
    return {
      id: String(row.id),
      workerIds: row.workerIds ?? [],
      workerNames: row.workerNames ?? [],
      clientLabel: String(row.clientLabel ?? row.destinationLabel ?? row.destination?.label ?? 'Visit'),
      notes: String(row.notes ?? ''),
      originLabel: row.originLabel ?? row.origin?.label ?? 'Origin',
      originLat: Number(row.originLat ?? row.origin?.lat ?? 0),
      originLon: Number(row.originLon ?? row.origin?.lon ?? 0),
      destinationLabel: row.destinationLabel ?? row.destination?.label ?? 'Destination',
      destinationLat: Number(row.destinationLat ?? row.destination?.lat ?? 0),
      destinationLon: Number(row.destinationLon ?? row.destination?.lon ?? 0),
      distanceKm: Number(row.distanceKm ?? 0),
      durationSeconds: Number(row.durationSeconds ?? 0),
      geoJson: row.geoJson ?? null,
      startTime: String(row.startTime ?? '13:00'),
      endTime: String(row.endTime ?? '14:00'),
      durationMinutes: this.normalizedVisitsPerDay(row.durationMinutes ?? Math.round(Number(row.durationSeconds ?? 1800) / 60)),
      visitsPerDay: this.normalizedVisitsPerDay(row.visitsPerDay ?? 1),
      assignedAt: String(row.scheduledDate ?? row.createdAt ?? new Date().toISOString()),
      status: 'pending' as const
    };
  }

  private async scheduleOriginForVisit(): Promise<GeocodeResult | null> {
    const selected = this.settingsStartSelected();
    if (selected) return selected;

    const startAddress = this.configuredStartAddress();
    if (!startAddress) return null;

    const found = await this.geocoding.bestMatch(startAddress);
    if (found) this.settingsStartSelected.set(found);
    return found;
  }

  private addMinutesToTime(time: string, minutes: number): string {
    const [hours = 0, mins = 0] = time.split(':').map((part) => Number(part));
    const date = new Date(2000, 0, 1, hours, mins);
    date.setMinutes(date.getMinutes() + minutes);
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }

  private firstWorkerId(): string {
    return this.workers()?.[0]?.id ?? '';
  }

  private firstWorkerIdList(): string[] {
    const id = this.firstWorkerId();
    return id ? [id] : [];
  }

  private workerNameById(workerId: string): string {
    return this.workers().find((worker) => worker.id === workerId)?.name ?? 'Unknown worker';
  }

  private resetWorkerForm() {
    this.editingWorkerId.set(null);
    this.isWorkerFormOpen.set(false);
    this.workerNameControl.setValue('');
    this.workerEmailControl.setValue('');
    this.workerPhoneControl.setValue('');
    this.workerAreaControl.setValue('');
    this.workerHomeAddressControl.setValue('');
    this.workerAddressSuggestions.set([]);
    this.workerFormMessage.set(null);
  }

  private syncWorkerSelections() {
    const ids = new Set(this.workers().map((worker) => worker.id));
    const fallback = this.firstWorkerIdList();
    const cleanRouteIds = this.selectedRouteWorkerIds().filter((id) => ids.has(id));
    const cleanScheduleIds = this.selectedScheduleWorkerIds().filter((id) => ids.has(id));

    this.selectedRouteWorkerIds.set(cleanRouteIds.length > 0 ? cleanRouteIds : fallback);
    this.selectedScheduleWorkerIds.set(cleanScheduleIds.length > 0 ? cleanScheduleIds : fallback);

    if (!ids.has(this.scheduleFilterWorkerControl.value)) {
      this.scheduleFilterWorkerControl.setValue(fallback[0] ?? '');
    }

    if (this.reportWorkerControl.value !== 'all' && !ids.has(this.reportWorkerControl.value)) {
      this.reportWorkerControl.setValue('all');
    }
  }

  private loadSettingsStartAddress(): string {
    try {
      const raw = globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return '';
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return typeof parsed.startAddress === 'string' ? parsed.startAddress : '';
    } catch {
      return '';
    }
  }

  private loadSettingsStartLocation(): GeocodeResult | null {
    try {
      const raw = globalThis.localStorage?.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      const lat = Number(parsed.startLat);
      const lon = Number(parsed.startLon);

      if (!parsed.startAddress || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

      return {
        displayName: parsed.startAddress,
        lat,
        lon
      };
    } catch {
      return null;
    }
  }

  private dateOnlyTime(value: string, endOfDay: boolean): number {
    const [year, month, day] = value.split('-').map((part) => Number(part));
    const date = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(year, month - 1, day)
      : new Date();

    date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, endOfDay ? 999 : 0);
    return date.getTime();
  }
}

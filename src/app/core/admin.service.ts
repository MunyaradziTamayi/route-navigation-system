import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_ENDPOINTS } from './api.config';

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);

  resetDatabase(): Promise<void> {
    return firstValueFrom(this.http.post<void>(API_ENDPOINTS.resetDatabase(), {}));
  }
}

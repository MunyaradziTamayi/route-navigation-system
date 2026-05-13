import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_ENDPOINTS } from './api.config';

export type AuthUser = {
  id: number | string;
  name: string;
  email: string;
  createdAt: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type RegisterPayload = LoginPayload & {
  name: string;
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  async login(payload: LoginPayload): Promise<AuthUser> {
    try {
      return await firstValueFrom(this.http.post<AuthUser>(API_ENDPOINTS.login(), payload));
    } catch (error) {
      throw new Error(this.errorMessage(error, 'Login failed. Please try again.'));
    }
  }

  async register(payload: RegisterPayload): Promise<AuthUser> {
    try {
      return await firstValueFrom(this.http.post<AuthUser>(API_ENDPOINTS.register(), payload));
    } catch (error) {
      throw new Error(this.errorMessage(error, 'Registration failed. Please try again.'));
    }
  }

  private errorMessage(error: unknown, fallback: string): string {
    if (error instanceof HttpErrorResponse) {
      const message = error.error?.message;
      if (typeof message === 'string' && message.trim()) return message;
      if (error.status === 0) return 'Could not connect to the backend. Check that the API is running.';
    }

    return fallback;
  }
}

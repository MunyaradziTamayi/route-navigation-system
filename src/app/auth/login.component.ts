import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService, type AuthUser } from '../core/auth.service';

type AuthMode = 'login' | 'register';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.css'
})
export class LoginComponent {
  private readonly auth = inject(AuthService);

  @Output() readonly loginSuccess = new EventEmitter<AuthUser>();

  readonly mode = signal<AuthMode>('login');
  readonly isSubmitting = signal(false);
  readonly loginMessage = signal<string | null>(null);

  readonly loginForm = new FormGroup({
    name: new FormControl('', {
      nonNullable: true
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)]
    })
  });

  setMode(mode: AuthMode) {
    this.mode.set(mode);
    this.loginMessage.set(null);
  }

  async submitAuth() {
    if (this.isSubmitting()) return;

    this.loginForm.markAllAsTouched();
    if (this.loginForm.controls.email.invalid || this.loginForm.controls.password.invalid) {
      this.loginMessage.set('Enter a valid email and a password of at least 6 characters.');
      return;
    }

    const name = this.loginForm.controls.name.value.trim();
    const email = this.loginForm.controls.email.value.trim().toLowerCase();
    const password = this.loginForm.controls.password.value;

    if (this.mode() === 'register' && !name) {
      this.loginMessage.set('Enter your name to create an account.');
      return;
    }

    this.isSubmitting.set(true);
    this.loginMessage.set(null);

    try {
      const user = this.mode() === 'register'
        ? await this.auth.register({ name, email, password })
        : await this.auth.login({ email, password });
      this.loginSuccess.emit(user);
    } catch (error) {
      this.loginMessage.set(error instanceof Error ? error.message : 'Authentication failed.');
    } finally {
      this.isSubmitting.set(false);
    }
  }
}

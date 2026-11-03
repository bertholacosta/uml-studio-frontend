import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap, catchError, throwError, map } from 'rxjs';
import { User } from '../models/user.model';
import { LoginRequest, RegisterRequest, AuthResponse, ApiResponse } from '../models/auth.model';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly apiUrl = `${environment.apiUrl}/auth`;
  private readonly TOKEN_KEY = 'uml_studio_token';
  private readonly USER_KEY = 'uml_studio_user';

  // Signals para estado reactivo
  readonly currentUser = signal<User | null>(this.getStoredUser());
  readonly token = signal<string | null>(this.getStoredToken());
  readonly isAuthenticated = computed(() => !!this.token() && !!this.currentUser());
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  constructor() {
    // Si tenemos token guardado pero no usuario, intentar recuperar el perfil
    if (this.token() && !this.currentUser()) {
      this.fetchProfile().subscribe({
        error: () => this.logout(),
      });
    }
  }

  register(payload: RegisterRequest): Observable<AuthResponse> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.http.post<ApiResponse<AuthResponse>>(`${this.apiUrl}/register`, payload).pipe(
      map((res) => res.data),
      tap((authData) => {
        this.setSession(authData.accessToken, authData.user);
        this.isLoading.set(false);
      }),
      catchError((err) => {
        this.isLoading.set(false);
        const msg =
          err.error?.error?.message || err.error?.message || 'Error al registrar la cuenta';
        this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        return throwError(() => err);
      }),
    );
  }

  login(payload: LoginRequest): Observable<AuthResponse> {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    return this.http.post<ApiResponse<AuthResponse>>(`${this.apiUrl}/login`, payload).pipe(
      map((res) => res.data),
      tap((authData) => {
        this.setSession(authData.accessToken, authData.user);
        this.isLoading.set(false);
      }),
      catchError((err) => {
        this.isLoading.set(false);
        const msg =
          err.error?.error?.message || err.error?.message || 'Correo o contraseña incorrectos';
        this.errorMessage.set(Array.isArray(msg) ? msg.join(', ') : msg);
        return throwError(() => err);
      }),
    );
  }

  fetchProfile(): Observable<User> {
    return this.http.get<ApiResponse<User>>(`${this.apiUrl}/me`).pipe(
      map((res) => res.data),
      tap((user) => {
        this.currentUser.set(user);
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      }),
    );
  }

  updateProfile(payload: { fullName?: string; password?: string }): Observable<User> {
    return this.http.patch<ApiResponse<User>>(`${this.apiUrl}/me`, payload).pipe(
      map((res) => res.data),
      tap((user) => {
        this.currentUser.set(user);
        localStorage.setItem(this.USER_KEY, JSON.stringify(user));
      }),
    );
  }

  logout(): void {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this.token.set(null);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  private setSession(token: string, user: User): void {
    localStorage.setItem(this.TOKEN_KEY, token);
    localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    this.token.set(token);
    this.currentUser.set(user);
  }

  private getStoredToken(): string | null {
    return localStorage.getItem(this.TOKEN_KEY);
  }

  private getStoredUser(): User | null {
    const raw = localStorage.getItem(this.USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
}

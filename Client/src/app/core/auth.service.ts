import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap, shareReplay, finalize, catchError, of, map } from 'rxjs';
import { API, AuthResponse, User } from './models';

const ACCESS = 'ecom_access';
const REFRESH = 'ecom_refresh';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string | null) => {
  try {
    v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private refreshing$: Observable<string> | null = null;

  readonly user = signal<User | null>(null);
  readonly isLoggedIn = computed(() => !!this.user());
  readonly isAdmin = computed(() => this.user()?.role === 'admin');
  readonly ready = signal(false);

  get accessToken() {
    return read(ACCESS);
  }
  get refreshToken() {
    return read(REFRESH);
  }

  /** Called once at startup: restores the session from stored tokens. */
  init(): Observable<unknown> {
    if (!this.accessToken && !this.refreshToken) {
      this.ready.set(true);
      return of(null);
    }
    return this.http.get<User>(`${API}/auth/me`).pipe(
      tap((u) => this.user.set(u)),
      catchError(() => of(null)),
      finalize(() => this.ready.set(true)),
    );
  }

  login(email: string, password: string) {
    return this.http
      .post<AuthResponse>(`${API}/auth/login`, { email, password })
      .pipe(tap((r) => this.store(r)));
  }
  register(body: Record<string, unknown>) {
    return this.http
      .post<AuthResponse>(`${API}/auth/register`, body)
      .pipe(tap((r) => this.store(r)));
  }
  changePassword(currentPassword: string, newPassword: string) {
    return this.http
      .post<AuthResponse>(`${API}/auth/change-password`, { currentPassword, newPassword })
      .pipe(tap((r) => this.store(r)));
  }
  updateProfile(body: Record<string, unknown>) {
    return this.http.put<User>(`${API}/users/me`, body).pipe(tap((u) => this.user.set(u)));
  }

  logout() {
    const refreshToken = this.refreshToken;
    if (this.accessToken)
      this.http
        .post(`${API}/auth/logout`, { refreshToken })
        .pipe(catchError(() => of(null)))
        .subscribe();
    this.clear();
    this.router.navigateByUrl('/');
  }

  /** Single in-flight refresh shared by all failing requests. */
  refresh(): Observable<string> {
    if (!this.refreshing$) {
      this.refreshing$ = this.http
        .post<AuthResponse>(`${API}/auth/refresh`, { refreshToken: this.refreshToken })
        .pipe(
          tap((r) => this.store(r)),
          map((r) => r.accessToken),
          finalize(() => (this.refreshing$ = null)),
          shareReplay(1),
        );
    }
    return this.refreshing$;
  }

  clear() {
    write(ACCESS, null);
    write(REFRESH, null);
    this.user.set(null);
  }

  private store(r: AuthResponse) {
    write(ACCESS, r.accessToken);
    write(REFRESH, r.refreshToken);
    this.user.set(r.user);
  }
}

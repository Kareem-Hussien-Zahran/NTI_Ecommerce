import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { API, User } from './models';

const user = { _id: '1', role: 'customer' } as User;

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    localStorage.setItem('ecom_access', 'OLD');
    localStorage.setItem('ecom_refresh', 'RT');
  });
  afterEach(() => ctrl.verify());

  it('adds the bearer token to API calls only', () => {
    http.get(`${API}/cart`).subscribe();
    expect(ctrl.expectOne(`${API}/cart`).request.headers.get('Authorization')).toBe('Bearer OLD');
    http.get('https://other.example/x').subscribe();
    expect(ctrl.expectOne('https://other.example/x').request.headers.has('Authorization')).toBe(
      false,
    );
  });

  it('refreshes once on 401 and retries the original request with the new token', () => {
    let result: unknown;
    http.get(`${API}/cart`).subscribe((r) => (result = r));
    ctrl.expectOne(`${API}/cart`).flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne(`${API}/auth/refresh`).flush({ accessToken: 'NEW', refreshToken: 'RT2', user });
    const retry = ctrl.expectOne(`${API}/cart`);
    expect(retry.request.headers.get('Authorization')).toBe('Bearer NEW');
    retry.flush({ ok: true });
    expect(result).toEqual({ ok: true });
    expect(auth.refreshToken).toBe('RT2');
  });

  it('shares a single refresh between concurrent 401s', () => {
    http.get(`${API}/a`).subscribe();
    http.get(`${API}/b`).subscribe();
    ctrl.expectOne(`${API}/a`).flush({}, { status: 401, statusText: '' });
    ctrl.expectOne(`${API}/b`).flush({}, { status: 401, statusText: '' });
    const refreshes = ctrl.match(`${API}/auth/refresh`);
    expect(refreshes.length).toBe(1);
    refreshes[0].flush({ accessToken: 'NEW', refreshToken: 'RT2', user });
    ctrl.expectOne(`${API}/a`).flush({});
    ctrl.expectOne(`${API}/b`).flush({});
  });

  it('logs out and redirects to /login when the refresh fails', () => {
    const nav = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    let failed = false;
    http.get(`${API}/cart`).subscribe({ error: () => (failed = true) });
    ctrl.expectOne(`${API}/cart`).flush({}, { status: 401, statusText: '' });
    ctrl.expectOne(`${API}/auth/refresh`).flush({}, { status: 401, statusText: '' });
    expect(failed).toBe(true);
    expect(auth.accessToken).toBeNull();
    expect(nav).toHaveBeenCalledWith(['/login'], expect.anything());
  });

  it('does not try to refresh for failed logins', () => {
    http.post(`${API}/auth/login`, {}).subscribe({ error: () => undefined });
    ctrl.expectOne(`${API}/auth/login`).flush({ message: 'bad' }, { status: 401, statusText: '' });
    ctrl.expectNone(`${API}/auth/refresh`);
  });

  it('passes non-401 errors straight through', () => {
    let status = 0;
    http.get(`${API}/x`).subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne(`${API}/x`).flush({}, { status: 500, statusText: '' });
    expect(status).toBe(500);
  });
});

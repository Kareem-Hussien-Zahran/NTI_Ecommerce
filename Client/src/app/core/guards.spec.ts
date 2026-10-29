import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import {
  ActivatedRouteSnapshot,
  Router,
  RouterStateSnapshot,
  UrlTree,
  provideRouter,
} from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './guards';
import { AuthService } from './auth.service';
import { User } from './models';

const run = (guard: typeof authGuard, url = '/x') =>
  TestBed.runInInjectionContext(() =>
    guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot),
  );

describe('route guards', () => {
  let auth: AuthService;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
  });
  const as = (role: User['role'] | null) =>
    auth.user.set(role ? ({ _id: '1', role } as User) : null);
  const target = (r: unknown) => TestBed.inject(Router).serializeUrl(r as UrlTree);

  it('authGuard lets signed-in users through', () => {
    as('customer');
    expect(run(authGuard)).toBe(true);
  });
  it('authGuard redirects anonymous users to /login with returnUrl', () => {
    as(null);
    expect(target(run(authGuard, '/checkout'))).toBe('/login?returnUrl=%2Fcheckout');
  });
  it('adminGuard only admits admins', () => {
    as('admin');
    expect(run(adminGuard)).toBe(true);
    as('customer');
    expect(target(run(adminGuard))).toBe('/');
    as(null);
    expect(target(run(adminGuard))).toBe('/');
  });
  it('guestGuard keeps signed-in users away from login/register', () => {
    as(null);
    expect(run(guestGuard)).toBe(true);
    as('customer');
    expect(target(run(guestGuard))).toBe('/');
  });
});

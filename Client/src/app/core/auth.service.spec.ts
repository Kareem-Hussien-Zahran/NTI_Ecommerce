import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from './auth.service';
import { API, User } from './models';

const user = {
  _id: '1',
  firstName: 'A',
  lastName: 'B',
  fullName: 'A B',
  email: 'a@b.c',
  role: 'admin',
  status: 'active',
  createdAt: '',
} as User;

describe('AuthService', () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  it('stores tokens and exposes the user after login', () => {
    auth.login('a@b.c', 'pw').subscribe();
    http.expectOne(`${API}/auth/login`).flush({ accessToken: 'AT', refreshToken: 'RT', user });
    expect(auth.accessToken).toBe('AT');
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.isAdmin()).toBe(true);
  });

  it('clear() removes the session', () => {
    auth.login('a@b.c', 'pw').subscribe();
    http.expectOne(`${API}/auth/login`).flush({ accessToken: 'AT', refreshToken: 'RT', user });
    auth.clear();
    expect(auth.accessToken).toBeNull();
    expect(auth.isLoggedIn()).toBe(false);
  });
});

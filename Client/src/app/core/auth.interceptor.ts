import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';

const isAuthCall = (url: string) => /\/auth\/(login|register|refresh)/.test(url);
const withToken = (req: HttpRequest<unknown>, t: string | null) =>
  t ? req.clone({ setHeaders: { Authorization: `Bearer ${t}` } }) : req;

/** Adds the bearer token and transparently refreshes it once on a 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api')) return next(req);
  const auth = inject(AuthService);
  const router = inject(Router);

  return next(withToken(req, auth.accessToken)).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status !== 401 || isAuthCall(req.url) || !auth.refreshToken)
        return throwError(() => err);
      return auth.refresh().pipe(
        switchMap((token) => next(withToken(req, token))),
        catchError((e) => {
          auth.clear();
          router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
          return throwError(() => e);
        }),
      );
    }),
  );
};

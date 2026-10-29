import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { SystemPage } from './system';
import { API } from '../../../core/models';

const info = {
  api: { status: 'ok', uptimeSeconds: 3700, node: 'v22', env: 'production', pid: 1 },
  db: { status: 'ok', name: 'shop', collections: { User: 3, Product: 10 } },
  memory: { rssMb: 120, heapUsedMb: 40, heapTotalMb: 60 },
  cache: {
    enabled: true,
    entries: 4,
    maxEntries: 500,
    ttlSeconds: 60,
    hits: 3,
    misses: 1,
    hitRate: 0.75,
  },
  logging: { level: 'info', format: 'json', dbRetentionDays: 90, files: { enabled: false } },
  backup: {
    configured: true,
    state: 'stale',
    intervalHours: 24,
    latestDb: null,
    files: [],
    totalFiles: 0,
  },
  time: '2026-01-01T00:00:00Z',
};
const logs = {
  items: [
    {
      _id: '1',
      type: 'security',
      action: 'auth.login_failed',
      actor: { id: 'u', email: 'x@y.z', role: 'customer' },
      ip: '1.1.1.1',
      createdAt: '2026-01-01T10:00:00Z',
    },
  ],
  meta: { total: 1, page: 1, limit: 20, pages: 1 },
  summary: { last24h: { audit: 5, security: 1, error: 0 } },
};

describe('SystemPage', () => {
  let ctrl: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [SystemPage],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    ctrl = TestBed.inject(HttpTestingController);
  });

  it('loads system info and the log feed and renders health, cache and warnings', async () => {
    const f = TestBed.createComponent(SystemPage);
    f.detectChanges();
    ctrl.expectOne(`${API}/admin/system`).flush(info);
    const logReqs = ctrl.match((r) => r.url === `${API}/admin/logs`);
    expect(logReqs.length).toBe(2); // feed + error tab
    logReqs[0].flush(logs);
    logReqs[1].flush({ ...logs, items: [] });
    await f.whenStable();
    f.detectChanges();
    const text = (f.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('System & logs');
    expect(text).toContain('75%');
    expect(text).toContain('stale');
    expect(text).toContain('1h 1m');
    ctrl.verify();
  });

  it('applies filters as query params and resets to page 1', () => {
    const f = TestBed.createComponent(SystemPage);
    f.detectChanges();
    ctrl.expectOne(`${API}/admin/system`).flush(info);
    ctrl.match((r) => r.url === `${API}/admin/logs`).forEach((r) => r.flush(logs));
    const cmp = f.componentInstance as unknown as {
      form: { patchValue(v: object): void };
      apply(): void;
    };
    cmp.form.patchValue({ type: 'security', q: 'login' });
    cmp.apply();
    const req = ctrl.expectOne((r) => r.url === `${API}/admin/logs`);
    expect(req.request.params.get('type')).toBe('security');
    expect(req.request.params.get('q')).toBe('login');
    expect(req.request.params.get('page')).toBe('1');
    req.flush(logs);
  });
});

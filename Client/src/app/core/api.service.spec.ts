import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Api } from './api.service';
import { API, Named } from './models';

describe('Api', () => {
  let api: Api;
  let ctrl: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(Api);
    ctrl = TestBed.inject(HttpTestingController);
  });
  afterEach(() => ctrl.verify());

  it('drops empty query params but keeps zero and false', () => {
    api.products({ q: '', page: 0, inStock: false, brand: undefined, sort: 'newest' }).subscribe();
    const req = ctrl.expectOne((r) => r.url === `${API}/products`);
    expect(req.request.params.keys().sort()).toEqual(['inStock', 'page', 'sort']);
    expect(req.request.params.get('page')).toBe('0');
    req.flush({ items: [], meta: {} });
  });

  it('caches categories: many callers, one HTTP request', () => {
    const got: Named[][] = [];
    api.categories().subscribe((c) => got.push(c));
    api.categories().subscribe((c) => got.push(c));
    ctrl.expectOne(`${API}/categories`).flush([{ _id: '1', name: 'Tops', slug: 'tops' }]);
    api.categories().subscribe((c) => got.push(c)); // later call, still cached
    expect(got.length).toBe(3);
    ctrl.expectNone(`${API}/categories`);
  });

  it('keeps categories and brands cached independently', () => {
    api.categories().subscribe();
    api.brands().subscribe();
    ctrl.expectOne(`${API}/categories`).flush([]);
    ctrl.expectOne(`${API}/brands`).flush([]);
  });

  it('refetches after the cache expires', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    api.brands().subscribe();
    ctrl.expectOne(`${API}/brands`).flush([]);
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    api.brands().subscribe();
    ctrl.expectOne(`${API}/brands`).flush([]);
    vi.useRealTimers();
  });

  it('drops cached lookups after an edit so changes show up immediately', () => {
    api.categories().subscribe();
    ctrl.expectOne(`${API}/categories`).flush([]);
    api.saveLookup('categories', 'New').subscribe();
    ctrl
      .expectOne({ method: 'POST', url: `${API}/categories` })
      .flush({ _id: '2', name: 'New', slug: 'new' });
    api.categories().subscribe();
    ctrl.expectOne(`${API}/categories`).flush([{ _id: '2', name: 'New', slug: 'new' }]);
  });

  it('url-encodes SKUs in cart item URLs', () => {
    api.setQty('p1', 'A B/1', 2).subscribe();
    ctrl.expectOne(`${API}/cart/items/p1/A%20B%2F1`).flush({});
  });

  it('requests CSV exports as blobs', () => {
    api.reportCsv('sales', { from: '2026-01-01', to: '2026-01-31' }).subscribe();
    const req = ctrl.expectOne((r) => r.url === `${API}/admin/reports/sales`);
    expect(req.request.responseType).toBe('blob');
    expect(req.request.params.get('format')).toBe('csv');
    req.flush(new Blob(['a']));
  });
});

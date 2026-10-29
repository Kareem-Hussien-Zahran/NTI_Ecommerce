import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Reports } from './reports';
import { API } from '../../../core/models';

const sales = {
  range: { from: '2026-01-01', to: '2026-01-02', interval: 'day' },
  totals: {
    orders: 3,
    revenue: 236,
    items: 6,
    tax: 21,
    shipping: 5,
    cancelledOrders: 1,
    cancelledValue: 30,
    averageOrderValue: 78.67,
  },
  series: [
    { period: '2026-01-01', orders: 1, items: 2, revenue: 100 },
    { period: '2026-01-02', orders: 2, items: 4, revenue: 136 },
  ],
  byStatus: { paid: 3 },
  byPayment: { card: 236 },
};

describe('Reports page', () => {
  let ctrl: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [Reports],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    ctrl = TestBed.inject(HttpTestingController);
  });
  const url = (t: string) => (r: { url: string }) => r.url === `${API}/admin/reports/${t}`;
  const flushAll = () => {
    ctrl.expectOne(url('sales')).flush(sales);
    ctrl
      .expectOne(url('products'))
      .flush([{ productId: 'p', name: 'Jeans', units: 3, revenue: 150, orders: 2 }]);
    ctrl
      .expectOne(url('categories'))
      .flush([{ category: 'Pants', units: 3, revenue: 150, share: 1 }]);
    ctrl
      .expectOne(url('customers'))
      .flush({ newCustomers: 2, totalCustomers: 5, activeBuyers: 2, top: [] });
    ctrl
      .expectOne((r) => r.url === `${API}/admin/reports/inventory`)
      .flush({
        threshold: 5,
        totals: { variants: 1, units: 3, stockValue: 60, out: 0, low: 1 },
        rows: [],
      });
  };

  it('loads every report for the default last-30-days range', async () => {
    const fixture = TestBed.createComponent(Reports);
    const sReq = ctrl.expectOne(url('sales'));
    expect(sReq.request.params.get('interval')).toBe('day');
    expect(sReq.request.params.get('from')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    sReq.flush(sales);
    ctrl.expectOne(url('products')).flush([]);
    ctrl.expectOne(url('categories')).flush([]);
    ctrl
      .expectOne(url('customers'))
      .flush({ newCustomers: 0, totalCustomers: 0, activeBuyers: 0, top: [] });
    ctrl.expectOne(url('inventory')).flush({
      threshold: 5,
      totals: { variants: 0, units: 0, stockValue: 0, out: 0, low: 0 },
      rows: [],
    });
    await fixture.whenStable();
    ctrl.verify();
  });

  it('renders the sales KPIs and one chart bar per period', async () => {
    const fixture = TestBed.createComponent(Reports);
    flushAll();
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('$236.00');
    expect(el.textContent).toContain('$78.67');
    expect(el.querySelectorAll('.chart .bar').length).toBe(2);
    ctrl.verify();
  });

  it('downloads CSV through the API with the current range', async () => {
    const fixture = TestBed.createComponent(Reports);
    flushAll();
    await fixture.whenStable();
    const createUrl = vi.fn(() => 'blob:x');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: revoke });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    (fixture.componentInstance as unknown as { csv(t: string): void }).csv('sales');
    const req = ctrl.expectOne(
      (r) => r.url === `${API}/admin/reports/sales` && r.params.get('format') === 'csv',
    );
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['a,b']));
    expect(click).toHaveBeenCalled();
    expect(revoke).toHaveBeenCalled();
    ctrl.verify();
  });
});

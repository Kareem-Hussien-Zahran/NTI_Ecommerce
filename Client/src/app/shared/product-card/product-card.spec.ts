import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ProductCard } from './product-card';
import { Product } from '../../core/models';

const base = {
  _id: 'p1',
  slug: 'tee',
  name: 'Test Tee',
  price: 24,
  images: ['/uploads/a.png'],
  brand: { _id: 'b', name: 'Acme', slug: 'acme' },
  ratingCount: 0,
  ratingAverage: 0,
  totalStock: 5,
} as unknown as Product;

describe('ProductCard', () => {
  let fixture: ComponentFixture<ProductCard>;
  const render = async (p: Partial<Product>) => {
    fixture.componentRef.setInput('p', { ...base, ...p });
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [ProductCard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    fixture = TestBed.createComponent(ProductCard);
  });

  it('shows name, brand, price and a link to the product page', async () => {
    const el = await render({});
    expect(el.textContent).toContain('Test Tee');
    expect(el.textContent).toContain('Acme');
    expect(el.textContent).toContain('$24.00');
    expect(el.querySelector('a.name')?.getAttribute('href')).toBe('/product/tee');
  });
  it('shows a Sale tag and the old price when compareAtPrice is set', async () => {
    const el = await render({ compareAtPrice: 30 });
    expect(el.querySelector('.tag')?.textContent).toContain('Sale');
    expect(el.querySelector('s')?.textContent).toContain('$30.00');
  });
  it('shows Sold out when there is no stock', async () => {
    const el = await render({ totalStock: 0, compareAtPrice: 30 });
    expect(el.querySelector('.tag')?.textContent).toContain('Sold out');
  });
  it('shows the rating only when there are reviews', async () => {
    expect((await render({})).querySelector('.rate')).toBeNull();
    expect(
      (await render({ ratingCount: 3, ratingAverage: 4.5 })).querySelector('.rate')?.textContent,
    ).toContain('4.5');
  });
});

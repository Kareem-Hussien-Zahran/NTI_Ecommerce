import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { AuthService } from './auth.service';
import { CartService } from './cart.service';
import { API, Cart, User } from './models';

const cart = (count: number): Cart => ({
  items: [],
  subtotal: 10 * count,
  shippingFee: 5,
  tax: count,
  total: 11 * count + 5,
  count,
});

describe('CartService', () => {
  let svc: CartService;
  let auth: AuthService;
  let ctrl: HttpTestingController;
  let snack: MatSnackBar;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    svc = TestBed.inject(CartService);
    auth = TestBed.inject(AuthService);
    ctrl = TestBed.inject(HttpTestingController);
    snack = TestBed.inject(MatSnackBar);
    vi.spyOn(snack, 'open').mockReturnValue(undefined as never);
  });
  afterEach(() => ctrl.verify());

  it('is empty for anonymous visitors and loads the cart on sign-in', () => {
    TestBed.tick();
    expect(svc.count()).toBe(0);
    auth.user.set({ _id: '1' } as User);
    TestBed.tick();
    ctrl.expectOne(`${API}/cart`).flush(cart(2));
    expect(svc.count()).toBe(2);
  });

  it('clears the cart on sign-out', () => {
    auth.user.set({ _id: '1' } as User);
    TestBed.tick();
    ctrl.expectOne(`${API}/cart`).flush(cart(3));
    auth.user.set(null);
    TestBed.tick();
    expect(svc.count()).toBe(0);
  });

  it('adding an item updates the signal from the server response and confirms', () => {
    svc.add('p1', 'M', 2);
    const req = ctrl.expectOne(`${API}/cart/items`);
    expect(req.request.body).toEqual({ productId: 'p1', sku: 'M', quantity: 2 });
    req.flush(cart(2));
    expect(svc.cart().total).toBe(27);
    expect(snack.open).toHaveBeenCalledWith('Added to cart', undefined, expect.anything());
  });

  it('shows the server error message when a change is rejected', () => {
    svc.add('p1', 'M', 99);
    ctrl
      .expectOne(`${API}/cart/items`)
      .flush({ message: 'Only 2 in stock' }, { status: 400, statusText: 'Bad Request' });
    expect(snack.open).toHaveBeenCalledWith('Only 2 in stock', 'OK', expect.anything());
    expect(svc.count()).toBe(0);
  });
});

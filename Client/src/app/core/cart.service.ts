import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Observable, tap } from 'rxjs';
import { Api } from './api.service';
import { AuthService } from './auth.service';
import { Cart, errMsg } from './models';

const EMPTY: Cart = { items: [], subtotal: 0, shippingFee: 0, tax: 0, total: 0, count: 0 };

@Injectable({ providedIn: 'root' })
export class CartService {
  private api = inject(Api);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);

  readonly cart = signal<Cart>(EMPTY);
  readonly count = computed(() => this.cart().count);

  constructor() {
    // reload whenever the logged-in user changes
    effect(() => {
      if (this.auth.user())
        this.api
          .cart()
          .subscribe({ next: (c) => this.cart.set(c), error: () => this.cart.set(EMPTY) });
      else this.cart.set(EMPTY);
    });
  }

  add(productId: string, sku: string, qty = 1) {
    return this.run(this.api.addToCart(productId, sku, qty), 'Added to cart');
  }
  setQty(productId: string, sku: string, qty: number) {
    return this.run(this.api.setQty(productId, sku, qty));
  }
  remove(productId: string, sku: string) {
    return this.run(this.api.removeLine(productId, sku), 'Removed');
  }
  reset() {
    this.cart.set(EMPTY);
  }

  private run(o: Observable<Cart>, ok?: string) {
    o.pipe(tap((c) => this.cart.set(c))).subscribe({
      next: () => ok && this.snack.open(ok, undefined, { duration: 1800 }),
      error: (e) => this.snack.open(errMsg(e), 'OK', { duration: 4000 }),
    });
  }
}

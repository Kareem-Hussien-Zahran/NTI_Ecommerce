import { Injectable, effect, inject, signal } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router } from '@angular/router';
import { Api } from './api.service';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class WishlistService {
  private api = inject(Api);
  private auth = inject(AuthService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  readonly ids = signal<Set<string>>(new Set());

  constructor() {
    effect(() => {
      if (this.auth.user()) this.api.wishlistIds().subscribe((ids) => this.ids.set(new Set(ids)));
      else this.ids.set(new Set());
    });
  }

  has(id: string) {
    return this.ids().has(id);
  }

  toggle(id: string) {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.api.toggleWish(id).subscribe(({ wishlisted }) => {
      const next = new Set(this.ids());
      wishlisted ? next.add(id) : next.delete(id);
      this.ids.set(next);
      this.snack.open(wishlisted ? 'Saved to wishlist' : 'Removed from wishlist', undefined, {
        duration: 1500,
      });
    });
  }
}

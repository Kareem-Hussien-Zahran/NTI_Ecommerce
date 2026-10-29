import { Component, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Api } from '../../core/api.service';
import { Product } from '../../core/models';
import { WishlistService } from '../../core/wishlist.service';
import { ProductCard } from '../../shared/product-card/product-card';

@Component({
  selector: 'app-wishlist',
  imports: [RouterLink, MatButtonModule, MatIconModule, ProductCard],
  templateUrl: './wishlist.html',
})
export class Wishlist {
  private api = inject(Api);
  private wish = inject(WishlistService);
  protected items = signal<Product[]>([]);
  protected loaded = signal(false);

  constructor() {
    // reload when an item is un-hearted so it disappears from the grid
    effect(() => {
      const ids = this.wish.ids();
      untracked(() =>
        this.api.wishlist().subscribe((l) => {
          this.items.set(l.filter((p) => ids.has(p._id)));
          this.loaded.set(true);
        }),
      );
    });
  }
}

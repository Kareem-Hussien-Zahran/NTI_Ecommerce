import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { Product, nameOf } from '../../core/models';
import { WishlistService } from '../../core/wishlist.service';

@Component({
  selector: 'app-product-card',
  imports: [RouterLink, MatIconModule, CurrencyPipe],
  templateUrl: './product-card.html',
  styleUrl: './product-card.css',
})
export class ProductCard {
  readonly p = input.required<Product>();
  protected wish = inject(WishlistService);
  protected brand = computed(() => nameOf(this.p().brand));
  protected soldOut = computed(() => this.p().totalStock === 0);
}

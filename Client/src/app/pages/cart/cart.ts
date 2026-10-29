import { CurrencyPipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDividerModule } from '@angular/material/divider';
import { MatIconModule } from '@angular/material/icon';
import { AuthService } from '../../core/auth.service';
import { CartService } from '../../core/cart.service';

@Component({
  selector: 'app-cart',
  imports: [CurrencyPipe, RouterLink, MatButtonModule, MatIconModule, MatDividerModule],
  templateUrl: './cart.html',
  styleUrl: './cart.css',
})
export class CartPage {
  protected cart = inject(CartService);
  protected auth = inject(AuthService);
  protected c = this.cart.cart;
  protected hasIssue = () => this.c().items.some((l) => !l.available);
}

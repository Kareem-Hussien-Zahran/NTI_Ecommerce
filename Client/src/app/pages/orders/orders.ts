import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { Api } from '../../core/api.service';
import { Order, Paginated } from '../../core/models';

@Component({
  selector: 'app-orders',
  imports: [CurrencyPipe, DatePipe, RouterLink, MatButtonModule, MatIconModule, MatPaginatorModule],
  templateUrl: './orders.html',
  styleUrl: './orders.css',
})
export class Orders {
  private api = inject(Api);
  protected data = signal<Paginated<Order> | null>(null);
  constructor() {
    this.load(1);
  }
  protected load(page: number) {
    this.api.myOrders(page).subscribe((d) => this.data.set(d));
  }
}

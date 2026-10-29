import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { Api } from '../../../core/api.service';
import { Order, Paginated, STATUSES, errMsg } from '../../../core/models';

@Component({
  selector: 'app-admin-orders',
  imports: [
    CurrencyPipe,
    DatePipe,
    MatTableModule,
    MatSelectModule,
    MatFormFieldModule,
    MatPaginatorModule,
  ],
  templateUrl: './admin-orders.html',
  styleUrl: './admin-orders.css',
})
export class AdminOrders {
  private api = inject(Api);
  private snack = inject(MatSnackBar);
  protected statuses = STATUSES;
  protected cols = ['no', 'customer', 'total', 'status'];
  protected data = signal<Paginated<Order> | null>(null);
  protected filter = signal('');
  constructor() {
    this.load(1);
  }
  protected cust(o: Order) {
    return typeof o.user === 'object' ? `${o.user.firstName} ${o.user.lastName}` : '';
  }
  protected load(page: number) {
    this.api.allOrders({ page, status: this.filter() }).subscribe((d) => this.data.set(d));
  }
  protected setStatus(o: Order, status: string) {
    this.api.setOrderStatus(o._id, status).subscribe({
      next: () => this.snack.open('Order updated', undefined, { duration: 1500 }),
      error: (e) => {
        this.snack.open(errMsg(e), 'OK', { duration: 4000 });
        this.load(this.data()?.meta.page ?? 1);
      },
    });
  }
}

import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api } from '../../../core/api.service';
import { Order, errMsg } from '../../../core/models';
import { confirm } from '../../../shared/confirm-dialog/confirm-dialog';

const FLOW = ['pending', 'paid', 'processing', 'shipped', 'delivered'];

@Component({
  selector: 'app-order-detail',
  imports: [CurrencyPipe, DatePipe, RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.css',
})
export class OrderDetail {
  readonly id = input.required<string>();
  private api = inject(Api);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  protected flow = FLOW;
  protected o = signal<Order | null>(null);

  constructor() {
    effect(() => this.api.order(this.id()).subscribe((o) => this.o.set(o)));
  }

  protected idx(s: string) {
    return FLOW.indexOf(s);
  }
  protected cancel(o: Order) {
    confirm(this.dialog, {
      title: 'Cancel this order?',
      message: 'Items will be returned to stock.',
      confirm: 'Cancel order',
    }).subscribe((ok) => {
      if (ok)
        this.api.cancelOrder(o._id).subscribe({
          next: (x) => this.o.set(x),
          error: (e) => this.snack.open(errMsg(e), 'OK', { duration: 4000 }),
        });
    });
  }
}

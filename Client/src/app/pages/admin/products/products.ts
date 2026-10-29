import { CurrencyPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { debounceTime } from 'rxjs';
import { Api } from '../../../core/api.service';
import { Paginated, Product, errMsg, nameOf } from '../../../core/models';
import { confirm } from '../../../shared/confirm-dialog/confirm-dialog';

@Component({
  selector: 'app-admin-products',
  imports: [
    CurrencyPipe,
    ReactiveFormsModule,
    RouterLink,
    MatTableModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatPaginatorModule,
  ],
  templateUrl: './products.html',
  styleUrl: './products.css',
})
export class AdminProducts {
  private api = inject(Api);
  private dialog = inject(MatDialog);
  private snack = inject(MatSnackBar);
  protected cols = ['name', 'price', 'stock', 'status', 'actions'];
  protected data = signal<Paginated<Product> | null>(null);
  protected q = new FormControl('', { nonNullable: true });
  protected brand = (p: Product) => nameOf(p.brand);

  constructor() {
    this.load(1);
    this.q.valueChanges.pipe(debounceTime(300)).subscribe(() => this.load(1));
  }

  protected load(page: number) {
    this.api
      .products({ q: this.q.value, page, limit: 10, includeInactive: true })
      .subscribe((d) => this.data.set(d));
  }
  protected remove(p: Product) {
    confirm(this.dialog, {
      title: `Delete "${p.name}"?`,
      message: 'This cannot be undone.',
      confirm: 'Delete',
    }).subscribe((ok) => {
      if (ok)
        this.api
          .deleteProduct(p._id)
          .subscribe({ next: () => this.load(1), error: (e) => this.snack.open(errMsg(e), 'OK') });
    });
  }
}

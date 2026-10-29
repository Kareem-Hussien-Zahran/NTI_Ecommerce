import { CurrencyPipe, DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { Api } from '../../../core/api.service';
import {
  CategoryRow,
  CustomersReport,
  InventoryReport,
  ProductRow,
  ReportParams,
  ReportType,
  SalesReport,
  errMsg,
} from '../../../core/models';

const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

@Component({
  selector: 'app-reports',
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    PercentPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatTableModule,
    MatTabsModule,
  ],
  templateUrl: './reports.html',
  styleUrl: './reports.css',
})
export class Reports {
  private api = inject(Api);
  private fb = inject(FormBuilder);
  private snack = inject(MatSnackBar);

  protected loading = signal(false);
  protected threshold = signal(5);
  protected sales = signal<SalesReport | null>(null);
  protected products = signal<ProductRow[]>([]);
  protected categories = signal<CategoryRow[]>([]);
  protected customers = signal<CustomersReport | null>(null);
  protected inventory = signal<InventoryReport | null>(null);
  protected maxRevenue = computed(() =>
    Math.max(1, ...(this.sales()?.series.map((b) => b.revenue) ?? [1])),
  );

  protected form = this.fb.nonNullable.group({
    from: daysAgo(29),
    to: today(),
    interval: 'day' as 'day' | 'week' | 'month',
  });

  constructor() {
    this.load();
  }

  protected entries(o: Record<string, number>) {
    return Object.entries(o);
  }
  protected get params(): ReportParams {
    return this.form.getRawValue();
  }

  protected preset(days: number) {
    this.form.patchValue({
      from: daysAgo(days - 1),
      to: today(),
      interval: days > 60 ? 'week' : 'day',
    });
    this.load();
  }

  protected load() {
    this.loading.set(true);
    const p = this.params;
    const fail = (e: unknown) => {
      this.loading.set(false);
      this.snack.open(errMsg(e), 'OK', { duration: 4000 });
    };
    this.api.salesReport(p).subscribe({
      next: (r) => {
        this.sales.set(r);
        this.loading.set(false);
      },
      error: fail,
    });
    this.api.productsReport(p).subscribe({ next: (r) => this.products.set(r), error: fail });
    this.api.categoriesReport(p).subscribe({ next: (r) => this.categories.set(r), error: fail });
    this.api.customersReport(p).subscribe({ next: (r) => this.customers.set(r), error: fail });
    this.loadInventory();
  }

  protected setThreshold(v: string) {
    this.threshold.set(Math.max(0, Number(v) || 0));
    this.loadInventory();
  }
  private loadInventory() {
    this.api
      .inventoryReport({ threshold: this.threshold() })
      .subscribe((r) => this.inventory.set(r));
  }

  protected clearCache() {
    this.api.clearCache().subscribe({
      next: () => {
        this.snack.open('Cache cleared', undefined, { duration: 1500 });
        this.load();
      },
      error: (e) => this.snack.open(errMsg(e), 'OK'),
    });
  }

  protected csv(type: ReportType) {
    const p = type === 'inventory' ? { threshold: this.threshold() } : this.params;
    this.api.reportCsv(type, p).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${type}-report-${today()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => this.snack.open(errMsg(e, 'Download failed'), 'OK'),
    });
  }
}

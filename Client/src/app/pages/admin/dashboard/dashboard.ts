import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { Api } from '../../../core/api.service';
import { Stats } from '../../../core/models';

@Component({
  selector: 'app-dashboard',
  imports: [CurrencyPipe, MatIconModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
  protected s = signal<Stats | null>(null);
  protected max = computed(() => Math.max(1, ...(this.s()?.daily.map((d) => d.revenue) ?? [1])));
  protected statuses = computed(() => Object.entries(this.s()?.ordersByStatus ?? {}));
  constructor() {
    inject(Api)
      .stats()
      .subscribe((s) => this.s.set(s));
  }
}

import { DatePipe, DecimalPipe, KeyValuePipe, PercentPipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { Api } from '../../../core/api.service';
import { ActivityEntry, LogParams, LogsResponse, SystemInfo, errMsg } from '../../../core/models';

@Component({
  selector: 'app-system',
  imports: [
    DatePipe,
    DecimalPipe,
    KeyValuePipe,
    PercentPipe,
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatPaginatorModule,
    MatSelectModule,
    MatTableModule,
    MatTabsModule,
  ],
  templateUrl: './system.html',
  styleUrl: './system.css',
})
export class SystemPage {
  private api = inject(Api);
  private fb = inject(FormBuilder);
  private snack = inject(MatSnackBar);

  protected info = signal<SystemInfo | null>(null);
  protected logs = signal<LogsResponse | null>(null);
  protected errors = signal<ActivityEntry[]>([]);
  protected expanded = signal<string | null>(null);
  protected page = signal(1);
  protected cols = ['time', 'type', 'action', 'actor', 'target', 'ip'];

  protected form = this.fb.nonNullable.group({
    type: '' as '' | 'audit' | 'security' | 'error',
    q: '',
    from: '',
    to: '',
  });

  constructor() {
    this.refresh();
  }

  protected refresh() {
    this.api.system().subscribe({
      next: (i) => this.info.set(i),
      error: (e) => this.snack.open(errMsg(e), 'OK', { duration: 4000 }),
    });
    this.loadLogs();
    this.api.logs({ type: 'error', limit: 20 }).subscribe((r) => this.errors.set(r.items));
  }

  protected get params(): LogParams {
    return { ...this.form.getRawValue(), page: this.page(), limit: 20 };
  }

  protected apply() {
    this.page.set(1);
    this.loadLogs();
  }
  protected loadLogs() {
    this.api.logs(this.params).subscribe({
      next: (r) => this.logs.set(r),
      error: (e) => this.snack.open(errMsg(e), 'OK', { duration: 4000 }),
    });
  }
  protected onPage(e: PageEvent) {
    this.page.set(e.pageIndex + 1);
    this.loadLogs();
  }
  protected toggle(row: ActivityEntry) {
    this.expanded.update((id) => (id === row._id ? null : row._id));
  }

  protected clearCache() {
    this.api.clearCache().subscribe({
      next: (r) => {
        this.snack.open(`Cache cleared (${r.cleared} entries)`, 'OK', { duration: 2500 });
        this.refresh();
      },
      error: (e) => this.snack.open(errMsg(e), 'OK'),
    });
  }

  protected csv() {
    this.api.logsCsv(this.params).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `activity-log-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e) => this.snack.open(errMsg(e, 'Download failed'), 'OK'),
    });
  }

  protected kb(bytes: number) {
    return bytes > 1048576
      ? `${(bytes / 1048576).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }
  protected uptime(s: number) {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`;
  }
  protected json(v: unknown) {
    return JSON.stringify(v, null, 2);
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api } from '../../../core/api.service';
import { Named, errMsg } from '../../../core/models';
import { confirm } from '../../../shared/confirm-dialog/confirm-dialog';

type Kind = 'categories' | 'brands';

@Component({
  selector: 'app-catalog-admin',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
  ],
  templateUrl: './catalog.html',
  styleUrl: './catalog.css',
})
export class CatalogAdmin {
  private api = inject(Api);
  private snack = inject(MatSnackBar);
  private dialog = inject(MatDialog);
  protected kinds: { kind: Kind; label: string; single: string }[] = [
    { kind: 'categories', label: 'Categories', single: 'category' },
    { kind: 'brands', label: 'Brands', single: 'brand' },
  ];
  protected lists = signal<Record<Kind, Named[]>>({ categories: [], brands: [] });
  protected editing = signal<Record<Kind, string | null>>({ categories: null, brands: null });
  protected inputs: Record<Kind, FormControl<string>> = {
    categories: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
    brands: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
  };

  constructor() {
    this.reload();
  }

  private reload() {
    this.api.categories().subscribe((c) => this.lists.update((l) => ({ ...l, categories: c })));
    this.api.brands().subscribe((b) => this.lists.update((l) => ({ ...l, brands: b })));
  }
  protected edit(k: Kind, i: Named) {
    this.editing.update((e) => ({ ...e, [k]: i._id }));
    this.inputs[k].setValue(i.name);
  }
  protected cancel(k: Kind) {
    this.editing.update((e) => ({ ...e, [k]: null }));
    this.inputs[k].reset('');
  }
  protected save(k: Kind) {
    if (this.inputs[k].invalid) return;
    this.api.saveLookup(k, this.inputs[k].value.trim(), this.editing()[k] ?? undefined).subscribe({
      next: () => {
        this.cancel(k);
        this.reload();
      },
      error: (e) => this.snack.open(errMsg(e), 'OK', { duration: 4000 }),
    });
  }
  protected remove(k: Kind, i: Named) {
    confirm(this.dialog, {
      title: `Delete "${i.name}"?`,
      message: 'Items used by products cannot be deleted.',
      confirm: 'Delete',
    }).subscribe((ok) => {
      if (ok)
        this.api.deleteLookup(k, i._id).subscribe({
          next: () => this.reload(),
          error: (e) => this.snack.open(errMsg(e), 'OK', { duration: 4000 }),
        });
    });
  }
}

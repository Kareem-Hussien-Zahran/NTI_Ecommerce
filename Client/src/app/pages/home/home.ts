import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Api } from '../../core/api.service';
import { Named, Product } from '../../core/models';
import { ProductCard } from '../../shared/product-card/product-card';

@Component({
  selector: 'app-home',
  imports: [RouterLink, MatButtonModule, MatIconModule, MatProgressSpinnerModule, ProductCard],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home {
  private api = inject(Api);
  protected featured = signal<Product[]>([]);
  protected latest = signal<Product[]>([]);
  protected categories = signal<Named[]>([]);
  protected loading = signal(true);

  constructor() {
    this.api.products({ featured: 'true', limit: 4 }).subscribe({
      next: (r) => this.featured.set(r.items),
      complete: () => this.loading.set(false),
      error: () => this.loading.set(false),
    });
    this.api.products({ sort: 'newest', limit: 8 }).subscribe((r) => this.latest.set(r.items));
    this.api.categories().subscribe((c) => this.categories.set(c));
  }
}

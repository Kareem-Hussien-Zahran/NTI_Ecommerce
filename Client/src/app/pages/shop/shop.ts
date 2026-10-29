import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { debounceTime } from 'rxjs';
import { Api } from '../../core/api.service';
import { GENDERS, Named, Paginated, Product, SIZES } from '../../core/models';
import { ProductCard } from '../../shared/product-card/product-card';

const KEYS = [
  'q',
  'category',
  'brand',
  'gender',
  'size',
  'sort',
  'minPrice',
  'maxPrice',
  'inStock',
  'featured',
  'page',
] as const;

@Component({
  selector: 'app-shop',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatSelectModule,
    MatInputModule,
    MatSlideToggleModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatButtonModule,
    MatIconModule,
    ProductCard,
  ],
  templateUrl: './shop.html',
  styleUrl: './shop.css',
})
export class Shop {
  private api = inject(Api);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  protected genders = GENDERS;
  protected sizes = SIZES;
  protected categories = signal<Named[]>([]);
  protected brands = signal<Named[]>([]);
  protected data = signal<Paginated<Product> | null>(null);
  protected loading = signal(false);

  protected form = this.fb.nonNullable.group({
    q: '',
    category: '',
    brand: '',
    gender: '',
    size: '',
    sort: 'newest',
    minPrice: '',
    maxPrice: '',
    inStock: false,
  });

  constructor() {
    this.api.categories().subscribe((c) => this.categories.set(c));
    this.api.brands().subscribe((b) => this.brands.set(b));

    // URL is the single source of truth: query params -> form + request
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((m) => {
      this.form.patchValue(
        {
          q: m.get('q') ?? '',
          category: m.get('category') ?? '',
          brand: m.get('brand') ?? '',
          gender: m.get('gender') ?? '',
          size: m.get('size') ?? '',
          sort: m.get('sort') ?? 'newest',
          minPrice: m.get('minPrice') ?? '',
          maxPrice: m.get('maxPrice') ?? '',
          inStock: m.get('inStock') === 'true',
        },
        { emitEvent: false },
      );
      this.load(m.get('page'), m.get('featured'));
    });
    // form -> URL
    this.form.valueChanges.pipe(debounceTime(300), takeUntilDestroyed()).subscribe((v) => {
      this.router.navigate([], {
        queryParams: { ...this.clean(v), page: null },
        queryParamsHandling: 'merge',
      });
    });
  }

  private clean(v: Partial<Record<string, unknown>>) {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v))
      out[k] = val === '' || val === false || (k === 'sort' && val === 'newest') ? null : val;
    if (v['inStock']) out['inStock'] = 'true';
    return out;
  }

  private load(page: string | null, featured: string | null) {
    const v = this.form.getRawValue();
    this.loading.set(true);
    this.api
      .products({
        ...v,
        inStock: v.inStock ? 'true' : undefined,
        sort: v.sort,
        page: page ?? 1,
        limit: 12,
        featured: featured ?? undefined,
      })
      .subscribe({
        next: (r) => {
          this.data.set(r);
          this.loading.set(false);
        },
        error: () => this.loading.set(false),
      });
  }

  protected go(e: PageEvent) {
    this.router.navigate([], {
      queryParams: { page: e.pageIndex + 1 },
      queryParamsHandling: 'merge',
    });
  }
  protected reset() {
    this.router.navigate([], { queryParams: Object.fromEntries(KEYS.map((k) => [k, null])) });
  }
}

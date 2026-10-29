import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { CartService } from '../../core/cart.service';
import { Product, Review, Variant, errMsg, nameOf } from '../../core/models';
import { WishlistService } from '../../core/wishlist.service';
import { ProductCard } from '../../shared/product-card/product-card';

@Component({
  selector: 'app-product-detail',
  imports: [
    CurrencyPipe,
    DatePipe,
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ProductCard,
  ],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.css',
})
export class ProductDetail {
  protected readonly Math = Math;
  readonly slug = input.required<string>();
  private api = inject(Api);
  private cart = inject(CartService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);
  private fb = inject(FormBuilder);
  protected auth = inject(AuthService);
  protected wish = inject(WishlistService);

  protected p = signal<Product | null>(null);
  protected loading = signal(true);
  protected related = signal<Product[]>([]);
  protected reviews = signal<Review[]>([]);
  protected imgIndex = signal(0);
  protected color = signal('');
  protected size = signal<string | undefined>(undefined);
  protected qty = signal(1);

  protected brand = computed(() => nameOf(this.p()?.brand));
  protected category = computed(() => nameOf(this.p()?.category));
  protected colors = computed(() => {
    const seen = new Map<string, { name: string; code?: string }>();
    for (const v of this.p()?.variants ?? [])
      if (v.color?.name && !seen.has(v.color.name)) seen.set(v.color.name, v.color);
    return [...seen.values()];
  });
  protected sizes = computed(() =>
    (this.p()?.variants ?? []).filter((v) => (v.color?.name ?? '') === this.color() && v.size),
  );
  protected variant = computed<Variant | undefined>(() =>
    this.sizes().find((v) => v.size === this.size()),
  );
  protected price = computed(() => this.variant()?.price ?? this.p()?.price ?? 0);
  protected images = computed(() => {
    const v = this.variant()?.images?.length ? this.variant()!.images! : [];
    return [...new Set([...v, ...(this.p()?.images ?? [])])];
  });

  protected reviewForm = this.fb.nonNullable.group({
    rating: [5, Validators.required],
    comment: '',
  });

  constructor() {
    effect(() => {
      const slug = this.slug();
      this.loading.set(true);
      this.api.product(slug).subscribe({
        next: (p) => {
          this.p.set(p);
          this.imgIndex.set(0);
          this.qty.set(1);
          this.size.set(undefined);
          this.color.set(
            p.variants.find((v) => v.stock > 0)?.color?.name ?? p.variants[0]?.color?.name ?? '',
          );
          this.loading.set(false);
          this.api.related(p._id).subscribe((r) => this.related.set(r));
          this.loadReviews(p._id);
        },
        error: () => {
          this.p.set(null);
          this.loading.set(false);
        },
      });
    });
  }

  protected pickColor(name: string) {
    this.color.set(name);
    this.size.set(undefined);
    this.qty.set(1);
  }

  protected add() {
    const v = this.variant(),
      p = this.p();
    if (!v || !p) return;
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.cart.add(p._id, v.sku, this.qty());
  }

  private loadReviews(id: string) {
    this.api.reviews(id).subscribe((r) => this.reviews.set(r.items));
  }

  protected submitReview() {
    const p = this.p();
    if (!p) return;
    const { rating, comment } = this.reviewForm.getRawValue();
    this.api.addReview(p._id, rating, comment).subscribe({
      next: () => {
        this.snack.open('Thanks for your review!', undefined, { duration: 2500 });
        this.loadReviews(p._id);
        this.api
          .product(p._id)
          .subscribe((x) =>
            this.p.update(
              (cur) =>
                cur && { ...cur, ratingAverage: x.ratingAverage, ratingCount: x.ratingCount },
            ),
          );
      },
      error: (e) => this.snack.open(errMsg(e), 'OK', { duration: 4000 }),
    });
  }
}

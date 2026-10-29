import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Api } from '../../../core/api.service';
import { GENDERS, Named, Product, SIZES, TYPES, errMsg, idOf } from '../../../core/models';

@Component({
  selector: 'app-product-form',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatSelectModule,
    MatSlideToggleModule,
  ],
  templateUrl: './product-form.html',
  styleUrl: './product-form.css',
})
export class ProductForm {
  readonly id = input<string>();
  private fb = inject(FormBuilder);
  private api = inject(Api);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  protected genders = GENDERS;
  protected types = TYPES;
  protected sizes = SIZES;
  protected categories = signal<Named[]>([]);
  protected brands = signal<Named[]>([]);
  protected images = signal<string[]>([]);
  protected uploading = signal(false);
  protected saving = signal(false);
  protected error = signal('');

  protected form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    description: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    compareAtPrice: [null as number | null],
    category: ['', Validators.required],
    brand: ['', Validators.required],
    gender: ['unisex', Validators.required],
    productType: ['other'],
    tags: [''],
    featured: false,
    isActive: true,
    variants: this.fb.array([this.variantGroup()]),
  });
  protected get variants() {
    return this.form.controls.variants;
  }

  constructor() {
    this.api.categories().subscribe((c) => this.categories.set(c));
    this.api.brands().subscribe((b) => this.brands.set(b));
    queueMicrotask(() => {
      const id = this.id();
      if (id) this.api.product(id).subscribe((p) => this.fill(p));
    });
  }

  private variantGroup(v?: Product['variants'][number]) {
    return this.fb.nonNullable.group({
      sku: [v?.sku ?? '', Validators.required],
      size: v?.size ?? '',
      colorName: v?.color?.name ?? '',
      colorCode: v?.color?.code ?? '',
      stock: [v?.stock ?? 0, [Validators.required, Validators.min(0)]],
      price: [v?.price ?? (null as number | null)],
    });
  }
  protected addVariant() {
    this.variants.push(this.variantGroup());
  }

  private fill(p: Product) {
    this.images.set(p.images ?? []);
    this.variants.clear();
    p.variants.forEach((v) => this.variants.push(this.variantGroup(v)));
    this.form.patchValue({
      name: p.name,
      description: p.description,
      price: p.price,
      compareAtPrice: p.compareAtPrice ?? null,
      category: idOf(p.category),
      brand: idOf(p.brand),
      gender: p.gender,
      productType: p.productType,
      tags: (p.tags ?? []).join(', '),
      featured: p.featured,
      isActive: p.isActive,
    });
  }

  protected upload(e: Event) {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    if (!files.length) return;
    this.uploading.set(true);
    this.api.uploadImages(files).subscribe({
      next: (r) => {
        this.images.update((x) => [...x, ...r.urls]);
        this.uploading.set(false);
      },
      error: (err) => {
        this.uploading.set(false);
        this.snack.open(errMsg(err), 'OK', { duration: 4000 });
      },
    });
    (e.target as HTMLInputElement).value = '';
  }
  protected removeImage(i: number) {
    this.images.update((x) => x.filter((_, j) => j !== i));
  }

  protected save() {
    const v = this.form.getRawValue();
    const body = {
      name: v.name,
      description: v.description,
      price: v.price,
      ...(v.compareAtPrice ? { compareAtPrice: v.compareAtPrice } : {}),
      category: v.category,
      brand: v.brand,
      gender: v.gender,
      productType: v.productType,
      tags: v.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      featured: v.featured,
      isActive: v.isActive,
      images: this.images(),
      variants: v.variants.map((x) => ({
        sku: x.sku.trim(),
        stock: x.stock,
        ...(x.size ? { size: x.size } : {}),
        ...(x.colorName
          ? { color: { name: x.colorName, ...(x.colorCode ? { code: x.colorCode } : {}) } }
          : {}),
        ...(x.price !== null && x.price !== undefined ? { price: x.price } : {}),
      })),
    };
    this.saving.set(true);
    this.error.set('');
    const id = this.id();
    (id ? this.api.updateProduct(id, body) : this.api.createProduct(body)).subscribe({
      next: () => {
        this.snack.open('Product saved', undefined, { duration: 2000 });
        this.router.navigate(['/admin/products']);
      },
      error: (e) => {
        this.saving.set(false);
        this.error.set(errMsg(e));
      },
    });
  }
}

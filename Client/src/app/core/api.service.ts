import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay, tap } from 'rxjs';
import {
  API,
  CacheStats,
  LogParams,
  LogsResponse,
  SystemInfo,
  CategoryRow,
  Cart,
  CustomersReport,
  InventoryReport,
  Named,
  Order,
  Paginated,
  Product,
  ProductRow,
  ReportParams,
  ReportType,
  Review,
  SalesReport,
  Stats,
  User,
} from './models';

type Params = Record<string, string | number | boolean | undefined | null>;
const params = (p?: Params) => {
  let hp = new HttpParams();
  for (const [k, v] of Object.entries(p ?? {}))
    if (v !== undefined && v !== null && v !== '') hp = hp.set(k, String(v));
  return hp;
};

const LOOKUP_TTL_MS = 5 * 60 * 1000;

/** Thin typed wrapper over the REST API. */
@Injectable({ providedIn: 'root' })
export class Api {
  private http = inject(HttpClient);

  // catalog
  products = (p?: Params) =>
    this.http.get<Paginated<Product>>(`${API}/products`, { params: params(p) });
  product = (idOrSlug: string) => this.http.get<Product>(`${API}/products/${idOrSlug}`);
  related = (id: string) => this.http.get<Product[]>(`${API}/products/${id}/related`);
  createProduct = (b: unknown) => this.http.post<Product>(`${API}/products`, b);
  updateProduct = (id: string, b: unknown) => this.http.put<Product>(`${API}/products/${id}`, b);
  deleteProduct = (id: string) => this.http.delete<void>(`${API}/products/${id}`);
  uploadImages = (files: File[]) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));
    return this.http.post<{ urls: string[] }>(`${API}/uploads/images`, fd);
  };

  // categories & brands rarely change, so keep them in memory for a few minutes (and drop them after any edit)
  private lookups = new Map<string, { at: number; obs: Observable<Named[]> }>();
  private lookup(kind: 'categories' | 'brands') {
    const hit = this.lookups.get(kind);
    if (hit && Date.now() - hit.at < LOOKUP_TTL_MS) return hit.obs;
    const obs = this.http.get<Named[]>(`${API}/${kind}`).pipe(shareReplay(1));
    this.lookups.set(kind, { at: Date.now(), obs });
    return obs;
  }
  categories = () => this.lookup('categories');
  brands = () => this.lookup('brands');
  saveLookup = (kind: 'categories' | 'brands', name: string, id?: string) =>
    (id
      ? this.http.put<Named>(`${API}/${kind}/${id}`, { name })
      : this.http.post<Named>(`${API}/${kind}`, { name })
    ).pipe(tap(() => this.lookups.clear()));
  deleteLookup = (kind: 'categories' | 'brands', id: string) =>
    this.http.delete<void>(`${API}/${kind}/${id}`).pipe(tap(() => this.lookups.clear()));

  // reviews
  reviews = (id: string, page = 1) =>
    this.http.get<Paginated<Review>>(`${API}/products/${id}/reviews`, {
      params: params({ page, limit: 5 }),
    });
  addReview = (id: string, rating: number, comment: string) =>
    this.http.post<Review>(`${API}/products/${id}/reviews`, { rating, comment });

  // wishlist
  wishlist = () => this.http.get<Product[]>(`${API}/wishlist`);
  wishlistIds = () => this.http.get<string[]>(`${API}/wishlist/ids`);
  toggleWish = (id: string) => this.http.post<{ wishlisted: boolean }>(`${API}/wishlist/${id}`, {});

  // cart
  cart = () => this.http.get<Cart>(`${API}/cart`);
  addToCart = (productId: string, sku: string, quantity: number) =>
    this.http.post<Cart>(`${API}/cart/items`, { productId, sku, quantity });
  setQty = (productId: string, sku: string, quantity: number) =>
    this.http.patch<Cart>(`${API}/cart/items/${productId}/${encodeURIComponent(sku)}`, {
      quantity,
    });
  removeLine = (productId: string, sku: string) =>
    this.http.delete<Cart>(`${API}/cart/items/${productId}/${encodeURIComponent(sku)}`);

  // orders
  placeOrder = (b: unknown) => this.http.post<Order>(`${API}/orders`, b);
  myOrders = (page = 1) =>
    this.http.get<Paginated<Order>>(`${API}/orders/mine`, { params: params({ page }) });
  order = (id: string) => this.http.get<Order>(`${API}/orders/${id}`);
  cancelOrder = (id: string) => this.http.post<Order>(`${API}/orders/${id}/cancel`, {});

  // admin
  stats = () => this.http.get<Stats>(`${API}/admin/stats`);
  allOrders = (p?: Params) =>
    this.http.get<Paginated<Order>>(`${API}/orders`, { params: params(p) });
  setOrderStatus = (id: string, status: string) =>
    this.http.patch<Order>(`${API}/orders/${id}/status`, { status });
  users = (p?: Params) => this.http.get<Paginated<User>>(`${API}/users`, { params: params(p) });
  updateUser = (id: string, b: unknown) => this.http.patch<User>(`${API}/users/${id}`, b);
  report = <T>(type: ReportType, p?: ReportParams) =>
    this.http.get<T>(`${API}/admin/reports/${type}`, { params: params(p as Params) });
  salesReport = (p?: ReportParams) => this.report<SalesReport>('sales', p);
  productsReport = (p?: ReportParams) => this.report<ProductRow[]>('products', p);
  categoriesReport = (p?: ReportParams) => this.report<CategoryRow[]>('categories', p);
  customersReport = (p?: ReportParams) => this.report<CustomersReport>('customers', p);
  inventoryReport = (p?: ReportParams) => this.report<InventoryReport>('inventory', p);
  reportCsv = (type: ReportType, p?: ReportParams) =>
    this.http.get(`${API}/admin/reports/${type}`, {
      params: params({ ...(p as Params), format: 'csv' }),
      responseType: 'blob',
    });
  cacheStats = () => this.http.get<CacheStats>(`${API}/admin/cache`);
  clearCache = () => this.http.delete<{ cleared: number }>(`${API}/admin/cache`);
  logs = (p?: LogParams) =>
    this.http.get<LogsResponse>(`${API}/admin/logs`, { params: params(p as Params) });
  logsCsv = (p?: LogParams) =>
    this.http.get(`${API}/admin/logs`, {
      params: params({ ...(p as Params), format: 'csv' }),
      responseType: 'blob',
    });
  system = () => this.http.get<SystemInfo>(`${API}/admin/system`);
  deleteMe = () => this.http.delete<void>(`${API}/users/me`);
  deleteUser = (id: string) => this.http.delete<void>(`${API}/users/${id}`);
}

export interface User {
  _id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone?: string;
  gender?: 'male' | 'female' | null;
  dateOfBirth?: string | null;
  role: 'customer' | 'admin';
  status: 'active' | 'inactive' | 'suspended' | 'banned';
  address?: Address;
  createdAt: string;
}
export interface Address {
  fullName: string;
  phone: string;
  street: string;
  city: string;
  state?: string;
  postalCode: string;
  country: string;
}
export interface Named {
  _id: string;
  name: string;
  slug: string;
  description?: string;
}
export interface Variant {
  _id?: string;
  sku: string;
  color?: { name: string; code?: string };
  size?: string;
  price?: number;
  stock: number;
  images?: string[];
  isAvailable: boolean;
}
export interface Product {
  _id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice?: number;
  gender: string;
  productType: string;
  season: string;
  tags: string[];
  images: string[];
  brand: Named | string;
  category: Named | string;
  variants: Variant[];
  featured: boolean;
  isActive: boolean;
  ratingAverage: number;
  ratingCount: number;
  totalStock: number;
}
export interface Paginated<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; pages: number };
}
export interface CartLine {
  product: string;
  slug: string;
  sku: string;
  name: string;
  image: string | null;
  color: string | null;
  size: string | null;
  price: number;
  stock: number;
  quantity: number;
  lineTotal: number;
  available: boolean;
}
export interface Cart {
  items: CartLine[];
  subtotal: number;
  shippingFee: number;
  tax: number;
  total: number;
  count: number;
}
export interface OrderItem {
  product: string;
  sku: string;
  name: string;
  image?: string;
  color?: string;
  size?: string;
  price: number;
  quantity: number;
}
export type OrderStatus = 'pending' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled';
export interface Order {
  _id: string;
  orderNumber: string;
  user: string | { _id: string; firstName: string; lastName: string; email: string };
  items: OrderItem[];
  shippingAddress: Address;
  paymentMethod: 'cod' | 'card';
  isPaid: boolean;
  subtotal: number;
  shippingFee: number;
  tax: number;
  total: number;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: string }[];
  createdAt: string;
}
export interface Review {
  _id: string;
  rating: number;
  comment?: string;
  createdAt: string;
  user: { _id: string; firstName: string; lastName: string };
}
export interface Stats {
  revenue: number;
  orders: number;
  customers: number;
  products: number;
  ordersByStatus: Record<string, number>;
  daily: { date: string; revenue: number; orders: number }[];
  topProducts: { _id: string; name: string; sold: number; revenue: number }[];
  lowStock: { _id: string; name: string; sku: string; stock: number }[];
}
export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export const API = '/api/v1';
export const STATUSES: OrderStatus[] = [
  'pending',
  'paid',
  'processing',
  'shipped',
  'delivered',
  'cancelled',
];
export const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
export const GENDERS = ['men', 'women', 'unisex', 'kids'];
export const TYPES = [
  't-shirt',
  'shirt',
  'jeans',
  'pants',
  'dress',
  'skirt',
  'jacket',
  'hoodie',
  'sweater',
  'shorts',
  'shoes',
  'accessory',
  'other',
];

export const nameOf = (x: Named | string | undefined | null) =>
  x && typeof x === 'object' ? x.name : '';
export const idOf = (x: Named | string) => (typeof x === 'object' ? x._id : x);
export const errMsg = (e: unknown, fallback = 'Something went wrong') => {
  const err = e as { error?: { message?: string; details?: { field: string; message: string }[] } };
  const d = err?.error?.details?.[0];
  return d ? `${d.field}: ${d.message}` : err?.error?.message || fallback;
};

export type ReportType = 'sales' | 'products' | 'categories' | 'customers' | 'inventory';
export interface ReportParams {
  from?: string;
  to?: string;
  interval?: 'day' | 'week' | 'month';
  threshold?: number;
}
export interface SalesReport {
  range: { from: string; to: string; interval: string };
  totals: {
    orders: number;
    revenue: number;
    items: number;
    tax: number;
    shipping: number;
    cancelledOrders: number;
    cancelledValue: number;
    averageOrderValue: number;
  };
  series: { period: string; orders: number; items: number; revenue: number }[];
  byStatus: Record<string, number>;
  byPayment: Record<string, number>;
}
export interface ProductRow {
  productId: string;
  name: string;
  units: number;
  revenue: number;
  orders: number;
}
export interface CategoryRow {
  category: string;
  units: number;
  revenue: number;
  share: number;
}
export interface CustomersReport {
  newCustomers: number;
  totalCustomers: number;
  activeBuyers: number;
  top: {
    userId: string;
    name: string;
    email: string;
    orders: number;
    spent: number;
    averageOrder: number;
    lastOrder: string;
  }[];
}
export interface InventoryReport {
  threshold: number;
  totals: { variants: number; units: number; stockValue: number; out: number; low: number };
  rows: {
    product: string;
    sku: string;
    color: string;
    size: string;
    stock: number;
    price: number;
    stockValue: number;
    status: 'out' | 'low' | 'ok';
  }[];
}
export interface CacheStats {
  enabled: boolean;
  entries: number;
  maxEntries: number;
  ttlSeconds: number;
  hits: number;
  misses: number;
  hitRate: number;
}

// ---- logs & system
export type LogType = 'audit' | 'security' | 'error';
export interface ActivityEntry {
  _id: string;
  type: LogType;
  action: string;
  message?: string;
  actor?: { id: string; email: string; role: string };
  target?: { type: string; id?: string; label?: string };
  meta?: Record<string, unknown>;
  ip?: string;
  requestId?: string;
  createdAt: string;
}
export interface LogsResponse extends Paginated<ActivityEntry> {
  summary: { last24h: Record<LogType, number> };
}
export interface LogParams {
  type?: LogType | '';
  q?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}
export interface BackupFile {
  name: string;
  kind: 'db' | 'uploads';
  bytes: number;
  modifiedAt: string;
}
export interface SystemInfo {
  api: { status: string; uptimeSeconds: number; node: string; env: string; pid: number };
  db: { status: string; name: string; collections: Record<string, number | null> };
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  cache: CacheStats;
  logging: {
    level: string;
    format: string;
    dbRetentionDays: number;
    files: {
      enabled: boolean;
      dir?: string;
      retentionDays?: number;
      files?: { name: string; bytes: number }[];
    };
  };
  backup: {
    configured: boolean;
    state: 'ok' | 'stale' | 'none' | 'unreachable' | 'not_configured';
    dir?: string;
    intervalHours?: number;
    latestDb?: BackupFile | null;
    latestUploads?: BackupFile | null;
    files?: BackupFile[];
    totalFiles?: number;
  };
  time: string;
}

const { z } = require('zod');
const { ENUMS } = require('../models/product.model');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const idParam = z.object({ id: objectId });
const str = (min = 1, max = 200) => z.string().trim().min(min).max(max);

const password = z.string().min(8).max(72)
  .regex(/[a-z]/, 'Needs a lowercase letter').regex(/[A-Z]/, 'Needs an uppercase letter').regex(/\d/, 'Needs a digit');

const address = z.object({
  fullName: str(2, 80), phone: str(5, 25), street: str(3, 150), city: str(2, 80),
  state: z.string().trim().max(80).optional().default(''), postalCode: str(2, 20), country: str(2, 80),
});

const auth = {
  register: z.object({
    firstName: str(2, 30), lastName: str(2, 30), email: z.email().toLowerCase(), password,
    phone: z.string().trim().max(25).optional(),
    dateOfBirth: z.coerce.date().optional(),
    gender: z.enum(['female', 'male']).optional(),
  }),
  login: z.object({ email: z.email().toLowerCase(), password: z.string().min(1) }),
  refresh: z.object({ refreshToken: z.string().min(10) }),
  changePassword: z.object({ currentPassword: z.string().min(1), newPassword: password }),
};

const user = {
  updateMe: z.object({
    firstName: str(2, 30).optional(), lastName: str(2, 30).optional(),
    phone: z.string().trim().max(25).optional(), dateOfBirth: z.coerce.date().optional(),
    gender: z.enum(['female', 'male']).optional(), address: address.optional(),
  }),
  adminUpdate: z.object({
    role: z.enum(['customer', 'admin']).optional(),
    status: z.enum(['active', 'inactive', 'suspended', 'banned']).optional(),
  }),
  list: z.object({
    page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().trim().max(100).optional(), role: z.enum(['customer', 'admin']).optional(),
  }),
};

const named = z.object({ name: str(2, 80), description: z.string().trim().max(500).optional() });
const category = { create: named.extend({ parent: objectId.nullable().optional() }), update: named.extend({ parent: objectId.nullable().optional() }).partial() };
const brand = { create: z.object({ name: str(2, 80) }), update: z.object({ name: str(2, 80).optional() }) };

const variant = z.object({
  sku: str(1, 60),
  color: z.object({ name: str(1, 40), code: z.string().trim().max(20).optional() }).optional(),
  size: z.enum(ENUMS.SIZES).optional(),
  price: z.coerce.number().min(0).optional(),
  stock: z.coerce.number().int().min(0).default(0),
  images: z.array(z.string()).optional(),
  isAvailable: z.boolean().optional(),
});
const productBase = z.object({
  name: str(2, 150), description: str(1, 5000),
  price: z.coerce.number().min(0), compareAtPrice: z.coerce.number().min(0).optional(),
  gender: z.enum(ENUMS.GENDERS), productType: z.enum(ENUMS.TYPES).optional(), season: z.enum(ENUMS.SEASONS).optional(),
  brand: objectId, category: objectId, subcategory: objectId.nullable().optional(),
  tags: z.array(str(1, 30)).max(20).optional(), images: z.array(z.string()).max(10).optional(),
  variants: z.array(variant).min(1).max(100)
    .refine((v) => new Set(v.map((x) => x.sku)).size === v.length, 'Variant SKUs must be unique'),
  featured: z.boolean().optional(), isActive: z.boolean().optional(),
});
const product = {
  create: productBase,
  update: productBase.partial(),
  list: z.object({
    page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).optional(),
    q: z.string().trim().max(100).optional(),
    category: z.string().trim().max(100).optional(), brand: z.string().trim().max(100).optional(),
    gender: z.enum(ENUMS.GENDERS).optional(), productType: z.enum(ENUMS.TYPES).optional(),
    season: z.enum(ENUMS.SEASONS).optional(), size: z.enum(ENUMS.SIZES).optional(),
    minPrice: z.coerce.number().min(0).optional(), maxPrice: z.coerce.number().min(0).optional(),
    minRating: z.coerce.number().min(0).max(5).optional(),
    featured: z.enum(['true', 'false']).optional(), inStock: z.enum(['true', 'false']).optional(),
    includeInactive: z.enum(['true', 'false']).optional(),
    sort: z.enum(['newest', 'price_asc', 'price_desc', 'rating', 'name']).optional(),
  }),
};

const cart = {
  add: z.object({ productId: objectId, sku: str(1, 60), quantity: z.coerce.number().int().min(1).max(20).default(1) }),
  update: z.object({ quantity: z.coerce.number().int().min(1).max(20) }),
  itemParams: z.object({ productId: objectId, sku: str(1, 60) }),
};

const order = {
  create: z.object({ shippingAddress: address, paymentMethod: z.enum(['cod', 'card']).default('cod') }),
  updateStatus: z.object({ status: z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']) }),
  list: z.object({
    page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled']).optional(),
  }),
};

const review = {
  create: z.object({ rating: z.coerce.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional() }),
  list: z.object({ page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(50).optional() }),
};

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const report = {
  query: z.object({
    from: date.optional(), to: date.optional(),
    interval: z.enum(['day', 'week', 'month']).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    threshold: z.coerce.number().int().min(0).max(1000).optional(),
    format: z.enum(['json', 'csv']).optional(),
  }),
  type: z.object({ type: z.enum(['sales', 'products', 'categories', 'customers', 'inventory']) }),
};

const logs = {
  query: z.object({
    type: z.enum(['audit', 'security', 'error']).optional(),
    action: z.string().trim().max(60).optional(),
    status: z.string().trim().max(30).optional(),
    q: z.string().trim().max(100).optional(),
    from: date.optional(), to: date.optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    format: z.enum(['json', 'csv']).optional(),
  }),
};

module.exports = { logs, report, idParam, auth, user, category, brand, product, cart, order, review };

const mongoose = require('mongoose');
const Product = require('../models/product.model');
const Category = require('../models/category.model');
const Brand = require('../models/brand.model');
const ApiError = require('../utils/ApiError');
const { audit } = require('../services/audit');
const { pageParams, paginated, escapeRegex } = require('../utils/pagination');

const SORTS = {
  newest: { createdAt: -1 }, price_asc: { price: 1 }, price_desc: { price: -1 },
  rating: { ratingAverage: -1, ratingCount: -1 }, name: { name: 1 },
};

/** Accept either an ObjectId or a slug for category/brand filters. */
async function resolveRef(Model, value) {
  if (mongoose.isValidObjectId(value)) return value;
  const doc = await Model.findOne({ slug: value }).select('_id');
  return doc ? doc._id : null;
}

exports.list = async (req, res) => {
  const f = req.valid.query;
  const isAdmin = req.user?.role === 'admin';
  const filter = {};
  if (!(isAdmin && f.includeInactive === 'true')) filter.isActive = true;

  const and = [];
  if (f.q) {
    const rx = new RegExp(escapeRegex(f.q), 'i');
    and.push({ $or: [{ name: rx }, { tags: rx }, { description: rx }] });
  }
  if (f.category) {
    const id = await resolveRef(Category, f.category);
    if (!id) return res.json(paginated([], 0, pageParams(f)));
    and.push({ $or: [{ category: id }, { subcategory: id }] });
  }
  if (f.brand) {
    const id = await resolveRef(Brand, f.brand);
    if (!id) return res.json(paginated([], 0, pageParams(f)));
    filter.brand = id;
  }
  if (f.gender) filter.gender = { $in: [f.gender, 'unisex'] };
  if (f.productType) filter.productType = f.productType;
  if (f.season) filter.season = f.season;
  if (f.featured) filter.featured = f.featured === 'true';
  if (f.minRating) filter.ratingAverage = { $gte: f.minRating };
  if (f.minPrice !== undefined || f.maxPrice !== undefined) {
    filter.price = {};
    if (f.minPrice !== undefined) filter.price.$gte = f.minPrice;
    if (f.maxPrice !== undefined) filter.price.$lte = f.maxPrice;
  }
  const variantMatch = {};
  if (f.size) variantMatch.size = f.size;
  if (f.inStock === 'true') { variantMatch.stock = { $gt: 0 }; variantMatch.isAvailable = true; }
  if (Object.keys(variantMatch).length) filter.variants = { $elemMatch: variantMatch };

  if (and.length) filter.$and = and;

  const p = pageParams(f);
  const sort = SORTS[f.sort || 'newest'];
  const query = Product.find(filter)
    .populate('brand', 'name slug').populate('category', 'name slug')
    .sort(sort).skip(p.skip).limit(p.limit);
  const [items, total] = await Promise.all([query, Product.countDocuments(filter)]);
  res.json(paginated(items, total, p));
};

exports.get = async (req, res) => {
  const { id } = req.valid.params;
  const key = mongoose.isValidObjectId(id) ? { _id: id } : { slug: id };
  const product = await Product.findOne(key).populate('brand', 'name slug').populate('category', 'name slug').populate('subcategory', 'name slug');
  if (!product || (!product.isActive && req.user?.role !== 'admin')) throw ApiError.notFound('Product not found');
  res.json(product);
};

exports.create = async (req, res) => {
  await assertRefs(req.valid.body);
  const created = await Product.create(req.valid.body);
  await audit(req, 'product.create', { target: { type: 'product', id: created._id, label: created.name }, meta: { price: created.price, variants: created.variants.length } });
  res.status(201).json(created);
};

exports.update = async (req, res) => {
  await assertRefs(req.valid.body);
  const product = await Product.findById(req.valid.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  product.set(req.valid.body);
  await product.save();
  await audit(req, 'product.update', { target: { type: 'product', id: product._id, label: product.name }, meta: { fields: Object.keys(req.valid.body) } });
  res.json(product);
};

exports.remove = async (req, res) => {
  const product = await Product.findByIdAndDelete(req.valid.params.id);
  if (!product) throw ApiError.notFound('Product not found');
  await audit(req, 'product.delete', { target: { type: 'product', id: product._id, label: product.name } });
  res.status(204).end();
};

exports.related = async (req, res) => {
  const p = await Product.findById(req.valid.params.id);
  if (!p) throw ApiError.notFound('Product not found');
  const items = await Product.find({ _id: { $ne: p._id }, category: p.category, isActive: true }).limit(4).populate('brand', 'name');
  res.json(items);
};

async function assertRefs(b) {
  if (b.category && !(await Category.exists({ _id: b.category }))) throw ApiError.badRequest('Category does not exist');
  if (b.brand && !(await Brand.exists({ _id: b.brand }))) throw ApiError.badRequest('Brand does not exist');
  if (b.subcategory && !(await Category.exists({ _id: b.subcategory }))) throw ApiError.badRequest('Subcategory does not exist');
}

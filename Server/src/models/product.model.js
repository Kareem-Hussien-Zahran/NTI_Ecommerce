const mongoose = require('mongoose');
const slugify = require('../utils/slugify');

const GENDERS = ['men', 'women', 'unisex', 'kids'];
const TYPES = ['t-shirt', 'shirt', 'jeans', 'pants', 'dress', 'skirt', 'jacket', 'hoodie', 'sweater', 'shorts', 'shoes', 'accessory', 'other'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter', 'all-season'];
const SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

const variantSchema = new mongoose.Schema({
  sku: { type: String, required: true, trim: true },
  color: { name: String, code: String },
  size: { type: String, enum: SIZES },
  price: { type: Number, min: 0 }, // optional override of product.price
  stock: { type: Number, min: 0, default: 0 },
  images: [String],
  isAvailable: { type: Boolean, default: true },
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 150 },
  slug: { type: String, unique: true, lowercase: true, trim: true },
  description: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  compareAtPrice: { type: Number, min: 0 },
  gender: { type: String, enum: GENDERS, required: true },
  productType: { type: String, enum: TYPES, default: 'other' },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  subcategory: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
  tags: [{ type: String, lowercase: true, trim: true }],
  season: { type: String, enum: SEASONS, default: 'all-season' },
  images: [String],
  variants: { type: [variantSchema], validate: (v) => v.length > 0 },
  featured: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
  ratingCount: { type: Number, default: 0 },
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

productSchema.index({ name: 1 });
productSchema.index({ category: 1, gender: 1, price: 1 });
productSchema.index({ 'variants.sku': 1 });

productSchema.virtual('totalStock').get(function () {
  return (this.variants || []).reduce((s, v) => s + (v.isAvailable ? v.stock : 0), 0);
});

productSchema.pre('validate', async function () {
  if (!this.slug || this.isModified('name')) {
    const base = slugify(this.name);
    let slug = base, n = 1;
    while (await this.constructor.exists({ slug, _id: { $ne: this._id } })) slug = `${base}-${++n}`;
    this.slug = slug;
  }
});

module.exports = mongoose.model('Product', productSchema);
module.exports.ENUMS = { GENDERS, TYPES, SEASONS, SIZES };

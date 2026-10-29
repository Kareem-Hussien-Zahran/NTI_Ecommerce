const mongoose = require('mongoose');

const reviewSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  rating: { type: Number, min: 1, max: 5, required: true },
  comment: { type: String, trim: true, maxlength: 1000 },
}, { timestamps: true });

reviewSchema.index({ product: 1, user: 1 }, { unique: true }); // one review per user per product

/** Recompute the denormalised rating fields on the product. */
reviewSchema.statics.recalculate = async function (productId) {
  const ratings = (await this.find({ product: productId }).select('rating').lean()).map((r) => r.rating);
  const avg = ratings.length ? ratings.reduce((s, x) => s + x, 0) / ratings.length : 0;
  await mongoose.model('Product').findByIdAndUpdate(productId, { ratingAverage: Math.round(avg * 10) / 10, ratingCount: ratings.length });
};

module.exports = mongoose.model('Review', reviewSchema);

const Review = require('../models/review.model');
const Order = require('../models/order.model');
const Product = require('../models/product.model');
const ApiError = require('../utils/ApiError');
const { audit } = require('../services/audit');
const { pageParams, paginated } = require('../utils/pagination');

exports.list = async (req, res) => {
  const p = pageParams(req.valid.query, 10, 50);
  const filter = { product: req.valid.params.id };
  const [items, total] = await Promise.all([
    Review.find(filter).sort('-createdAt').skip(p.skip).limit(p.limit).populate('user', 'firstName lastName'),
    Review.countDocuments(filter),
  ]);
  res.json(paginated(items, total, p));
};

exports.create = async (req, res) => {
  const productId = req.valid.params.id;
  if (!(await Product.exists({ _id: productId }))) throw ApiError.notFound('Product not found');
  // only customers who actually received the product may review it
  const bought = await Order.exists({ user: req.user._id, status: 'delivered', 'items.product': productId });
  if (!bought && req.user.role !== 'admin') throw ApiError.forbidden('You can only review products you have received');
  const review = await Review.findOneAndUpdate(
    { product: productId, user: req.user._id },
    { $set: req.valid.body },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  await Review.recalculate(productId);
  await audit(req, 'review.create', { target: { type: 'product', id: productId }, meta: { rating: req.valid.body.rating } });
  res.status(201).json(review);
};

exports.remove = async (req, res) => {
  const review = await Review.findById(req.valid.params.id);
  if (!review) throw ApiError.notFound('Review not found');
  if (String(review.user) !== String(req.user._id) && req.user.role !== 'admin') throw ApiError.forbidden();
  await review.deleteOne();
  await Review.recalculate(review.product);
  await audit(req, 'review.delete', { target: { type: 'review', id: review._id }, meta: { product: String(review.product), byAdmin: req.user.role === 'admin' } });
  res.status(204).end();
};

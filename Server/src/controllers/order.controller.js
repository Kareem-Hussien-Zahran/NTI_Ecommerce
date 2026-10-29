const crypto = require('crypto');
const Order = require('../models/order.model');
const Cart = require('../models/cart.model');
const Product = require('../models/product.model');
const ApiError = require('../utils/ApiError');
const { audit } = require('../services/audit');
const { resolveLine, totals } = require('../utils/pricing');
const { pageParams, paginated } = require('../utils/pagination');

const orderNumber = () => `ORD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

/** Atomically take stock; the $elemMatch guard makes overselling impossible under concurrency. */
async function reserve(lines) {
  const done = [];
  try {
    for (const l of lines) {
      const r = await Product.updateOne(
        { _id: l.product, variants: { $elemMatch: { sku: l.sku, isAvailable: true, stock: { $gte: l.quantity } } } },
        { $inc: { 'variants.$.stock': -l.quantity } },
      );
      if (r.modifiedCount !== 1) throw ApiError.conflict(`"${l.name}" (${l.size || ''} ${l.color || ''}) is out of stock`);
      done.push(l);
    }
  } catch (e) { await release(done); throw e; }
}

async function release(lines) {
  for (const l of lines) {
    await Product.updateOne({ _id: l.product, 'variants.sku': l.sku }, { $inc: { 'variants.$.stock': l.quantity } });
  }
}

exports.create = async (req, res) => {
  const { shippingAddress, paymentMethod } = req.valid.body;
  const cart = await Cart.findOne({ user: req.user._id }).populate('items.product');
  const lines = (cart?.items || []).map((i) => resolveLine(i.product, i.sku, i.quantity)).filter(Boolean);
  if (!lines.length) throw ApiError.badRequest('Your cart is empty');

  await reserve(lines);
  try {
    const t = totals(lines);
    const paid = paymentMethod === 'card'; // payment gateway is simulated: "card" is marked paid immediately
    const order = await Order.create({
      orderNumber: orderNumber(), user: req.user._id, shippingAddress, paymentMethod,
      items: lines.map(({ product, sku, name, image, color, size, price, quantity }) => ({ product, sku, name, image, color, size, price, quantity })),
      ...t,
      isPaid: paid, paidAt: paid ? new Date() : undefined,
      status: paid ? 'paid' : 'pending',
      statusHistory: [{ status: paid ? 'paid' : 'pending' }],
    });
    await Cart.deleteOne({ user: req.user._id });
    await audit(req, 'order.create', { target: { type: 'order', id: order._id, label: order.orderNumber }, meta: { total: order.total, items: order.items.length, payment: paymentMethod } });
    res.status(201).json(order);
  } catch (e) { await release(lines); throw e; }
};

exports.mine = async (req, res) => {
  const p = pageParams(req.valid.query, 10);
  const filter = { user: req.user._id, ...(req.valid.query.status && { status: req.valid.query.status }) };
  const [items, total] = await Promise.all([Order.find(filter).sort('-createdAt').skip(p.skip).limit(p.limit), Order.countDocuments(filter)]);
  res.json(paginated(items, total, p));
};

exports.get = async (req, res) => {
  const order = await Order.findById(req.valid.params.id).populate('user', 'firstName lastName email');
  const owner = order && String(order.user._id || order.user) === String(req.user._id);
  if (!order || (!owner && req.user.role !== 'admin')) throw ApiError.notFound('Order not found');
  res.json(order);
};

exports.cancel = async (req, res) => {
  const order = await Order.findOne({ _id: req.valid.params.id, user: req.user._id });
  if (!order) throw ApiError.notFound('Order not found');
  if (!['pending', 'paid', 'processing'].includes(order.status)) throw ApiError.badRequest(`Cannot cancel an order that is ${order.status}`);
  const from = order.status;
  await setStatus(order, 'cancelled');
  await audit(req, 'order.cancel', { target: { type: 'order', id: order._id, label: order.orderNumber }, meta: { from, to: 'cancelled' } });
  res.json(order);
};

// ---- admin
exports.all = async (req, res) => {
  const p = pageParams(req.valid.query, 15);
  const filter = req.valid.query.status ? { status: req.valid.query.status } : {};
  const [items, total] = await Promise.all([
    Order.find(filter).sort('-createdAt').skip(p.skip).limit(p.limit).populate('user', 'firstName lastName email'),
    Order.countDocuments(filter),
  ]);
  res.json(paginated(items, total, p));
};

exports.updateStatus = async (req, res) => {
  const order = await Order.findById(req.valid.params.id);
  if (!order) throw ApiError.notFound('Order not found');
  const next = req.valid.body.status;
  if (['cancelled', 'delivered'].includes(order.status)) throw ApiError.badRequest(`Order is already ${order.status}`);
  const from = order.status;
  await setStatus(order, next);
  await audit(req, 'order.status', { target: { type: 'order', id: order._id, label: order.orderNumber }, meta: { from, to: next } });
  res.json(order);
};

async function setStatus(order, status) {
  if (status === 'cancelled') await release(order.items);
  order.status = status;
  if (status === 'paid' || status === 'delivered') { order.isPaid = true; order.paidAt ||= new Date(); }
  order.statusHistory.push({ status });
  await order.save();
}

const Cart = require('../models/cart.model');
const Product = require('../models/product.model');
const ApiError = require('../utils/ApiError');
const { resolveLine, totals } = require('../utils/pricing');

async function getCart(userId) {
  return (await Cart.findOne({ user: userId })) || new Cart({ user: userId, items: [] });
}

async function present(cart) {
  await cart.populate('items.product');
  const lines = [];
  for (const it of cart.items) {
    const line = resolveLine(it.product, it.sku, it.quantity);
    if (line) lines.push({ ...line, available: line.stock >= it.quantity });
  }
  return { items: lines, ...totals(lines), count: lines.reduce((s, l) => s + l.quantity, 0) };
}

exports.get = async (req, res) => res.json(await present(await getCart(req.user._id)));

exports.add = async (req, res) => {
  const { productId, sku, quantity } = req.valid.body;
  const product = await Product.findById(productId);
  const line = resolveLine(product, sku, quantity);
  if (!line) throw ApiError.notFound('Product variant not available');
  const cart = await getCart(req.user._id);
  const existing = cart.items.find((i) => String(i.product) === productId && i.sku === sku);
  const newQty = (existing?.quantity || 0) + quantity;
  if (newQty > line.stock) throw ApiError.badRequest(`Only ${line.stock} in stock`);
  if (existing) existing.quantity = newQty; else cart.items.push({ product: productId, sku, quantity });
  await cart.save();
  res.json(await present(cart));
};

exports.update = async (req, res) => {
  const { productId, sku } = req.valid.params;
  const { quantity } = req.valid.body;
  const cart = await getCart(req.user._id);
  const item = cart.items.find((i) => String(i.product) === productId && i.sku === sku);
  if (!item) throw ApiError.notFound('Item not in cart');
  const line = resolveLine(await Product.findById(productId), sku, quantity);
  if (!line) throw ApiError.notFound('Product variant not available');
  if (quantity > line.stock) throw ApiError.badRequest(`Only ${line.stock} in stock`);
  item.quantity = quantity;
  await cart.save();
  res.json(await present(cart));
};

exports.removeItem = async (req, res) => {
  const { productId, sku } = req.valid.params;
  const cart = await getCart(req.user._id);
  cart.items = cart.items.filter((i) => !(String(i.product) === productId && i.sku === sku));
  await cart.save();
  res.json(await present(cart));
};

exports.clear = async (req, res) => {
  await Cart.deleteOne({ user: req.user._id });
  res.json({ items: [], subtotal: 0, shippingFee: 0, tax: 0, total: 0, count: 0 });
};

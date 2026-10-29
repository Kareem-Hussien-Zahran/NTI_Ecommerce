const Order = require('../models/order.model');
const Product = require('../models/product.model');
const User = require('../models/user.model');
const R = require('../services/reports');
const { round2 } = require('../utils/pricing');

/** Dashboard summary. Built on the reporting service so numbers match the Reports page. */
exports.stats = async (_req, res) => {
  const now = new Date();
  const range = R.parseRange({}, now); // last 30 days
  const [recent, all, customers, products, lowProducts] = await Promise.all([
    R.loadOrders(range),
    Order.find().select('status total items.product items.name items.price items.quantity').lean(),
    User.countDocuments({ role: 'customer' }),
    Product.countDocuments(),
    Product.find({ 'variants.stock': { $lte: 5 }, isActive: true }).select('name variants.sku variants.stock').lean(),
  ]);
  const daily = R.summariseSales(recent, { ...range, interval: 'day' }).series;
  const live = all.filter((o) => o.status !== 'cancelled');
  const ordersByStatus = {};
  for (const o of all) ordersByStatus[o.status] = (ordersByStatus[o.status] || 0) + 1;

  const lowStock = lowProducts.flatMap((p) => p.variants.filter((v) => v.stock <= 5).map((v) => ({ _id: String(p._id), name: p.name, sku: v.sku, stock: v.stock })))
    .sort((a, b) => a.stock - b.stock).slice(0, 8);

  res.json({
    revenue: round2(live.reduce((s, o) => s + o.total, 0)), orders: live.length, customers, products, ordersByStatus,
    daily: daily.map((d) => ({ date: d.period, revenue: d.revenue, orders: d.orders })),
    topProducts: R.summariseProducts(all, 5).map((p) => ({ _id: p.productId, name: p.name, sold: p.units, revenue: p.revenue })),
    lowStock,
  });
};

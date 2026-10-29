const R = require('../services/reports');
const { toCsv } = require('../utils/csv');
const { cache } = require('../utils/cache');
const { audit } = require('../services/audit');

// what each report exports as CSV (rows + column order)
const CSV = {
  sales: (d) => ({ rows: d.series, cols: ['period', 'orders', 'items', 'revenue'] }),
  products: (d) => ({ rows: d, cols: ['name', 'units', 'revenue', 'orders', 'productId'] }),
  categories: (d) => ({ rows: d, cols: ['category', 'units', 'revenue', 'share'] }),
  customers: (d) => ({ rows: d.top, cols: ['name', 'email', 'orders', 'spent', 'averageOrder', 'lastOrder'] }),
  inventory: (d) => ({ rows: d.rows, cols: ['product', 'sku', 'color', 'size', 'stock', 'price', 'stockValue', 'status'] }),
};

exports.report = async (req, res) => {
  const { type } = req.valid.params;
  const q = req.valid.query;
  const data = await R[type](q);
  if (q.format === 'csv') {
    const { rows, cols } = CSV[type](data);
    await audit(req, 'report.export', { meta: { type, from: q.from, to: q.to, rows: rows.length } });
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${type}-report-${new Date().toISOString().slice(0, 10)}.csv"`);
    return res.send(toCsv(rows, cols));
  }
  res.json(data);
};

exports.cacheStats = (_req, res) => res.json(cache.stats());
exports.cacheClear = async (req, res) => {
  const cleared = cache.clear();
  await audit(req, 'cache.clear', { meta: { cleared } });
  res.json({ cleared });
};

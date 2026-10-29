const config = require('../config/env');
const ApiError = require('./ApiError');

const round2 = (n) => Math.round(n * 100) / 100;

/** Resolve a cart/order line from a populated product + sku. Returns null if no longer purchasable. */
function resolveLine(product, sku, quantity) {
  if (!product || !product.isActive) return null;
  const v = product.variants.find((x) => x.sku === sku);
  if (!v || !v.isAvailable) return null;
  return {
    product: product._id,
    slug: product.slug,
    sku: v.sku,
    name: product.name,
    image: v.images?.[0] || product.images?.[0] || null,
    color: v.color?.name || null,
    size: v.size || null,
    price: v.price ?? product.price,
    stock: v.stock,
    quantity,
    lineTotal: round2((v.price ?? product.price) * quantity),
  };
}

function totals(lines) {
  const subtotal = round2(lines.reduce((s, l) => s + l.lineTotal, 0));
  const shippingFee = subtotal === 0 || subtotal >= config.shipping.freeOver ? 0 : config.shipping.flatFee;
  const tax = round2(subtotal * config.taxRate);
  return { subtotal, shippingFee, tax, total: round2(subtotal + shippingFee + tax) };
}

module.exports = { resolveLine, totals, round2, ApiError };

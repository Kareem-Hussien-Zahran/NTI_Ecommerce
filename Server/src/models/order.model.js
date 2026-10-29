const mongoose = require('mongoose');

const STATUSES = ['pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    sku: String,
    name: String,
    image: String,
    color: String,
    size: String,
    price: Number,
    quantity: { type: Number, min: 1 },
  }],
  shippingAddress: {
    fullName: String, phone: String, street: String, city: String,
    state: String, postalCode: String, country: String,
  },
  paymentMethod: { type: String, enum: ['cod', 'card'], default: 'cod' },
  isPaid: { type: Boolean, default: false },
  paidAt: Date,
  subtotal: Number,
  shippingFee: Number,
  tax: Number,
  total: Number,
  status: { type: String, enum: STATUSES, default: 'pending', index: true },
  statusHistory: [{ status: String, at: { type: Date, default: Date.now } }],
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
module.exports.STATUSES = STATUSES;

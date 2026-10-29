const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const addressSchema = new mongoose.Schema({
  fullName: { type: String, trim: true },
  phone: { type: String, trim: true },
  street: { type: String, trim: true },
  city: { type: String, trim: true },
  state: { type: String, trim: true },
  postalCode: { type: String, trim: true },
  country: { type: String, trim: true },
}, { _id: false });

const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

const userSchema = new mongoose.Schema({
  firstName: { type: String, required: true, trim: true, minlength: 2, maxlength: 30 },
  lastName: { type: String, required: true, trim: true, minlength: 2, maxlength: 30 },
  dateOfBirth: { type: Date, default: null },
  gender: { type: String, enum: ['female', 'male', null], default: null },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, select: false },
  phone: { type: String, trim: true, default: null },
  address: { type: addressSchema, default: undefined },
  isEmailVerified: { type: Boolean, default: false },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  status: { type: String, enum: ['active', 'inactive', 'suspended', 'banned'], default: 'active' },
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  failedLoginAttempts: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, default: null, select: false },
  refreshTokens: { type: [String], default: [], select: false },
  passwordChangedAt: { type: Date, select: false },
}, { timestamps: true });

userSchema.virtual('fullName').get(function () { return `${this.firstName} ${this.lastName}`; });

userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  this.password = await bcrypt.hash(this.password, 12);
  if (!this.isNew) this.passwordChangedAt = new Date();
});

userSchema.methods.isCorrectPassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.isLocked = function () {
  return !!this.lockUntil && this.lockUntil > new Date();
};

/** Track failed logins and lock the account temporarily after too many. */
userSchema.methods.registerFailedLogin = async function () {
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  if (this.failedLoginAttempts >= MAX_ATTEMPTS) {
    this.lockUntil = new Date(Date.now() + LOCK_MS);
    this.failedLoginAttempts = 0;
  }
  await this.save({ validateModifiedOnly: true });
};

userSchema.methods.toJSON = function () {
  const o = this.toObject({ virtuals: true });
  delete o.password; delete o.refreshTokens; delete o.failedLoginAttempts;
  delete o.lockUntil; delete o.passwordChangedAt; delete o.__v; delete o.id;
  return o;
};

module.exports = mongoose.model('User', userSchema);

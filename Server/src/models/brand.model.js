const mongoose = require('mongoose');
const slugify = require('../utils/slugify');

const brandSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true, maxlength: 80 },
  slug: { type: String, unique: true, lowercase: true },
  logo: { type: String },
}, { timestamps: true });

brandSchema.pre('validate', function () {
  if (this.isModified('name')) this.slug = slugify(this.name);
});

module.exports = mongoose.model('Brand', brandSchema);

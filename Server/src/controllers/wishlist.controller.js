const User = require('../models/user.model');
const Product = require('../models/product.model');
const ApiError = require('../utils/ApiError');

exports.list = async (req, res) => {
  const u = await User.findById(req.user._id).populate({ path: 'wishlist', match: { isActive: true }, populate: { path: 'brand', select: 'name' } });
  res.json(u.wishlist);
};

exports.toggle = async (req, res) => {
  const { id } = req.valid.params;
  if (!(await Product.exists({ _id: id }))) throw ApiError.notFound('Product not found');
  const has = req.user.wishlist.some((p) => String(p) === id);
  await User.updateOne({ _id: req.user._id }, has ? { $pull: { wishlist: id } } : { $addToSet: { wishlist: id } });
  res.json({ wishlisted: !has });
};

exports.ids = async (req, res) => res.json(req.user.wishlist.map(String));

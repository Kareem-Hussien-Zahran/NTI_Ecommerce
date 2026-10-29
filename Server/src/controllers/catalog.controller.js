const Category = require('../models/category.model');
const Brand = require('../models/brand.model');
const Product = require('../models/product.model');
const ApiError = require('../utils/ApiError');
const { audit } = require('../services/audit');

/** Generic CRUD factory for simple lookup collections (categories, brands). */
function crud(Model, label, usedByField) {
  const kind = label.toLowerCase();
  const ref = (doc) => ({ type: kind, id: doc._id, label: doc.name });
  return {
    list: async (_req, res) => res.json(await Model.find().sort('name')),
    create: async (req, res) => {
      const doc = await Model.create(req.valid.body);
      await audit(req, `${kind}.create`, { target: ref(doc) });
      res.status(201).json(doc);
    },
    update: async (req, res) => {
      const doc = await Model.findById(req.valid.params.id);
      if (!doc) throw ApiError.notFound(`${label} not found`);
      doc.set(req.valid.body);
      await doc.save();
      await audit(req, `${kind}.update`, { target: ref(doc), meta: { fields: Object.keys(req.valid.body) } });
      res.json(doc);
    },
    remove: async (req, res) => {
      const { id } = req.valid.params;
      if (await Product.exists({ [usedByField]: id })) throw ApiError.conflict(`${label} is used by products and cannot be deleted`);
      const doc = await Model.findByIdAndDelete(id);
      if (!doc) throw ApiError.notFound(`${label} not found`);
      await audit(req, `${kind}.delete`, { target: ref(doc) });
      res.status(204).end();
    },
  };
}

exports.categories = crud(Category, 'Category', 'category');
exports.brands = crud(Brand, 'Brand', 'brand');

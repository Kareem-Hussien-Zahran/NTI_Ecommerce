const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');

/**
 * validate({ body, query, params }) – parses with zod schemas and exposes the
 * cleaned values on req.valid. Unknown keys are stripped, types are coerced,
 * which also prevents NoSQL operator injection (e.g. {"$gt": ""}).
 */
const validate = (schemas) => (req, _res, next) => {
  try {
    req.valid = {};
    for (const key of ['params', 'query', 'body']) {
      if (schemas[key]) req.valid[key] = schemas[key].parse(req[key] ?? {});
    }
    next();
  } catch (e) {
    if (e instanceof ZodError) {
      const details = e.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      throw ApiError.badRequest('Validation failed', details);
    }
    throw e;
  }
};

module.exports = { validate };

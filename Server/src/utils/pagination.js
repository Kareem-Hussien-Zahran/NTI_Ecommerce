/** Parse page/limit and build the standard paginated response. */
function pageParams(q, defaultLimit = 12, maxLimit = 100) {
  const page = Math.max(1, Number(q.page) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number(q.limit) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}
const paginated = (items, total, { page, limit }) => ({
  items,
  meta: { total, page, limit, pages: Math.max(1, Math.ceil(total / limit)) },
});
const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
module.exports = { pageParams, paginated, escapeRegex };

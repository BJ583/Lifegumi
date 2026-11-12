// Bangumi subject and character IDs belong to separate namespaces.
function findBangumiItem(selectOne, id, resourceType) {
  if (!id) return null;
  if (!["subject", "character"].includes(resourceType)) throw new Error("Invalid Bangumi resource type");
  const condition = resourceType === "character" ? "item_type = 'wife'" : "item_type != 'wife'";
  return selectOne(`SELECT * FROM items WHERE bangumi_subject_id = ? AND ${condition} ORDER BY id ASC LIMIT 1`, [String(id)]);
}
module.exports = { findBangumiItem };

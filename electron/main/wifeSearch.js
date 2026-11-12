function wifeMatchesSearch(item, search, sourceById) {
  const source = sourceById.get(String(item.details?.source_item_id || ""));
  return [
    item.title,
    item.title_cn,
    item.original_title,
    item.details?.source_title,
    source?.title,
    source?.title_cn,
    source?.original_title
  ].some((value) => String(value || "").toLowerCase().includes(search));
}

module.exports = { wifeMatchesSearch };

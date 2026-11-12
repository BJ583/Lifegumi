export function buildGridEntries(items, showYearSeparators, yearGroupMode) {
  if (!showYearSeparators) return items.map((item) => ({ kind: "item", item }));
  const entries = [];
  let currentYear = null;
  for (const item of items) {
    const active = /追|在看|在玩/.test(String(item.status || ""));
    const sourceYear = String(item.details?.source_date || "").match(/\d{4}/)?.[0] || "未知";
    const groupLabel = yearGroupMode === "source"
      ? (item.details?.wife_pinned ? "置顶收藏" : sourceYear)
      : (active ? "进行中" : (String(item.year || "").trim() || "未知"));
    if (groupLabel !== currentYear) {
      currentYear = groupLabel;
      entries.push({ kind: "year", year: groupLabel, key: `year-${item.id}` });
    }
    entries.push({ kind: "item", item });
  }
  return entries;
}


export function sortWives(list, mode) {
  if (mode === "added_newest" || mode === "updated_newest") {
    const key = mode === "added_newest" ? "created_at" : "updated_at";
    return [...list].sort((a, b) =>
      String(b[key] || "").localeCompare(String(a[key] || "")) || Number(b.id || 0) - Number(a.id || 0)
    );
  }

  return [...list].sort((a, b) => {
    const pinnedOrder = Number(Boolean(b.details?.wife_pinned)) - Number(Boolean(a.details?.wife_pinned));
    if (pinnedOrder) return pinnedOrder;
    if (mode === "custom") return 0;
    const direction = mode === "source_newest" ? -1 : 1;
    const aMatch = String(a.details?.source_date || "").match(/\d{4}(?:-\d{1,2})?(?:-\d{1,2})?/);
    const bMatch = String(b.details?.source_date || "").match(/\d{4}(?:-\d{1,2})?(?:-\d{1,2})?/);
    if (!aMatch && !bMatch) return 0;
    if (!aMatch) return 1;
    if (!bMatch) return -1;
    return aMatch[0].localeCompare(bMatch[0]) * direction;
  });
}

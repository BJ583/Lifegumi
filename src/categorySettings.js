import { TYPE_OPTIONS } from "./itemSchemas";

const STORAGE_KEY = "lifegumi.categorySettings.v1";

export function defaultCategorySettings() {
  return TYPE_OPTIONS.map((type, index) => ({
    key: type.key,
    label: type.label,
    order: index,
    hidden: false
  }));
}

export function loadCategorySettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? JSON.parse(raw) : [];
    const savedByKey = new Map(saved.map((item) => [item.key, item]));
    return defaultCategorySettings()
      .map((item) => ({ ...item, ...savedByKey.get(item.key) }))
      .sort((a, b) => a.order - b.order);
  } catch {
    return defaultCategorySettings();
  }
}

export function saveCategorySettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function visibleCategorySettings(settings) {
  return settings.filter((item) => !item.hidden).sort((a, b) => a.order - b.order);
}

export function labelForType(settings, typeKey) {
  return settings.find((item) => item.key === typeKey)?.label || TYPE_OPTIONS.find((item) => item.key === typeKey)?.label || typeKey;
}

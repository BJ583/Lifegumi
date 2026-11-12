import { useEffect, useMemo, useRef, useState } from "react";
import { labelForType, loadCategorySettings, saveCategorySettings, visibleCategorySettings } from "./categorySettings";
import { BangumiBrowser } from "./components/BangumiBrowser";
import { BangumiImportModal } from "./components/BangumiImportModal";
import { BangumiSyncModal } from "./components/BangumiSyncModal";
import { BangumiSyncResultModal } from "./components/BangumiSyncResultModal";
import { CategorySettingsModal } from "./components/CategorySettingsModal";
import { DetailPanel } from "./components/DetailPanel";
import { ItemFormModal } from "./components/ItemFormModal";
import { ItemGrid } from "./components/ItemGrid";
import { LightNotebook } from "./components/LightNotebook";
import { ProgressTracker } from "./components/ProgressTracker";
import { ReleaseTimeline } from "./components/ReleaseTimeline";
import { Sidebar } from "./components/Sidebar";
import { StatisticsDashboard } from "./components/StatisticsDashboard";
import { TimeMachine } from "./components/TimeMachine";
import { Toast } from "./components/Toast";
import { TopBar } from "./components/TopBar";
import { buildYearOptions, DEFAULT_MAX_YEAR, DEFAULT_STATUS, emptyItem, itemToForm, YEAR_ITEM_TYPES } from "./itemSchemas";
import { sortWives } from "./wifeSorting";

const EMPTY_FILTERS = { type: "all", search: "", status: "", year: "", region: "", rating: "", showDropped: false, showYearSeparators: true };
const YEAR_MAX_STORAGE_KEY = "lifegumi.maxYear.v1";
const LAST_ACTIVE_TYPE_STORAGE_KEY = "lifegumi.lastActiveType.v1";
const PROGRESS_TRACKER_KEY = "progress_tracker";
const STATISTICS_KEY = "statistics";
const RELEASE_TIMELINE_KEY = "release_timeline";
const TIME_MACHINE_KEY = "time_machine";
const MANUAL_LOG_KEY = "manual_log";
const LIGHT_NOTEBOOK_KEY = "light_notebook";
const BANGUMI_BROWSER_KEY = "bangumi_browser";
const WIFE_HIDDEN_GROUPS_STORAGE_KEY = "lifegumi.wifeHiddenGroups.v1";
const WIFE_HIDDEN_SOURCES_STORAGE_KEY = "lifegumi.wifeHiddenSources.v1";

function loadHiddenWifeGroups() {
  try {
    const value = JSON.parse(localStorage.getItem(WIFE_HIDDEN_GROUPS_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.map(String).filter((group) => group !== "unbound") : [];
  } catch {
    return [];
  }
}

function loadActiveType(settings = loadCategorySettings()) {
  try {
    const saved = localStorage.getItem(LAST_ACTIVE_TYPE_STORAGE_KEY) || "all";
    const visibleKeys = new Set(visibleCategorySettings(settings).map((item) => item.key));
    return visibleKeys.has(saved) ? saved : "all";
  } catch {
    return "all";
  }
}

function loadMaxYear() {
  const saved = Number(localStorage.getItem(YEAR_MAX_STORAGE_KEY));
  const currentYear = new Date().getFullYear();
  const defaultMax = Math.max(DEFAULT_MAX_YEAR, currentYear);
  if (!Number.isFinite(saved) || saved < defaultMax) return defaultMax;
  // Previous builds used +1 as "extend max year", which could leave 2032+ in storage.
  // Reset that old state; future clicks add only the selected next year.
  if (saved > defaultMax) {
    localStorage.setItem(YEAR_MAX_STORAGE_KEY, String(defaultMax));
    return defaultMax;
  }
  return saved;
}

function loadHiddenWifeSources() {
  try {
    const value = JSON.parse(localStorage.getItem(WIFE_HIDDEN_SOURCES_STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

export default function App() {
  const [items, setItems] = useState([]);
  const [loadedType, setLoadedType] = useState("all");
  const [categorySettings, setCategorySettings] = useState(loadCategorySettings);
  const [activeType, setActiveType] = useState(() => loadActiveType(categorySettings));
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(null);
  const [storageInfo, setStorageInfo] = useState(null);
  const [toast, setToast] = useState(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [maxYear, setMaxYear] = useState(loadMaxYear);
  const [formSaving, setFormSaving] = useState(false);
  const [bangumiUpdating, setBangumiUpdating] = useState(false);
  const [progressRefreshKey, setProgressRefreshKey] = useState(0);
  const [searchFocusKey, setSearchFocusKey] = useState(0);
  const formSavingRef = useRef(false);
  const itemLoadRequestRef = useRef(0);
  const [formState, setFormState] = useState({ open: false, mode: "create", item: null, form: emptyItem("anime") });
  const [importState, setImportState] = useState({ open: false, url: "", loading: false, error: "", duplicate: null, draft: null });
  const [bangumiSyncOpen, setBangumiSyncOpen] = useState(false);
  const [bangumiSyncInitialType, setBangumiSyncInitialType] = useState("anime");
  const [bangumiSyncResult, setBangumiSyncResult] = useState(null);
  const [wifeSyncing, setWifeSyncing] = useState(false);
  const [wifeSyncProgress, setWifeSyncProgress] = useState(null);
  const [wifeSort, setWifeSort] = useState("custom");
  const [wifeSourceGroup, setWifeSourceGroup] = useState("");
  const [statDrilldown, setStatDrilldown] = useState(null);
  const [hiddenWifeSourceGroups, setHiddenWifeSourceGroups] = useState(loadHiddenWifeGroups);
  const [hiddenWifeSourceIds, setHiddenWifeSourceIds] = useState(loadHiddenWifeSources);
  const [sourceItems, setSourceItems] = useState([]);

  const effectiveType = filters.type !== "all" ? filters.type : activeType;
  const visibleCategories = useMemo(() => visibleCategorySettings(categorySettings), [categorySettings]);
  const normalCategories = useMemo(() => visibleCategories.filter((category) => category.key !== STATISTICS_KEY && category.key !== PROGRESS_TRACKER_KEY && category.key !== RELEASE_TIMELINE_KEY && category.key !== TIME_MACHINE_KEY && category.key !== MANUAL_LOG_KEY && category.key !== LIGHT_NOTEBOOK_KEY && category.key !== BANGUMI_BROWSER_KEY), [visibleCategories]);
  const yearOptions = useMemo(() => buildYearOptions(maxYear), [maxYear]);
  const isProgressView = activeType === PROGRESS_TRACKER_KEY;
  const isStatisticsView = activeType === STATISTICS_KEY;
  const isReleaseTimelineView = activeType === RELEASE_TIMELINE_KEY;
  const isTimeMachineView = activeType === TIME_MACHINE_KEY;
  const isManualLogView = activeType === MANUAL_LOG_KEY;
  const isLightNotebookView = activeType === LIGHT_NOTEBOOK_KEY;
  const isBangumiBrowserView = activeType === BANGUMI_BROWSER_KEY;
  const selectedId = selected?.id;
  const getTypeLabel = (typeKey) => labelForType(categorySettings, typeKey);

  useEffect(() => window.lifegumi.onBangumiSyncProgress((next) => {
    if (next?.direction === "pull") setWifeSyncProgress(next);
  }), []);

  async function loadSourceItems() {
    const data = await window.lifegumi.listItems({ item_type: "all", show_dropped: true });
    setSourceItems(data.filter((candidate) => candidate.item_type !== "wife"));
  }
  async function loadItems(type = effectiveType, nextFilters = filters) {
    const requestId = ++itemLoadRequestRef.current;
    const data = await window.lifegumi.listItems({
      item_type: type,
      search: nextFilters.search,
      status: nextFilters.status,
      year: nextFilters.year,
      region: nextFilters.region,
      rating: nextFilters.rating,
      show_dropped: nextFilters.showDropped
    });
    if (requestId !== itemLoadRequestRef.current) return data;
    const sourceById = new Map(sourceItems.map((source) => [String(source.id), source]));
    const wifeGroup = (item) => {
      if (item.details?.real_person_type) return "real";
      const sourceType = sourceById.get(String(item.details?.source_item_id || ""))?.item_type;
      if (sourceType === "online_game") return "online_game";
      if (sourceType === "game" || sourceType === "eroge") return "game";
      if (["anime", "manga", "light_novel"].includes(sourceType)) return "acn";
      if (sourceType === "novel" || sourceType === "published_book") return "novel";
      return "unbound";
    };
    const visibleData = type === "wife"
      ? data
        .filter((item) => !wifeSourceGroup || wifeGroup(item) === wifeSourceGroup)
        .filter((item) => statDrilldown?.sourceId || !hiddenWifeSourceGroups.includes(wifeGroup(item)))
        .filter((item) => statDrilldown?.sourceId || !hiddenWifeSourceIds.includes(String(item.details?.source_item_id || "")))
      : data;
    const drilledData = statDrilldown ? visibleData.filter((item) =>
      (!statDrilldown.types || statDrilldown.types.includes(item.item_type)) &&
      (!statDrilldown.sourceId || String(item.details?.source_item_id || "") === String(statDrilldown.sourceId)) &&
      (!statDrilldown.statusPattern || statDrilldown.statusPattern.test(String(item.status || "")))
    ) : visibleData;
    const wifeDisplayMode = nextFilters.showYearSeparators && wifeSort === "custom" ? "source_newest" : wifeSort;
    const displayed = type === "wife" ? sortWives(drilledData, wifeDisplayMode) : drilledData;
    setItems(displayed);
    setLoadedType(type);
    setSelected((current) => current ? displayed.find((item) => item.id === current.id) || current : null);
    return displayed;
  }

  useEffect(() => {
    window.lifegumi.getStorageInfo().then(setStorageInfo);
  }, []);
  useEffect(() => window.lifegumi.onBangumiBrowserImportSubject((url) => {
    setImportState({ open: true, url, loading: false, error: "", duplicate: null, draft: null });
  }), []);

  useEffect(() => {
    const requestId = ++itemLoadRequestRef.current;
    if (isStatisticsView || isProgressView || isReleaseTimelineView || isTimeMachineView || isManualLogView || isLightNotebookView || isBangumiBrowserView) return;
    const run = () => {
      if (requestId === itemLoadRequestRef.current) loadItems();
    };
    if (!filters.search) {
      run();
      return;
    }
    const timeoutId = setTimeout(run, 180);
    return () => clearTimeout(timeoutId);
  }, [isStatisticsView, isProgressView, isReleaseTimelineView, isTimeMachineView, isManualLogView, isLightNotebookView, isBangumiBrowserView, effectiveType, filters.search, filters.status, filters.year, filters.region, filters.rating, filters.showDropped, wifeSort, wifeSourceGroup, hiddenWifeSourceGroups, hiddenWifeSourceIds, sourceItems, statDrilldown]);

  useEffect(() => {
    if (activeType === "wife") loadSourceItems();
  }, [activeType]);

  useEffect(() => {
    function handleShortcut(event) {
      const key = event.key.toLowerCase();
      const isCommand = event.ctrlKey || event.metaKey;
      const hasOpenModal = formState.open || importState.open || categoryModalOpen || bangumiSyncOpen;

      if (isCommand && key === "f") {
        event.preventDefault();
        setSearchFocusKey((value) => value + 1);
        return;
      }

      if (hasOpenModal) return;

      if (isCommand && key === "n") {
        event.preventDefault();
        openCreate();
        return;
      }

      if (isCommand && key === "b") {
        event.preventDefault();
        setImportState({ open: true, url: "", loading: false, error: "", duplicate: null, draft: null });
        return;
      }

    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [formState.open, importState.open, categoryModalOpen, bangumiSyncOpen, activeType, effectiveType]);

  function rememberActiveType(typeKey) {
    setActiveType(typeKey);
    localStorage.setItem(LAST_ACTIVE_TYPE_STORAGE_KEY, typeKey);
  }

  function showToast(message, type = "success") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 2600);
  }

  function changeActiveType(typeKey) {
    rememberActiveType(typeKey);
    setFilters((current) => ({ ...EMPTY_FILTERS, showYearSeparators: current.showYearSeparators }));
    setWifeSourceGroup("");
    setStatDrilldown(null);
    setSelected(null);
  }

  function changeFilter(key, value) {
    setStatDrilldown(null);
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === "type" ? { status: "", region: value === "movie" || value === "tv_drama" ? current.region : "" } : {})
    }));
  }

  function openStatisticsDrilldown(drilldown) {
    const type = drilldown.types?.length === 1 ? drilldown.types[0] : "all";
    rememberActiveType(type);
    setFilters({ ...EMPTY_FILTERS, showYearSeparators: false });
    setWifeSourceGroup("");
    setSelected(null);
    setStatDrilldown(drilldown);
  }

  async function openSyncedItem(entry) {
    const matches = await window.lifegumi.listItems({ item_type: entry.itemType, show_dropped: true });
    const item = matches.find((candidate) => String(candidate.id) === String(entry.id));
    if (!item) { showToast("这条记录已不存在", "error"); return; }
    setBangumiSyncResult(null);
    setBangumiSyncOpen(false);
    setStatDrilldown(null);
    setWifeSourceGroup("");
    setFilters({ ...EMPTY_FILTERS });
    rememberActiveType(item.item_type);
    setSelected(item);
  }

  function retryBangumiSync() {
    const scope = bangumiSyncResult?.scope;
    setBangumiSyncResult(null);
    if (scope === "收藏角色") { syncBangumiWives(); return; }
    setBangumiSyncInitialType(scope === "游戏" ? "game" : "anime");
    setBangumiSyncOpen(true);
  }

  function updateCategorySettings(nextSettings) {
    setCategorySettings(nextSettings);
    saveCategorySettings(nextSettings);
    const visibleKeys = new Set(visibleCategorySettings(nextSettings).map((item) => item.key));
    if (!visibleKeys.has(activeType)) rememberActiveType("all");
    if (!visibleKeys.has(filters.type)) setFilters((current) => ({ ...current, type: "all" }));
  }

  function openCreate() {
    const typeKey = activeType === "all" || activeType === STATISTICS_KEY || activeType === PROGRESS_TRACKER_KEY || activeType === RELEASE_TIMELINE_KEY || activeType === TIME_MACHINE_KEY || activeType === MANUAL_LOG_KEY || activeType === LIGHT_NOTEBOOK_KEY || activeType === BANGUMI_BROWSER_KEY ? "anime" : activeType;
    if (typeKey === "wife") loadSourceItems();
    setFormState({ open: true, mode: "create", item: null, form: emptyItem(typeKey) });
  }

  function addOneYearOption(yearToInclude) {
    const nextMax = Math.max(maxYear, Number(yearToInclude) || 0, new Date().getFullYear(), 2031);
    setMaxYear(nextMax);
    localStorage.setItem(YEAR_MAX_STORAGE_KEY, String(nextMax));
  }

  function openEdit(item) {
    if (item.item_type === "wife") loadSourceItems();
    setFormState({ open: true, mode: "edit", item, form: itemToForm(item) });
  }

  function withCreateDefaults(draft) {
    const itemType = draft.item_type || "anime";
    return {
      ...draft,
      item_type: itemType,
      year: draft.year || (YEAR_ITEM_TYPES.has(itemType) ? String(new Date().getFullYear()) : ""),
      status: draft.status || DEFAULT_STATUS[itemType] || ""
    };
  }

  function closeForm() {
    if (formSaving) return;
    setFormState((current) => ({ ...current, open: false }));
  }

  async function chooseCover() {
    return window.lifegumi.selectCover();
  }

  async function saveForm(nextForm, submit) {
    const title = String(nextForm.title ?? "");
    const formToSave = {
      ...nextForm,
      title,
      title_cn: title
    };
    setFormState((current) => ({ ...current, form: formToSave }));
    if (!submit || formSavingRef.current) return;
    if (!title.trim()) {
      showToast("请填写名字", "error");
      return;
    }

    formSavingRef.current = true;
    setFormSaving(true);
    const isEdit = formState.mode === "edit" && formState.item;
    try {
      const saved = isEdit
        ? await window.lifegumi.updateItem(formState.item.id, formToSave)
        : await window.lifegumi.createItem(formToSave);

      setSelected(saved);
      setFormState((current) => ({ ...current, open: false, item: saved, form: itemToForm(saved) }));

      if (isEdit) {
        if (isProgressView) {
          setProgressRefreshKey((value) => value + 1);
        } else {
          await loadItems(effectiveType, filters);
        }
      } else {
        const cleanFilters = { ...EMPTY_FILTERS };
        rememberActiveType(saved.item_type);
        setFilters(cleanFilters);
        await loadItems(saved.item_type, cleanFilters);
      }

      setSelected(saved);
      showToast(isEdit ? "保存成功" : "添加成功");
    } catch (error) {
      showToast(error.message || "保存失败", "error");
    } finally {
      formSavingRef.current = false;
      setFormSaving(false);
    }
  }

  async function updateCurrentFormFromBangumi(currentForm) {
    const input = currentForm.bangumi_url || currentForm.bangumi_subject_id;
    if (!input || bangumiUpdating) return;

    setBangumiUpdating(true);
    try {
      const result = await window.lifegumi.updateFromBangumi({ input, preferredYear: currentForm.item_type === "game" ? currentForm.year : "" });
      if (!result.ok) {
        showToast(result.error || "Bangumi 更新失败", "error");
        return;
      }
      const draft = result.draft;
      const merged = {
        ...currentForm,
        title: draft.title || draft.title_cn || currentForm.title,
        title_cn: draft.title_cn || draft.title || currentForm.title_cn,
        original_title: draft.original_title || currentForm.original_title,
        year: draft.year || currentForm.year,
        bangumi_subject_id: draft.bangumi_subject_id || currentForm.bangumi_subject_id,
        bangumi_url: draft.bangumi_url || currentForm.bangumi_url,
        cover_path: draft.cover_path || currentForm.cover_path,
        coverSourcePath: "",
        details: {
          ...currentForm.details,
          ...draft.details
        }
      };
      setFormState((state) => ({ ...state, form: merged }));
      showToast("已从 Bangumi 更新，请确认后保存");
    } finally {
      setBangumiUpdating(false);
    }
  }

  async function deleteItem(item) {
    const ok = confirm(`确定删除「${item.title_cn || item.title}」吗？`);
    if (!ok) return;
    await window.lifegumi.deleteItem(item.id);
    if (selected?.id === item.id) setSelected(null);
    await loadItems();
    showToast("已删除");
  }

  async function reorderWifeItems(nextItems) {
    setItems(nextItems);
    try {
      await window.lifegumi.reorderWives(nextItems.map((item) => item.id));
    } catch (error) {
      await loadItems("wife", filters);
      showToast(error.message || "排序保存失败", "error");
    }
  }
  function toggleHiddenWifeGroup(group) {
    const next = hiddenWifeSourceGroups.includes(group)
      ? hiddenWifeSourceGroups.filter((value) => value !== group)
      : [...hiddenWifeSourceGroups, group];
    setHiddenWifeSourceGroups(next);
    localStorage.setItem(WIFE_HIDDEN_GROUPS_STORAGE_KEY, JSON.stringify(next));
  }
  function updateHiddenWifeSources(nextIds) {
    const normalized = Array.from(new Set(nextIds.map(String)));
    setHiddenWifeSourceIds(normalized);
    localStorage.setItem(WIFE_HIDDEN_SOURCES_STORAGE_KEY, JSON.stringify(normalized));
  }
  async function toggleWifePinned(item) {
    const updated = await window.lifegumi.updateItem(item.id, {
      ...item,
      details: { ...item.details, wife_pinned: !item.details?.wife_pinned }
    });
    if (selected?.id === item.id) setSelected(updated);
    await loadItems("wife", filters);
  }
  async function addWifeDetailImage(item) {
    try {
      const imagePath = await window.lifegumi.pasteClipboardCover();
      const updated = await window.lifegumi.updateItem(item.id, {
        ...item,
        cover_path: item.cover_path || imagePath,
        details: {
          ...item.details,
          gallery_paths: Array.from(new Set([...(item.details?.gallery_paths || []), imagePath]))
        }
      });
      setSelected(updated);
      await loadItems("wife", filters);
      showToast("图片已添加到人物图库");
      return imagePath;
    } catch (error) {
      showToast(error.message || "添加图片失败", "error");
      return null;
    }
  }
  async function syncBangumiWives() {
    if (wifeSyncing) return;
    setWifeSyncProgress({ direction: "pull", current: 0, total: 0, title: "正在读取 Bangumi 收藏列表..." });
    setWifeSyncing(true);
    showToast("正在同步 Bangumi 收藏角色...");
    try {
      const response = await window.lifegumi.pullBangumiCharacters();
      if (!response.ok) {
        showToast(response.error || "角色同步失败", "error");
        return;
      }
      await loadItems("wife", filters);
      const result = response.result;
      setBangumiSyncResult({ ...result, direction: "pull", scope: "收藏角色" });
    } finally {
      setWifeSyncing(false);
      setWifeSyncProgress(null);
    }
  }
  async function refreshAfterBangumiSync() {
    setProgressRefreshKey((value) => value + 1);
    if (!isStatisticsView && !isProgressView && !isReleaseTimelineView && !isTimeMachineView && !isManualLogView && !isBangumiBrowserView) await loadItems(effectiveType, filters);
  }

  async function importBangumi() {
    if (importState.loading) return;
    setImportState((current) => ({ ...current, loading: true, error: "", duplicate: null }));
    const result = await window.lifegumi.importBangumi(importState.url);
    if (!result.ok) {
      setImportState((current) => ({ ...current, loading: false, error: result.error }));
      return;
    }
    if (result.existing) {
      setImportState((current) => ({ ...current, loading: false, duplicate: result, draft: result.draft }));
      return;
    }
    const targetType = effectiveType !== "all" && normalCategories.some((category) => category.key === effectiveType)
      ? effectiveType
      : result.draft.item_type;
    const categorizedDraft = { ...result.draft, item_type: targetType };
    setImportState({ open: false, url: "", loading: false, error: "", duplicate: null, draft: null });
    setFormState({ open: true, mode: "create", item: null, form: withCreateDefaults(categorizedDraft) });
    showToast("Bangumi 导入成功，请确认后保存");
  }

  function viewExistingDuplicate() {
    const existing = importState.duplicate?.existing;
    if (!existing) return;
    const cleanFilters = { ...EMPTY_FILTERS };
    rememberActiveType(existing.item_type);
    setFilters(cleanFilters);
    setSelected(existing);
    setImportState({ open: false, url: "", loading: false, error: "", duplicate: null, draft: null });
    loadItems(existing.item_type, cleanFilters);
  }

  async function overwriteDuplicate() {
    const existing = importState.duplicate?.existing;
    const draft = importState.draft;
    if (!existing || !draft) return;
    const merged = {
      ...itemToForm(existing),
      title: draft.title || draft.title_cn,
      title_cn: draft.title_cn || draft.title,
      original_title: draft.original_title,
      year: draft.year,
      bangumi_subject_id: draft.bangumi_subject_id,
      bangumi_url: draft.bangumi_url,
      cover_path: draft.cover_path || existing.cover_path,
      details: { ...existing.details, ...draft.details }
    };
    const updated = await window.lifegumi.updateItem(existing.id, merged);
    const cleanFilters = { ...EMPTY_FILTERS };
    rememberActiveType(updated.item_type);
    setFilters(cleanFilters);
    setSelected(updated);
    setImportState({ open: false, url: "", loading: false, error: "", duplicate: null, draft: null });
    setFormState({ open: true, mode: "edit", item: updated, form: itemToForm(updated) });
    await loadItems(updated.item_type, cleanFilters);
    showToast("已覆盖 Bangumi 信息，请确认字段");
  }

  return (
    <div className="app-shell">
      <Sidebar
        activeType={activeType}
        categories={visibleCategories}
        onTypeChange={changeActiveType}
        onManageCategories={() => setCategoryModalOpen(true)}
        storageInfo={storageInfo}
      />
      <main className="main">
        {isStatisticsView ? (
          <StatisticsDashboard onOpenDrilldown={openStatisticsDrilldown} />
        ) : isProgressView ? (
          <ProgressTracker refreshKey={progressRefreshKey} getTypeLabel={getTypeLabel} onEdit={openEdit} showToast={showToast} />
        ) : isReleaseTimelineView ? (
          <ReleaseTimeline getTypeLabel={getTypeLabel} onEdit={openEdit} />
        ) : isTimeMachineView ? (
          <TimeMachine getTypeLabel={getTypeLabel} onEdit={openEdit} showToast={showToast} />
        ) : isLightNotebookView ? (
          <LightNotebook showToast={showToast} />
        ) : isBangumiBrowserView ? (
          <BangumiBrowser obscured={formState.open || importState.open || categoryModalOpen || bangumiSyncOpen} onClose={() => changeActiveType("all")} />
        ) : (
          <>
            <TopBar
              activeType={effectiveType || "all"}
              itemCount={items.length}
              filters={filters}
              categories={normalCategories}
              yearOptions={yearOptions}
              searchFocusKey={searchFocusKey}
              onFilterChange={changeFilter}
              onClearFilters={() => { setFilters((current) => ({ ...EMPTY_FILTERS, showYearSeparators: current.showYearSeparators })); setStatDrilldown(null); setWifeSourceGroup(""); }}
              drilldown={statDrilldown}
              onClearDrilldown={() => setStatDrilldown(null)}
              onAdd={openCreate}
              onImport={() => setImportState({ open: true, url: "", loading: false, error: "", duplicate: null, draft: null })}
              bangumiSyncing={wifeSyncing}
              wifeSyncProgress={wifeSyncProgress}
              wifeSort={wifeSort}
              onWifeSortChange={setWifeSort}
              wifeSourceGroup={wifeSourceGroup}
              onWifeSourceGroupChange={setWifeSourceGroup}
              hiddenWifeSourceGroups={hiddenWifeSourceGroups}
              onToggleHiddenWifeSourceGroup={toggleHiddenWifeGroup}
              wifeSourceItems={sourceItems}
              hiddenWifeSourceIds={hiddenWifeSourceIds}
              onHideWifeSource={(sourceId) => updateHiddenWifeSources([...hiddenWifeSourceIds, sourceId])}
              onShowWifeSource={(sourceId) => updateHiddenWifeSources(hiddenWifeSourceIds.filter((id) => id !== sourceId))}
              onBangumiSync={() => { if (effectiveType === "wife") syncBangumiWives(); else { setBangumiSyncInitialType(effectiveType === "game" ? "game" : "anime"); setBangumiSyncOpen(true); } }}
            />
              <div className="workspace">
                <ItemGrid items={items} selectedId={selectedId} getTypeLabel={getTypeLabel} showYearSeparators={filters.showYearSeparators && loadedType === effectiveType && effectiveType !== "all" && (effectiveType !== "wife" || wifeSort === "custom" || wifeSort.startsWith("source_"))} yearGroupMode={effectiveType === "wife" ? "source" : "year"} reorderable={effectiveType === "wife" && wifeSort === "custom" && !filters.search} onReorder={reorderWifeItems} onTogglePin={toggleWifePinned} onSelect={setSelected} onEdit={openEdit} onDelete={deleteItem} onAdd={openCreate} />
                <DetailPanel item={selected} typeLabel={selected ? getTypeLabel(selected.item_type) : ""} onEdit={openEdit} onDelete={deleteItem} onAddWifeImage={addWifeDetailImage} />
              </div>
          </>
        )}
      </main>

      <CategorySettingsModal
        open={categoryModalOpen}
        settings={categorySettings}
        onChange={updateCategorySettings}
        onClose={() => setCategoryModalOpen(false)}
      />

      <ItemFormModal
        open={formState.open}
        mode={formState.mode}
        item={formState.item}
        initialForm={formState.form}
        categories={normalCategories}
        yearOptions={yearOptions}
        sourceItems={sourceItems}
        saving={formSaving}
        bangumiUpdating={bangumiUpdating}
        onClose={closeForm}
        onSave={saveForm}
        onChooseCover={chooseCover}
        onAddYear={addOneYearOption}
        onBangumiUpdate={updateCurrentFormFromBangumi}
      />


      <BangumiSyncModal
        open={bangumiSyncOpen}
        initialType={bangumiSyncInitialType}
        onClose={() => setBangumiSyncOpen(false)}
        onCompleted={refreshAfterBangumiSync}
        onResult={setBangumiSyncResult}
        showToast={showToast}
      />
      <BangumiSyncResultModal result={bangumiSyncResult} onClose={() => setBangumiSyncResult(null)} onOpenItem={openSyncedItem} onRetry={retryBangumiSync} />
      <BangumiImportModal
        open={importState.open}
        url={importState.url}
        loading={importState.loading}
        error={importState.error}
        duplicate={importState.duplicate}
        onUrlChange={(url) => setImportState((current) => ({ ...current, url, error: "", duplicate: null }))}
        onClose={() => setImportState({ open: false, url: "", loading: false, error: "", duplicate: null, draft: null })}
        onImport={importBangumi}
        onViewExisting={viewExistingDuplicate}
        onOverwrite={overwriteDuplicate}
      />

      <Toast toast={toast} />
    </div>
  );
}












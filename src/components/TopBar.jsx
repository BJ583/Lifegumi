import { useEffect, useRef } from "react";
import { CalendarDays, Clapperboard, Download, Eye, EyeOff, Plus, RefreshCw, Search, X } from "lucide-react";
import { RATINGS, REGIONS, STATUS_OPTIONS, WIFE_RATINGS, WIFE_SUPER_RATING } from "../itemSchemas";
import { WifeSourceControls } from "./WifeSourceControls";

const WIFE_RATING_FILTERS = [
  { value: "__rated__", label: "已评分" },
  { value: WIFE_SUPER_RATING, label: "✨ 超五星" },
  ...WIFE_RATINGS.slice(0, 5).reverse()
];

export function TopBar({ activeType, itemCount, filters, categories, yearOptions, searchFocusKey, onFilterChange, onClearFilters, drilldown, onClearDrilldown, onAdd, onImport, onBangumiSync, bangumiSyncing = false, wifeSyncProgress = null, wifeSort = "custom", onWifeSortChange, wifeSourceGroup = "", onWifeSourceGroupChange, hiddenWifeSourceGroups = [], onToggleHiddenWifeSourceGroup, wifeSourceItems = [], hiddenWifeSourceIds = [], onHideWifeSource, onShowWifeSource }) {
  const searchRef = useRef(null);
  const statusOptions = activeType === "all"
    ? []
    : [...(STATUS_OPTIONS[activeType] || []), ...(activeType === "game" ? ["通关 🚩", "试玩版 🧪"] : [])];
  const activeLabel = categories.find((type) => type.key === activeType)?.label || "全部";
  const canFilterRegion = activeType === "movie" || activeType === "tv_drama";
  const isWife = activeType === "wife";
  const isWishlist = activeType === "wishlist";
  const canUseBangumiSync = activeType === "all" || activeType === "anime" || activeType === "game" || isWife;
  const syncCurrent = Number(wifeSyncProgress?.current) || 0;
  const syncTotal = Number(wifeSyncProgress?.total) || 0;
  const syncPercent = syncTotal > 0 ? Math.min(100, Math.round((syncCurrent / syncTotal) * 100)) : 0;
  const filterChips = [
    ["search", "搜索", filters.search], ["status", "状态", filters.status], ["year", "年份", filters.year],
    ["region", "地区", filters.region], ["rating", "评分", filters.rating]
  ].filter(([, , value]) => Boolean(value));

  useEffect(() => {
    if (!searchFocusKey) return;
    searchRef.current?.focus();
    searchRef.current?.select();
  }, [searchFocusKey]);

  return (
    <header className="topbar">
      <div className="page-title">
        <h1>{activeLabel}</h1>
        <p>{itemCount} 条记录</p>
      </div>

      <div className="topbar-main">
        <label className="searchbox">
          <Search size={18} />
          <input ref={searchRef} value={filters.search} onChange={(event) => onFilterChange("search", event.target.value)} placeholder={isWife ? "搜索名字、原文名、出处" : "搜索标题、作者、分类、状态、备注"} />
          {filters.search && (
            <button
              type="button"
              className="search-clear"
              onClick={(event) => {
                event.preventDefault();
                onFilterChange("search", "");
                searchRef.current?.focus();
              }}
              aria-label="清空搜索"
              title="清空搜索"
            >
              <X size={15} />
            </button>
          )}
        </label>

        {isWife && (
          <div className="topbar-filters wife-topbar-filters">
            <select className="inline-select" value={wifeSourceGroup} onChange={(event) => onWifeSourceGroupChange?.(event.target.value)} title="按出处大类筛选">
              <option value="">全部类型</option>
              <option value="game">游戏</option>
              <option value="online_game">网游</option>
              <option value="acn">ACN</option>
              <option value="novel">小说</option>
              <option value="real">三次元</option>
            </select>
            <WifeSourceControls sourceItems={wifeSourceItems} hiddenIds={hiddenWifeSourceIds} hiddenGroups={hiddenWifeSourceGroups} onHide={onHideWifeSource} onShow={onShowWifeSource} onToggleGroup={onToggleHiddenWifeSourceGroup} />
            <FilterSelect label="评分" value={filters.rating} options={WIFE_RATING_FILTERS} onChange={(value) => onFilterChange("rating", value)} />
            <select className="inline-select" value={wifeSort} onChange={(event) => onWifeSortChange?.(event.target.value)} title="最近添加和最近更新排序不受置顶影响">
              <option value="custom">自定义排序</option>
              <option value="added_newest">添加时间：新到旧</option>
              <option value="updated_newest">更新时间：新到旧</option>
              <option value="source_newest">出处日期：新到旧</option>
              <option value="source_oldest">出处日期：旧到新</option>
            </select>
          </div>
        )}
        {!isWife && !isWishlist && <div className="topbar-filters">
          <FilterSelect label="状态" value={filters.status} options={statusOptions} onChange={(value) => onFilterChange("status", value)} />
          <FilterSelect label="年份" value={filters.year} options={yearOptions} onChange={(value) => onFilterChange("year", value)} />
          {canFilterRegion && <FilterSelect label="地区" value={filters.region} options={REGIONS} onChange={(value) => onFilterChange("region", value)} />}
          <FilterSelect label="评分" value={filters.rating} options={RATINGS} onChange={(value) => onFilterChange("rating", value)} />
        </div>}
      </div>

      <div className="topbar-actions">
        {!isWife && !isWishlist && <button
          className={`quiet-toggle icon-toggle ${filters.showDropped ? "active" : ""}`}
          onClick={() => onFilterChange("showDropped", !filters.showDropped)}
          title={filters.showDropped ? "隐藏抛弃/放弃/不喜欢条目" : "显示抛弃/放弃/不喜欢条目"}
          aria-label={filters.showDropped ? "隐藏抛弃/放弃/不喜欢条目" : "显示抛弃/放弃/不喜欢条目"}
        >
          {filters.showDropped ? <Eye size={17} /> : <EyeOff size={17} />}
        </button>}

        {activeType !== "all" && !isWishlist && (
          <button
            className={`quiet-toggle icon-toggle ${filters.showYearSeparators ? "active" : ""}`}
            onClick={() => onFilterChange("showYearSeparators", !filters.showYearSeparators)}
            title={filters.showYearSeparators ? "隐藏年份分割线" : "显示年份分割线"}
            aria-label={filters.showYearSeparators ? "隐藏年份分割线" : "显示年份分割线"}
          >
            <CalendarDays size={17} />
          </button>
        )}

        {canUseBangumiSync && (
          <button className="ghost-action icon-action" onClick={onBangumiSync} disabled={bangumiSyncing} title={isWife ? (bangumiSyncing ? "正在同步收藏角色" : "同步 Bangumi 收藏角色") : "Bangumi 手动同步"} aria-label={isWife ? "同步 Bangumi 收藏角色" : "Bangumi 手动同步"}>
            <RefreshCw size={17} />
          </button>
        )}
        {!isWife && !isWishlist && <button className="ghost-action icon-action" onClick={onImport} title="从 Bangumi 导入 (Ctrl+B)" aria-label="从 Bangumi 导入">
          <Download size={17} />
        </button>}
        <button className="primary-action icon-action" onClick={onAdd} title="添加 (Ctrl+N)" aria-label="添加">
          <Plus size={18} />
        </button>
      </div>
      {(filterChips.length > 0 || drilldown || wifeSourceGroup) && (
        <div className="active-filter-bar" aria-label="当前筛选">
          {drilldown && <button type="button" onClick={onClearDrilldown} title="移除统计筛选">{drilldown.label}<X size={13} /></button>}
          {wifeSourceGroup && <button type="button" onClick={() => onWifeSourceGroupChange?.("")} title="移除出处类型筛选">出处类型：{({ game: "游戏", online_game: "网游", acn: "ACN", novel: "小说", real: "三次元" })[wifeSourceGroup] || wifeSourceGroup}<X size={13} /></button>}
          {filterChips.map(([key, label, value]) => <button type="button" key={key} onClick={() => onFilterChange(key, "")} title={`移除${label}筛选`}>{label}：{value}<X size={13} /></button>)}
          <button type="button" className="active-filter-clear" onClick={onClearFilters}>清空筛选</button>
        </div>
      )}
      {isWife && bangumiSyncing && (
        <div className="wife-sync-progress" role="status" aria-live="polite">
          <div className="wife-sync-progress-copy">
            <strong>正在同步人物</strong>
            <span>{wifeSyncProgress?.title || "正在读取 Bangumi 收藏列表..."}</span>
            <em>{syncTotal > 0 ? `${syncCurrent} / ${syncTotal} · ${syncPercent}%` : "准备中"}</em>
          </div>
          <div className="wife-sync-progress-track" aria-hidden="true">
            <i style={{ width: `${syncPercent}%` }} />
          </div>
        </div>
      )}
    </header>
  );
}

function FilterSelect({ label, value, options, onChange }) {
  return (
    <select className="inline-select" value={value || ""} onChange={(event) => onChange(event.target.value)}>
      <option value="">{label}</option>
      {options.map((option) => {
        const optionValue = typeof option === "object" ? option.value : option;
        const optionLabel = typeof option === "object" ? option.label : option;
        return <option key={optionValue} value={optionValue}>{optionLabel}</option>;
      })}
    </select>
  );
}

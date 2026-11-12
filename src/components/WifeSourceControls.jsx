import { useMemo, useState } from "react";
import { EyeOff, Search, X } from "lucide-react";
import { TYPE_MAP } from "../itemSchemas";

const GROUPS = [["game", "游戏"], ["online_game", "网游"], ["acn", "ACN"], ["novel", "小说"], ["real", "三次元"]];
const sourceLabel = (source) => source?.title_cn || source?.title || "未命名作品";

function sourceMatches(source, query) {
  const search = query.trim().toLowerCase();
  if (!search) return true;
  return [source.title, source.title_cn, source.original_title, source.year, TYPE_MAP[source.item_type]?.label, ...Object.values(source.details || {})]
    .some((value) => String(value || "").toLowerCase().includes(search));
}

export function WifeSourceControls({ sourceItems = [], hiddenIds = [], hiddenGroups = [], onHide, onShow, onToggleGroup }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const hiddenIdSet = useMemo(() => new Set(hiddenIds.map(String)), [hiddenIds]);
  const hiddenGroupSet = useMemo(() => new Set(hiddenGroups), [hiddenGroups]);
  const matches = useMemo(() => sourceItems.filter((source) => sourceMatches(source, query)).slice(0, 50), [sourceItems, query]);
  const hiddenSources = sourceItems.filter((source) => hiddenIdSet.has(String(source.id)));

  return (
    <div className="wife-source-controls compact">
      <div className="wife-source-control">
        <button type="button" className={hiddenIds.length || hiddenGroups.length ? "active" : ""} onClick={() => setOpen((current) => !current)} title="隐藏出处">
          <EyeOff size={17} />
          <span>隐藏出处</span>
        </button>
        {open && (
          <div className="wife-source-panel wife-group-hide-panel">
            <div className="wife-source-panel-label">隐藏整个出处分类</div>
            <div className="wife-group-hide-options">
              {GROUPS.map(([key, label]) => (
                <label key={key}>
                  <input type="checkbox" checked={hiddenGroupSet.has(key)} onChange={() => onToggleGroup?.(key)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>

            {hiddenSources.length > 0 && (
              <>
                <div className="wife-source-panel-label">已隐藏的具体出处</div>
                <div className="hidden-source-list">
                  {hiddenSources.map((source) => (
                    <div key={source.id}>
                      <span>{sourceLabel(source)}</span>
                      <button type="button" onClick={() => onShow?.(String(source.id))} title="取消隐藏"><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="wife-source-panel-label">隐藏具体出处</div>
            <label className="source-picker-search">
              <Search size={16} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索作品、原文名或年份" />
              {query && <button type="button" onClick={() => setQuery("")} title="清空搜索"><X size={14} /></button>}
            </label>
            <div className="wife-source-options">
              {matches.filter((source) => !hiddenIdSet.has(String(source.id))).map((source) => (
                <button type="button" className="source-option" key={source.id} onClick={() => onHide?.(String(source.id))}>
                  <span>{sourceLabel(source)}</span>
                  <small>{TYPE_MAP[source.item_type]?.label || source.item_type}{source.year ? ` · ${source.year}` : ""}</small>
                </button>
              ))}
              {matches.length === 0 && <div className="source-picker-empty">没有匹配的记录</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Clock3, Pencil } from "lucide-react";
import { CoverImage } from "./CoverImage";

const FILTERS = [
  { key: "all", label: "全部" },
  { key: "anime", label: "动画" },
  { key: "game", label: "游戏" },
  { key: "online_game", label: "网游" },
];

const DATE_FIELDS = {
  anime: { key: "air_date", label: "开播" },
  game: { key: "release_date", label: "发售" },
  online_game: { key: "release_date", label: "发售" },
};

function parseLocalDate(value) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function parseYear(value) {
  const text = String(value || "").trim();
  return /^\d{4}$/.test(text) ? Number(text) : null;
}

function countdown(date, year) {
  if (!date) return year ? `预计 ${year} 年` : "日期待定";
  const days = Math.round((startOfDay(date) - startOfDay()) / 86400000);
  if (days === 0) return "今天";
  if (days > 0) return `还有 ${days} 天`;
  return `已过 ${Math.abs(days)} 天`;
}

function dateLabel(date, year) {
  if (!date) return year ? `${year}年` : "未知时间";
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

function displayTitle(item) {
  return item.title_cn || item.title || item.original_title || "未命名";
}

export function ReleaseTimeline({ getTypeLabel, onEdit }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const nearestRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all(["anime", "game", "online_game"].map((itemType) => window.lifegumi.listItems({ item_type: itemType, show_dropped: true })))
      .then((groups) => { if (active) setItems(groups.flat()); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const timeline = useMemo(() => {
    const now = startOfDay();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    return items
      .filter((item) => /想玩|想看/.test(String(item.status || "")))
      .filter((item) => filter === "all" || item.item_type === filter)
      .map((item) => {
        const field = item.item_type === "online_game" && item.details?.public_test_date
          ? { key: "public_test_date", label: "公测" }
          : DATE_FIELDS[item.item_type];
        const value = item.details?.[field.key] || "";
        const date = parseLocalDate(value);
        const year = date ? date.getFullYear() : parseYear(item.year);
        const precision = date ? "date" : year ? "year" : "unknown";
        const sortTime = date ? date.getTime() : year ? new Date(year + 1, 0, 1).getTime() : Number.POSITIVE_INFINITY;
        return { item, field, value, date, year, precision, sortTime };
      })
      .filter((entry) => {
        if (entry.date) return entry.date >= monthStart;
        if (entry.year) return entry.year >= now.getFullYear();
        return !String(entry.item.year || "").trim();
      })
      .sort((left, right) => left.sortTime - right.sortTime || right.item.id - left.item.id);
  }, [items, filter]);

  const nearestIndex = useMemo(() => {
    const today = startOfDay();
    const firstFuture = timeline.findIndex((entry) => entry.precision !== "unknown" && entry.sortTime >= today.getTime());
    if (firstFuture >= 0) return firstFuture;
    for (let index = timeline.length - 1; index >= 0; index -= 1) if (timeline[index].precision !== "unknown") return index;
    return 0;
  }, [timeline]);

  useEffect(() => {
    if (loading || !nearestRef.current) return;
    requestAnimationFrame(() => nearestRef.current?.scrollIntoView({ block: "center" }));
  }, [loading, filter, nearestIndex]);

  return (
    <section className="release-page">
      <header className="release-header">
        <div>
          <h1>发售时间线</h1>
          <p>{loading ? "正在读取..." : `本月起共 ${timeline.length} 项`}</p>
        </div>
        <div className="release-filters" aria-label="类型筛选">
          {FILTERS.map((option) => <button key={option.key} className={filter === option.key ? "active" : ""} onClick={() => setFilter(option.key)}>{option.label}</button>)}
        </div>
      </header>

      {!loading && timeline.length === 0 ? <div className="time-empty">当前筛选下还没有本月及未来的日期记录。</div> : (
        <div className="release-list">
          {timeline.map((entry, index) => {
            const title = displayTitle(entry.item);
            const isNearest = index === nearestIndex;
            const isPast = Boolean(entry.date && entry.date < startOfDay());
            const showTodayDivider = isNearest && index > 0 && !isPast;
            return (
              <Fragment key={entry.item.id}>
                {showTodayDivider && <div className="release-today-divider"><span>今天</span></div>}
              <article className={`release-row ${isNearest ? "nearest" : ""} ${isPast ? "past" : "future"} ${entry.precision === "unknown" ? "unknown" : entry.precision === "year" ? "year-only" : ""}`} ref={isNearest ? nearestRef : null}>                <div className="release-date">
                  <strong>{dateLabel(entry.date, entry.year)}</strong>
                  <span>{entry.precision === "year" ? `${entry.field.label}日期待定` : entry.field.label}</span>
                </div>
                <div className="release-marker"><span /></div>
                <div className="release-content">
                  <div className="release-cover"><CoverImage path={entry.item.cover_path} title={title} /></div>
                  <div className="release-copy">
                    <div><span className={`type-chip type-${entry.item.item_type}`}>{getTypeLabel(entry.item.item_type)}</span><strong>{title}</strong></div>
                    {entry.item.original_title && entry.item.original_title !== title && <p>{entry.item.original_title}</p>}
                  </div>
                  <span className={`release-countdown ${entry.precision === "unknown" ? "unknown" : entry.precision === "year" ? "year-only" : ""}`}><Clock3 size={14} />{countdown(entry.date, entry.year)}</span>
                  <button className="release-edit" onClick={() => onEdit(entry.item)} title="编辑"><Pencil size={16} /></button>
                </div>
              </article>
              </Fragment>
            );
          })}
        </div>
      )}
      <div className="release-footnote"><CalendarClock size={15} />完整日期从本月起显示；只有年份的条目排在对应年份末尾，日期和年份都未知的条目排在最后。</div>
    </section>
  );
}





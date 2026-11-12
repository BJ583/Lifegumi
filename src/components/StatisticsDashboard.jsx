import { useEffect, useMemo, useState } from "react";
import { RefreshCw, Star } from "lucide-react";
import { WIFE_SUPER_RATING } from "../itemSchemas";
import { buildStatisticsInsights } from "../statisticsInsights";

const MEDIA_TYPES = new Set(["anime", "manga", "light_novel", "game", "online_game", "movie", "tv_drama", "eroge", "novel", "published_book"]);
const RATING_VALUES = ["⭐⭐⭐⭐⭐", "⭐⭐⭐⭐", "⭐⭐⭐", "⭐⭐", "⭐", "💔"];
const PROGRESS_GROUPS = [
  { title: "游戏", tone: "purple", types: [["game", "游戏"], ["online_game", "网游"]], stages: [["想玩", /想玩/], ["在玩", /在玩/], ["玩过", /玩过/]] },
  { title: "观看", tone: "cyan", types: [["anime", "动画"], ["movie", "电影"], ["tv_drama", "电视剧"]], stages: [["想看", /想看/], ["在看 / 追番", /在看|追番/], ["看完 / 二刷", /看完|二刷/]] },
  { title: "阅读", tone: "gold", types: [["manga", "漫画"], ["light_novel", "轻小说"], ["novel", "小说"], ["published_book", "出版书"]], stages: [["想看", /想看/], ["在看 / 在追", /在看|在追/], ["看完", /看完/]] }
];
const TYPE_LABELS = PROGRESS_GROUPS.flatMap((group) => group.types);

function marked(value, words) {
  const text = String(value || "").trim();
  return /^(是|true|1)/i.test(text) || words.some((word) => text.includes(word));
}

function percent(value, total) {
  return total ? Math.round((value / total) * 100) : 0;
}

export function StatisticsDashboard({ onOpenDrilldown }) {
  const [items, setItems] = useState([]);
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [decadeType, setDecadeType] = useState("");
  const [recapYear, setRecapYear] = useState(new Date().getFullYear());

  async function loadStatistics() {
    setLoading(true);
    setLoadError("");
    try {
      const [allItems, firstPage] = await Promise.all([
        window.lifegumi.listItems({ item_type: "all", show_dropped: true }),
        window.lifegumi.listActivities({ page: 1 })
      ]);
      const logs = [...(firstPage.activities || [])];
      for (let page = 2; page <= (firstPage.pagination?.totalPages || 1); page += 1) {
        const result = await window.lifegumi.listActivities({ page });
        logs.push(...(result.activities || []));
      }
      setItems(allItems);
      setActivities(logs);
    } catch (error) {
      setLoadError(error?.message || "统计数据读取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadStatistics(); }, []);

  const stats = useMemo(() => {
    const media = items.filter((item) => MEDIA_TYPES.has(item.item_type));
    const rated = media.filter((item) => RATING_VALUES.includes(item.rating));
    const fiveStars = rated.filter((item) => item.rating === "⭐⭐⭐⭐⭐").length;

    const byType = new Map(PROGRESS_GROUPS.flatMap((group) => group.types.map(([type]) => [type, []])));
    for (const item of media) byType.get(item.item_type)?.push(item);
    const progressGroups = PROGRESS_GROUPS.map((group) => ({
      ...group,
      categories: group.types.map(([type, label]) => {
        const categoryItems = byType.get(type);
        const stageCounts = group.stages.map(([stageLabel, pattern]) => ({ label: stageLabel, value: categoryItems.filter((item) => pattern.test(String(item.status || ""))).length }));
        return {
          type, label, total: categoryItems.length,
          rows: [...stageCounts, { label: "其他 / 未标记", value: categoryItems.length - stageCounts.reduce((sum, stage) => sum + stage.value, 0) }],
          cleared: type === "game" ? categoryItems.filter((item) => marked(item.details?.cleared, ["通关"])).length : null
        };
      })
    }));

    const ratings = RATING_VALUES.map((rating) => {
      const count = rated.filter((item) => item.rating === rating).length;
      return { rating, count, ratio: percent(count, media.length) };
    });
    const wives = items.filter((item) => item.item_type === "wife");
    const sourceById = new Map(items.filter((item) => item.item_type !== "wife").map((item) => [String(item.id), item]));
    const wifeSourceGroups = [
      { key: "game", label: "游戏", tone: "purple" },
      { key: "online_game", label: "网游", tone: "cyan" },
      { key: "acn", label: "ACN", tone: "pink" },
      { key: "novel", label: "小说", tone: "gold" },
      { key: "real", label: "三次元", tone: "green" }
    ];
    const wifeGroup = (item) => {
      if (item.details?.real_person_type) return "real";
      const sourceType = sourceById.get(String(item.details?.source_item_id || ""))?.item_type;
      if (sourceType === "online_game") return "online_game";
      if (sourceType === "game" || sourceType === "eroge") return "game";
      if (["anime", "manga", "light_novel"].includes(sourceType)) return "acn";
      if (sourceType === "novel" || sourceType === "published_book") return "novel";
      return "unbound";
    };
    const classifiedWives = wives.filter((item) => wifeGroup(item) !== "unbound");
    const wifeSources = wifeSourceGroups.map((entry) => ({
      ...entry,
      value: wives.filter((item) => wifeGroup(item) === entry.key).length,
      total: classifiedWives.length
    }));
    return {
      media,
      rated,
      fiveStars,
      progressGroups,
      ratings,
      wives,
      classifiedWifeCount: classifiedWives.length,
      wifeSources,
      wifeStats: {
        pinned: wives.filter((item) => item.details?.wife_pinned).length,
        rated: wives.filter((item) => String(item.rating || "").trim()).length,
        superRated: wives.filter((item) => item.rating === WIFE_SUPER_RATING).length
      }
    };
  }, [items]);
  const insights = useMemo(() => buildStatisticsInsights(items, activities, TYPE_LABELS, decadeType, recapYear), [items, activities, decadeType, recapYear]);

  return (
    <section className="statistics-page">
      <header className="statistics-header">
        <div><h1>统计</h1><p>{loading ? "正在整理资料..." : `共 ${items.length} 条记录，${stats.media.length} 条作品资料`}</p></div>
        <button type="button" className="statistics-refresh" onClick={loadStatistics} disabled={loading} title="刷新统计" aria-label="刷新统计"><RefreshCw size={18} /></button>
      </header>
      {loadError && <p role="alert" className="statistics-load-error">{loadError}</p>}

      <div className="statistics-dashboard">
        {stats.progressGroups.map((group) => (
          <section className="statistics-section" key={group.title}>
            <header className="statistics-section-heading"><h2>{group.title}</h2><span>每张卡只统计本分类的记录</span></header>
            <div className={`statistics-progress-grid ${group.title === "阅读" ? "statistics-reading-grid" : ""}`}>
              {group.categories.map((category) => (
                <StatPanel key={category.type} title={category.label} subtitle={`共 ${category.total} 条记录`}>
                  <div className="stat-bars">{category.rows.map((row, index) => <BarRow key={row.label} label={row.label} value={row.value} total={category.total} tone={group.tone} onClick={index < group.stages.length ? () => onOpenDrilldown?.({ types: [category.type], statusPattern: group.stages[index][1], label: `${category.label} · ${row.label}` }) : undefined} />)}</div>
                  {category.cleared !== null && <p className="statistics-panel-footer">已标通关 {category.cleared} / {category.total} · {percent(category.cleared, category.total)}%</p>}
                </StatPanel>
              ))}
            </div>
          </section>
        ))}

        <section className="statistics-section">
          <header className="statistics-section-heading"><h2>待办动态</h2><span>当前待办与最近六个月的状态记录</span></header>
          <div className="statistics-paired-grid">
            <StatPanel title="当前待办" subtitle="按现在的状态统计">
              <div className="statistics-count-list">{insights.backlogByKind.map((entry, index) => <button type="button" key={entry.label} onClick={() => onOpenDrilldown?.({ types: index === 0 ? ["game", "online_game", "eroge"] : index === 1 ? ["anime", "movie", "tv_drama"] : ["manga", "light_novel", "novel", "published_book"], statusPattern: index === 0 ? /想玩/ : /想看/, label: entry.label })}><span>{entry.label}</span><strong>{entry.value}</strong></button>)}</div>
              <p className="statistics-panel-footer">合计 {insights.backlogByKind.reduce((sum, entry) => sum + entry.value, 0)} 部待开始</p>
            </StatPanel>
            <StatPanel title="近六月记录" subtitle="加入待办 / 标记完成">
              <div className="statistics-month-list">{insights.months.map((month) => <div key={month.key}><span>{month.label}</span><strong>新增 {month.added}</strong><strong>完成 {month.finished}</strong><strong className="statistics-month-net">净 {month.added - month.finished >= 0 ? "+" : ""}{month.added - month.finished}</strong></div>)}</div>
              <p className="statistics-panel-footer">仅统计本地状态日志；净流入是事件差值，不代表历史待办库存。</p>
            </StatPanel>
          </div>
        </section>

        <section className="statistics-section">
          <header className="statistics-section-heading"><h2>收藏年代</h2><span>按作品发行年份，而非加入日期</span></header>
          <StatPanel title={insights.topDecade ? `最多：${insights.topDecade.label}` : "发行年代"} subtitle={`有年份 ${insights.knownYears} / ${insights.totalYears} 部`}>
            <label className="statistics-select-label">作品分类
              <select value={decadeType} onChange={(event) => setDecadeType(event.target.value)}><option value="">全部作品</option>{TYPE_LABELS.map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select>
            </label>
            {insights.decades.length ? <div className="statistics-decade-list">{insights.decades.map((entry) => <BarRow key={entry.label} {...entry} total={insights.knownYears} tone="cyan" />)}</div> : <p className="statistics-empty">这一类还没有可用的发行年份。</p>}
          </StatPanel>
        </section>

        <section className="statistics-section">
          <header className="statistics-section-heading"><h2>评分偏好</h2><span>所有比例以全部作品为分母</span></header>
          <div className="statistics-paired-grid">
            <StatPanel title="五星作品" subtitle={`${stats.fiveStars} / ${stats.media.length} 部作品`}><div className="statistics-hero-number"><Star size={25} /><strong>{percent(stats.fiveStars, stats.media.length)}%</strong></div><p className="statistics-panel-footer">已评分 {stats.rated.length} / {stats.media.length} · {percent(stats.rated.length, stats.media.length)}%</p></StatPanel>
            <StatPanel title="评分分布" subtitle="从五星到不喜欢"><div className="rating-stat-list">{stats.ratings.map((entry) => <BarRow key={entry.rating} label={entry.rating} value={entry.count} total={stats.media.length} tone={entry.rating === "💔" ? "gray" : "gold"} />)}</div></StatPanel>
          </div>
          <StatPanel title="各分类五星比例" subtitle="五星数 / 该分类全部作品；已评分数量同时列出">
            <div className="statistics-type-ratings">{insights.ratingByType.map((entry) => <div key={entry.type} className="statistics-type-rating"><span>{entry.label}</span><div className="stat-bar-track"><i className="gold" style={{ width: `${entry.ratio}%` }} /></div><strong>{entry.fiveStars} / {entry.total} · {entry.ratio}%</strong><small>已评 {entry.rated}</small></div>)}</div>
          </StatPanel>
        </section>


        <section className="statistics-section">
          <header className="statistics-section-heading"><h2>年度回顾</h2><span>按加入时间与本地状态日志</span></header>
          <StatPanel title={`${recapYear} 年`} subtitle="新增记录及有记录的完成">
            <label className="statistics-select-label">年份
              <select value={recapYear} onChange={(event) => setRecapYear(Number(event.target.value))}>{insights.years.map((year) => <option key={year} value={year}>{year}</option>)}</select>
            </label>
            <div className="statistics-year-metrics"><div><span>加入作品</span><strong>{insights.recap.addedWorks}</strong></div><div><span>完成作品</span><strong>{insights.recap.finished}</strong></div><div><span>加入且当前五星</span><strong>{insights.recap.fiveStars}</strong></div></div>
            {insights.recap.favoriteTitles.length > 0 && <p className="statistics-year-favorites">五星作品：{insights.recap.favoriteTitles.join("、")}</p>}
            <p className="statistics-panel-footer">完成作品仅来自本地状态日志；批量导入的历史完成情况不计入。</p>
          </StatPanel>
        </section>
      </div>
    </section>
  );
}

function StatPanel({ title, subtitle, className = "", children }) {
  return <section className={`statistics-panel ${className}`}><header><h2>{title}</h2><p>{subtitle}</p></header>{children}</section>;
}

function BarRow({ label, value, total, tone = "purple", onClick }) {
  const content = <><span>{label}</span><strong>{value}<small>{total ? ` · ${percent(value, total)}%` : ""}</small></strong></>;
  return <div className="stat-bar-row">{onClick ? <button type="button" className="stat-bar-action" onClick={onClick}>{content}</button> : <div>{content}</div>}<div className="stat-bar-track"><i className={tone} style={{ width: `${percent(value, total)}%` }} /></div></div>;
}

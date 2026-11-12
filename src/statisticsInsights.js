const MEDIA_TYPES = new Set(["anime", "manga", "light_novel", "game", "online_game", "movie", "tv_drama", "eroge", "novel", "published_book"]);
const GAME_TYPES = new Set(["game", "online_game", "eroge"]);
const FINISHED_ACTIONS = new Set(["玩完", "看完", "二刷"]);

const yearOf = (value) => {
  const match = String(value || "").match(/^(19|20|21)\d{2}/);
  return match ? Number(match[0]) : null;
};
const monthOf = (value) => String(value || "").slice(0, 7);
const percent = (value, total) => total ? Math.round(value / total * 100) : 0;

export function buildStatisticsInsights(items, activities, typeLabels, selectedType, selectedYear, now = new Date()) {
  const media = items.filter((item) => MEDIA_TYPES.has(item.item_type));
  const wives = items.filter((item) => item.item_type === "wife");
  const currentBacklog = media.filter((item) => String(item.status || "").includes(GAME_TYPES.has(item.item_type) ? "想玩" : "想看"));
  const backlogByKind = [
    { label: "想玩的游戏", value: currentBacklog.filter((item) => GAME_TYPES.has(item.item_type)).length },
    { label: "想看的影视动画", value: currentBacklog.filter((item) => ["anime", "movie", "tv_drama"].includes(item.item_type)).length },
    { label: "想读的书漫", value: currentBacklog.filter((item) => ["manga", "light_novel", "novel", "published_book"].includes(item.item_type)).length }
  ];

  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - 5 + index, 1);
    return { key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`, label: `${date.getMonth() + 1}月`, added: 0, finished: 0 };
  });
  const monthMap = new Map(months.map((month) => [month.key, month]));
  const relevantActivities = activities.filter((entry) => MEDIA_TYPES.has(entry.item?.item_type));
  for (const entry of relevantActivities) {
    const month = monthMap.get(monthOf(entry.created_at));
    if (!month) continue;
    if (entry.action === "想玩" || entry.action === "想看") month.added += 1;
    if (FINISHED_ACTIONS.has(entry.action)) month.finished += 1;
  }

  const selectedMedia = selectedType ? media.filter((item) => item.item_type === selectedType) : media;
  const decadeCounts = new Map();
  let knownYears = 0;
  for (const item of selectedMedia) {
    const year = yearOf(item.year) ?? yearOf(item.details?.release_date) ?? yearOf(item.details?.air_date) ?? yearOf(item.details?.public_test_date);
    if (year === null) continue;
    knownYears += 1;
    const decade = Math.floor(year / 10) * 10;
    decadeCounts.set(decade, (decadeCounts.get(decade) || 0) + 1);
  }
  const decades = [...decadeCounts].sort(([a], [b]) => a - b).map(([decade, value]) => ({ label: `${decade}年代`, value }));
  const topDecade = [...decades].sort((a, b) => b.value - a.value)[0] || null;

  const ratingByType = typeLabels.map(([type, label]) => {
    const category = media.filter((item) => item.item_type === type);
    const rated = category.filter((item) => Boolean(item.rating));
    const fiveStars = category.filter((item) => item.rating === "⭐⭐⭐⭐⭐").length;
    return { type, label, total: category.length, rated: rated.length, fiveStars, ratio: percent(fiveStars, category.length) };
  });

  const sourceById = new Map(media.map((item) => [String(item.id), item]));
  const sourceCounts = new Map();
  for (const wife of wives) {
    const id = String(wife.details?.source_item_id || "");
    const source = sourceById.get(id);
    if (!source) continue;
    if (!sourceCounts.has(id)) sourceCounts.set(id, { id, title: source.title_cn || source.title || "未命名作品", type: source.item_type, names: [] });
    sourceCounts.get(id).names.push(wife.title_cn || wife.title || "未命名人物");
  }
  const sourceRanking = [...sourceCounts.values()].sort((a, b) => b.names.length - a.names.length || a.title.localeCompare(b.title, "zh-CN"));

  const years = [...new Set([now.getFullYear(), ...media.map((item) => yearOf(item.created_at)), ...wives.map((item) => yearOf(item.created_at)), ...relevantActivities.map((item) => yearOf(item.created_at))].filter(Boolean))].sort((a, b) => b - a);
  const recapMedia = media.filter((item) => yearOf(item.created_at) === selectedYear);
  const recapWives = wives.filter((item) => yearOf(item.created_at) === selectedYear);
  const finishedEvents = relevantActivities.filter((entry) => yearOf(entry.created_at) === selectedYear && FINISHED_ACTIONS.has(entry.action));
  const recap = {
    addedWorks: recapMedia.length,
    addedWives: recapWives.length,
    finished: new Set(finishedEvents.map((entry) => entry.item_id).filter(Boolean)).size,
    fiveStars: recapMedia.filter((item) => item.rating === "⭐⭐⭐⭐⭐").length,
    favoriteTitles: recapMedia.filter((item) => item.rating === "⭐⭐⭐⭐⭐").slice(0, 5).map((item) => item.title_cn || item.title)
  };

  return { backlogByKind, months, decades, knownYears, totalYears: selectedMedia.length, topDecade, ratingByType, sourceRanking, years, recap };
}

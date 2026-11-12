import {
  BookOpen,
  Clapperboard,
  Cloud,
  Film,
  Gamepad2,
  Globe2,
  Library,
  ListChecks,
  History,
  CalendarClock,
  ChartNoAxesCombined,
  Heart,
  NotebookPen,
  NotepadText,
  MonitorPlay,
  ShoppingBag,
  Sparkles
} from "lucide-react";

export const FIRST_YEAR_LABEL = "1997年前";
export const DEFAULT_MAX_YEAR = 2031;
export const RATINGS = ["⭐", "⭐⭐", "⭐⭐⭐", "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐", "💔"];
export const WIFE_SUPER_RATING = "✨";
export const WIFE_RATINGS = ["⭐", "⭐⭐", "⭐⭐⭐", "⭐⭐⭐⭐", "⭐⭐⭐⭐⭐", WIFE_SUPER_RATING];
export const REGIONS = ["中国", "日本", "韩国", "欧美", "其他"];
export const TICKET_OPTIONS = ["🎫"];
export const SEASONS = ["Q1(冬) ❄️", "Q2(春) 🌸", "Q3(夏) 🌿", "Q4(秋) 🍁", "剧场版 🎬", "OVA/SP 📀"];

export const TYPE_OPTIONS = [
  { key: "all", label: "全部", icon: Library },
  { key: "statistics", label: "统计", icon: ChartNoAxesCombined },
  { key: "progress_tracker", label: "追更进度", icon: ListChecks },
  { key: "release_timeline", label: "发售时间线", icon: CalendarClock },
  { key: "time_machine", label: "时光机", icon: History },
  { key: "light_notebook", label: "记事本", icon: NotepadText },
  { key: "anime", label: "动画", titleLabel: "作品名", icon: MonitorPlay },
  { key: "manga", label: "漫画", titleLabel: "漫画名", icon: BookOpen },
  { key: "light_novel", label: "轻小说", titleLabel: "小说名", icon: Sparkles },
  { key: "game", label: "游戏", titleLabel: "游戏名", icon: Gamepad2 },
  { key: "online_game", label: "网游", titleLabel: "游戏名", icon: Cloud },
  { key: "movie", label: "电影", titleLabel: "电影名", icon: Film },
  { key: "tv_drama", label: "电视剧", titleLabel: "电视剧名", icon: Clapperboard },
  { key: "novel", label: "小说", titleLabel: "小说名", icon: BookOpen },
  { key: "published_book", label: "出版书", titleLabel: "书名", icon: BookOpen },
  { key: "bangumi_browser", label: "Bangumi", icon: Globe2 }
];

export const TYPE_MAP = Object.fromEntries(TYPE_OPTIONS.map((type) => [type.key, type]));

export const STATUS_OPTIONS = {
  anime: ["二刷 🔄", "看完 ✅", "追番 ▶", "搁置 ⏸️", "想看 🕗", "抛弃 🚮"],
  game: ["玩过 ✅", "在玩 🎮", "想玩 🕗", "未购买🛒", "云过 ☁️", "抛弃 🚮"],
  manga: ["看完 ✅", "在追 📖", "想看 🕗", "放弃 🚮", "搁置 ⏸"],
  online_game: ["在玩 🎮", "玩过 ✅", "抛弃 🚮"],
  light_novel: ["看完 ✅", "在看 ▶", "想看 🕗", "抛弃 🚮", "搁置 ⏸️"],
  movie: ["二刷 🔄", "看完 ✅", "想看 🕗", "抛弃 🚮", "搁置 ⏸️"],
  tv_drama: ["二刷 🔄", "看完 ✅", "在看 ▶", "想看 🕗", "抛弃 🚮", "搁置 ⏸️"],
  eroge: ["玩过 ✅", "在玩 🎮", "抛弃 🚮", "想玩 🕗", "云过 ☁️", "未购买🛒"],
  novel: ["看完 ✅", "在看 ▶", "想看 🕗", "抛弃 🚮", "搁置 ⏸️"],
  published_book: ["看完 ✅", "在看 ▶", "想看 🕗", "抛弃 🚮", "搁置 ⏸️"],
  wishlist: ["想买 🕗", "已购买 ✅", "搁置 ⏸️", "放弃 🚮"]
};

export const DEFAULT_STATUS = {
  anime: "想看 🕗",
  manga: "想看 🕗",
  light_novel: "想看 🕗",
  game: "想玩 🕗",
  movie: "想看 🕗",
  tv_drama: "想看 🕗",
  published_book: "想看 🕗"
};

export const YEAR_ITEM_TYPES = new Set(["anime", "manga", "light_novel", "game", "online_game", "movie", "tv_drama", "eroge", "published_book"]);

export function buildYearOptions(maxYear = DEFAULT_MAX_YEAR) {
  const currentYear = new Date().getFullYear();
  const finalYear = Math.max(Number(maxYear) || DEFAULT_MAX_YEAR, currentYear, 2031);
  return [
    ...Array.from({ length: finalYear - 1997 + 1 }, (_, index) => String(finalYear - index)),
    FIRST_YEAR_LABEL
  ];
}

const commonMediaFields = [
  { key: "original_title", label: "原文名", scope: "root" },
  { key: "cover", label: "封面", type: "cover", scope: "root" },
  { key: "year", label: "年份", type: "year", scope: "root" },
  { key: "status", label: "状态", type: "select", optionsFromStatus: true, scope: "root" },
  { key: "rating", label: "评分", type: "rating", scope: "root" },
  { key: "bangumi_url", label: "资料链接（Bangumi 或豆瓣）", scope: "root" },
  { key: "notes", label: "备注", type: "textarea", scope: "root" }
];

export const ITEM_SCHEMAS = {
  wife: {
    titleLabel: "名字",
    fields: [
      { key: "cover", label: "图片", type: "cover", scope: "root" },
      { key: "original_title", label: "原文名", scope: "root" },
      { key: "rating", label: "评分", type: "rating", scope: "root" },
      { key: "real_person_type", label: "三次元类型", type: "select", options: ["明星", "欧美", "AV", "素人"], scope: "details" },
      { key: "source_item_id", label: "出处", type: "source", scope: "details" },
      { key: "summary", label: "简介", type: "textarea", scope: "details" },
      { key: "bangumi_url", label: "Bangumi人物链接", scope: "root" },
      { key: "notes", label: "备注", type: "textarea", scope: "root" }
    ]
  },  anime: {
    titleLabel: "作品名",
    fields: [
      commonMediaFields[0],
      commonMediaFields[1],
      commonMediaFields[2],
      { key: "air_date", label: "开播日期", type: "date", scope: "details" },
      { key: "season", label: "季度", type: "select", options: SEASONS, scope: "details" },
      commonMediaFields[3],
      { key: "progress", label: "进度", scope: "details" },
      commonMediaFields[4],
      commonMediaFields[5],
      commonMediaFields[6]
    ]
  },
  manga: {
    titleLabel: "漫画名",
    fields: [
      commonMediaFields[0],
      commonMediaFields[1],
      { key: "progress_chapters", label: "进度(话)", scope: "details" },
      commonMediaFields[3],
      { key: "category", label: "分类", scope: "details" },
      commonMediaFields[2],
      { key: "creator", label: "作画/原作", scope: "details" },
      commonMediaFields[4],
      commonMediaFields[5],
      commonMediaFields[6]
    ]
  },
  light_novel: {
    titleLabel: "小说名",
    fields: [
      commonMediaFields[0],
      commonMediaFields[1],
      { key: "author", label: "作者", scope: "details" },
      { key: "illustrator", label: "插画", scope: "details" },
      commonMediaFields[3],
      { key: "progress", label: "进度", scope: "details" },
      commonMediaFields[4],
      commonMediaFields[2],
      commonMediaFields[5],
      commonMediaFields[6]
    ]
  },
  game: {
    titleLabel: "游戏名",
    fields: [
      commonMediaFields[0],
      commonMediaFields[1],
      commonMediaFields[2],
      { key: "release_date", label: "发售日期", type: "date", scope: "details" },
      commonMediaFields[3],
      commonMediaFields[4],
      { key: "game_flags", label: "游玩标记", type: "game_flags", scope: "details" },
      commonMediaFields[5],
      commonMediaFields[6]
    ]
  },
  online_game: {
    titleLabel: "游戏名",
    fields: [commonMediaFields[0], commonMediaFields[1], commonMediaFields[2], { key: "public_test_date", label: "公测日期", type: "date", scope: "details" }, { key: "release_date", label: "发售日期", type: "date", scope: "details" }, commonMediaFields[3], commonMediaFields[4], commonMediaFields[5], commonMediaFields[6]]
  },
  movie: {
    titleLabel: "电影名",
    fields: [
      commonMediaFields[0],
      commonMediaFields[1],
      commonMediaFields[2],
      { key: "region", label: "地区", type: "select", options: REGIONS, scope: "details" },
      { key: "category", label: "分类", scope: "details" },
      commonMediaFields[3],
      { key: "ticket", label: "票", type: "select", options: TICKET_OPTIONS, scope: "details" },
      commonMediaFields[4],
      commonMediaFields[5],
      commonMediaFields[6]
    ]
  },
  tv_drama: {
    titleLabel: "电视剧名",
    fields: [
      commonMediaFields[0],
      commonMediaFields[1],
      commonMediaFields[2],
      { key: "region", label: "地区", type: "select", options: REGIONS, scope: "details" },
      commonMediaFields[3],
      commonMediaFields[4],
      commonMediaFields[5],
      commonMediaFields[6]
    ]
  },
  eroge: {
    titleLabel: "游戏名",
    fields: [commonMediaFields[0], commonMediaFields[1], commonMediaFields[2], { key: "release_date", label: "发售日期", type: "date", scope: "details" }, commonMediaFields[3], { key: "kind", label: "类型", scope: "details" }, commonMediaFields[4], commonMediaFields[5], commonMediaFields[6]]
  },
  novel: {
    titleLabel: "小说名",
    fields: [
      commonMediaFields[0],
      commonMediaFields[1],
      { key: "author", label: "作者", scope: "details" },
      commonMediaFields[3],
      { key: "progress", label: "进度", scope: "details" },
      commonMediaFields[4],
      commonMediaFields[6]
    ]
  },
  published_book: {
    titleLabel: "书名",
    fields: [
      commonMediaFields[0],
      commonMediaFields[1],
      { key: "author", label: "作者", scope: "details" },
      commonMediaFields[2],
      commonMediaFields[3],
      { key: "progress", label: "进度", scope: "details" },
      commonMediaFields[4],
      commonMediaFields[6]
    ]
  },
  wishlist: {
    titleLabel: "名称",
    fields: [
      { key: "estimated_price", label: "价格", scope: "details" }
    ]
  }};

export const BANGUMI_SAVE_TYPES = TYPE_OPTIONS.filter((type) => Boolean(ITEM_SCHEMAS[type.key]));

export function emptyItem(typeKey = "anime", defaults = {}) {
  const currentYear = String(new Date().getFullYear());
  return {
    item_type: typeKey,
    title: "",
    title_cn: "",
    original_title: "",
    year: YEAR_ITEM_TYPES.has(typeKey) ? currentYear : "",
    status: DEFAULT_STATUS[typeKey] || "",
    rating: "",
    bangumi_subject_id: "",
    bangumi_url: "",
    cover_path: "",
    coverSourcePath: "",
    gallerySourcePaths: [],
    notes: "",
    details: {},
    ...defaults
  };
}

export function itemToForm(item) {
  const title = item.title || "";
  const titleCn = item.title_cn || "";
  const originalTitle = item.original_title || (titleCn && title !== titleCn ? title : "");
  return {
    ...emptyItem(item.item_type),
    ...item,
    title: titleCn || title || originalTitle,
    title_cn: titleCn || title,
    original_title: originalTitle,
    details: item.details || {},
    coverSourcePath: "",
    gallerySourcePaths: []
  };
}







const path = require("node:path");
const fs = require("node:fs");
const { session } = require("electron");

const BANGUMI_SUBJECT_URL = /^https?:\/\/(?:bgm\.tv|bangumi\.tv)\/subject\/(\d+)(?:[/?#].*)?$/i;
const API_ROOT = "https://api.bgm.tv/v0";
const API_BASE = `${API_ROOT}/subjects`;
const SYNC_REQUEST_GAP_MS = 1000;
const DEFAULT_RATE_LIMIT_WAIT_MS = 60000;
let lastSyncRequestAt = 0;
let syncRequestQueue = Promise.resolve();
let syncBlockedUntil = 0;
const USER_AGENT = "Lifegumi/0.1.0 (local personal tracker)";
let bangumiSession;

function getBangumiSession() {
  if (!bangumiSession) bangumiSession = session.fromPartition("bangumi-api", { cache: false });
  return bangumiSession;
}

async function configureBangumiProxy(proxyUrl) {
  const apiSession = getBangumiSession();
  await apiSession.setProxy(proxyUrl
    ? { mode: "fixed_servers", proxyRules: proxyUrl }
    : { mode: "system" });
  await apiSession.closeAllConnections();
}

function extractSubjectId(input) {
  const trimmed = String(input || "").trim();
  const match = trimmed.match(BANGUMI_SUBJECT_URL);
  if (!match) {
    const error = new Error("请输入正确的 Bangumi 条目链接");
    error.code = "INVALID_BANGUMI_URL";
    throw error;
  }
  return match[1];
}

function yearFromDate(dateText) {
  const match = String(dateText || "").match(/^(\d{4})/);
  return match ? match[1] : "";
}

function seasonFromDate(dateText) {
  const match = String(dateText || "").match(/^\d{4}[-/](\d{1,2})/);
  if (!match) return "";
  const month = Number(match[1]);
  if (month >= 1 && month <= 3) return "Q1(冬) ❄️";
  if (month >= 4 && month <= 6) return "Q2(春) 🌸";
  if (month >= 7 && month <= 9) return "Q3(夏) 🌿";
  if (month >= 10 && month <= 12) return "Q4(秋) 🍁";
  return "";
}

function infoValue(subject, keyName) {
  const infobox = Array.isArray(subject?.infobox) ? subject.infobox : [];
  const item = infobox.find((entry) => String(entry?.key || "").includes(keyName));
  if (!item) return "";
  if (Array.isArray(item.value)) return item.value.map((value) => value?.v || value).join(" ");
  return String(item.value || "");
}

function normalizeFullDate(year, month, day) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Game infoboxes may list separate console and PC dates. Keep the date matching the local year.
function gameReleaseDateFromSubject(subject, preferredYear = "") {
  const texts = [subject?.date || ""];
  for (const entry of Array.isArray(subject?.infobox) ? subject.infobox : []) {
    if (!/发售|发行|上市|発売|release/i.test(String(entry?.key || ""))) continue;
    const values = Array.isArray(entry.value) ? entry.value.map((value) => value?.v || value) : [entry.value];
    texts.push(...values.map((value) => String(value || "")));
  }
  const dates = [];
  for (const value of texts) {
    for (const match of value.matchAll(/(19|20)\d{2}[-/.](\d{1,2})[-/.](\d{1,2})/g)) {
      dates.push(normalizeFullDate(match[0].slice(0, 4), match[2], match[3]));
    }
    for (const match of value.matchAll(/((?:19|20)\d{2})年\s*(\d{1,2})月\s*(\d{1,2})日/g)) {
      dates.push(normalizeFullDate(match[1], match[2], match[3]));
    }
  }
  const uniqueDates = Array.from(new Set(dates));
  const targetYear = String(preferredYear || yearFromDate(subject?.date) || "");
  return uniqueDates.find((date) => date.startsWith(`${targetYear}-`)) || "";
}
function isMovieSubject(subject) {
  const text = [
    subject?.name,
    subject?.name_cn,
    subject?.summary,
    infoValue(subject, "上映"),
    infoValue(subject, "播放类型"),
    infoValue(subject, "类型")
  ].join(" ");
  return /剧场版|劇場版|映画|电影|movie/i.test(text);
}

function animeSeasonFromSubject(subject) {
  if (Number(subject?.type) !== 2) return "";
  if (isMovieSubject(subject)) return "剧场版 🎬";
  return seasonFromDate(subject?.date);
}

function coverUrlFromSubject(subject) {
  return subject?.images?.large || subject?.images?.common || subject?.images?.medium || "";
}

function extensionFromContentType(contentType) {
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  return ".jpg";
}

// Bangumi has several subject categories. We keep this as a suggestion because
// the user's local categories are richer and should remain manually editable.
function suggestLocalType(subject) {
  const type = Number(subject?.type);
  if (type === 2) return "anime";
  if (type === 1) return "manga";
  if (type === 4) return "game";
  if (type === 6) return "movie";
  return "anime";
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await getBangumiSession().fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Bangumi API 请求超时，请稍后再试");
    }
    throw new Error("网络连接失败，无法访问 Bangumi API");
  } finally {
    clearTimeout(timer);
  }
}

async function fetchSubject(subjectId, accessToken = "") {
  const response = await enqueueBangumiRequest(() => fetchWithTimeout(`${API_BASE}/${subjectId}`, {
    headers: {
      "Accept": "application/json",
      ...(accessToken ? { "Authorization": `Bearer ${accessToken}` } : {}),
      "User-Agent": USER_AGENT
    }
  }));

  if (response.status === 404) throw new Error("没有找到这个 Bangumi 条目");
  if (!response.ok) throw new Error(`Bangumi API 请求失败：HTTP ${response.status}`);
  return response.json();
}

async function downloadCover(subjectId, coverUrl, coversPath, prefix = "bangumi") {
  if (!coverUrl) return "";

  const response = await fetchWithTimeout(coverUrl, {
    headers: { "User-Agent": USER_AGENT }
  });
  if (!response.ok) return "";

  const contentType = response.headers.get("content-type") || "";
  const ext = extensionFromContentType(contentType);
  const targetPath = path.join(coversPath, `${prefix}_${subjectId}${ext}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(targetPath, buffer);
  return targetPath;
}

function rateLimitWaitMs(response) {
  const retryAfter = String(response.headers.get("retry-after") || "").trim();
  if (/^\d+$/.test(retryAfter)) return Math.max(1000, Number(retryAfter) * 1000);
  const retryAt = Date.parse(retryAfter);
  return Number.isFinite(retryAt) ? Math.max(1000, retryAt - Date.now()) : DEFAULT_RATE_LIMIT_WAIT_MS;
}

function bangumiRateLimitError(waitMs) {
  const seconds = Math.max(1, Math.ceil(waitMs / 1000));
  const error = new Error(`Bangumi API 已限流，本次同步已停止，请至少 ${seconds} 秒后再试`);
  error.code = "BANGUMI_RATE_LIMIT";
  error.retryAfterSeconds = seconds;
  return error;
}

async function pauseSyncRequest() {
  const blockedMs = syncBlockedUntil - Date.now();
  if (blockedMs > 0) throw bangumiRateLimitError(blockedMs);
  const waitMs = SYNC_REQUEST_GAP_MS - (Date.now() - lastSyncRequestAt);
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastSyncRequestAt = Date.now();
}

function enqueueBangumiRequest(request) {
  const queued = syncRequestQueue.then(async () => {
    await pauseSyncRequest();
    const response = await request();
    if (response.status === 429) {
      const waitMs = rateLimitWaitMs(response);
      syncBlockedUntil = Date.now() + waitMs;
      throw bangumiRateLimitError(waitMs);
    }
    return response;
  });
  syncRequestQueue = queued.catch(() => undefined);
  return queued;
}

// All API traffic shares one conservative queue so concurrent sync branches cannot burst.
async function fetchBangumiApi(pathname, accessToken, options = {}) {
  const response = await enqueueBangumiRequest(() => fetchWithTimeout(`${API_ROOT}${pathname}`, {
    ...options,
    headers: {
      "Accept": "application/json",
      "Authorization": `Bearer ${accessToken}`,
      "User-Agent": USER_AGENT,
      ...(options.headers || {})
    }
  }));
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    if (response.status === 401) throw new Error("Bangumi Access Token 无效或已失效");
    throw new Error(`Bangumi API 请求失败：HTTP ${response.status}${detail ? ` ${detail.slice(0, 100)}` : ""}`);
  }
  return response.json();
}

function collectionTypeToLocal(type, itemType) {
  const value = Number(type);
  if (itemType === "game") {
    if (value === 2) return "玩过 ✅";
    if (value === 3) return "在玩 🎮";
    if (value === 4) return "云过 ☁️";
    if (value === 5) return "抛弃 🚮";
    return "想玩 🕗";
  }
  if (value === 2) return "看完 ✅";
  if (value === 3) return "追番 ▶";
  if (value === 4) return "搁置 ⏸️";
  if (value === 5) return "抛弃 🚮";
  return "想看 🕗";
}

function ratingToLocal(rate) {
  const numeric = Number(rate) || 0;
  if (numeric <= 0) return "";
  return "⭐".repeat(Math.min(5, Math.max(1, Math.ceil(numeric / 2))));
}

function coverUrlFromCollection(collection) {
  const images = collection?.subject?.images || collection?.subject?.image || {};
  return images.large || images.common || images.medium || images.small || "";
}

async function verifyBangumiAccessToken(accessToken) {
  const me = await fetchBangumiApi("/me", accessToken);
  return { username: me.username || "", nickname: me.nickname || me.username || "" };
}

async function listBangumiCharacterCollections(accessToken) {
  const me = await verifyBangumiAccessToken(accessToken);
  const characters = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const page = await fetchBangumiApi(`/users/${encodeURIComponent(me.username)}/collections/-/characters?limit=${limit}&offset=${offset}`, accessToken);
    const data = Array.isArray(page?.data) ? page.data : [];
    characters.push(...data);
    if (!data.length || characters.length >= Number(page?.total || 0)) break;
  }
  return { account: me, characters };
}

async function fetchBangumiCharacterForSync(characterId, accessToken) {
  return fetchBangumiApi(`/characters/${characterId}`, accessToken);
}

function infoboxText(value) {
  if (typeof value === "string") return value.trim();
  if (!Array.isArray(value)) return "";
  return value.map((entry) => {
    if (typeof entry === "string") return entry;
    return entry?.v || entry?.value || "";
  }).map((entry) => String(entry).trim()).find(Boolean) || "";
}

function characterChineseName(character) {
  const direct = String(character?.name_cn || "").trim();
  if (direct) return direct;
  const fields = Array.isArray(character?.infobox) ? character.infobox : [];
  const localized = fields.find((field) => /^(简体中文名|中文名)$/.test(String(field?.key || "").trim()));
  return infoboxText(localized?.value);
}

async function characterCollectionToLocalDraft(character, coversPath, options = {}) {
  const fullCharacter = options.fullCharacter || character || {};
  const characterId = String(character?.id || fullCharacter?.id || "");
  if (!characterId) return null;
  const images = fullCharacter?.images || character?.images || {};
  const coverUrl = images.large || images.medium || images.grid || images.small || "";
  const coverPath = options.downloadCover === false ? "" : await downloadCover(characterId, coverUrl, coversPath, "bangumi_character");
  const originalName = fullCharacter?.name || character?.name || `Bangumi角色 ${characterId}`;
  const chineseName = characterChineseName(fullCharacter);
  const displayName = chineseName || originalName;
  return {
    item_type: "wife",
    title: displayName,
    title_cn: displayName,
    original_title: originalName,
    year: "",
    status: "",
    rating: "",
    bangumi_subject_id: characterId,
    bangumi_url: `https://bgm.tv/character/${characterId}`,
    cover_path: coverPath,
    notes: "",
    details: {
      bangumi_character_id: characterId,
      collected_at: character?.created_at || "",
      summary: fullCharacter?.summary || "",
      bangumi_chinese_name_found: Boolean(chineseName)
    }
  };
}
async function listBangumiCollections(accessToken, subjectType) {
  const me = await verifyBangumiAccessToken(accessToken);
  const collections = [];
  const limit = 100;
  for (let offset = 0; ; offset += limit) {
    const page = await fetchBangumiApi(`/users/${encodeURIComponent(me.username)}/collections?subject_type=${subjectType}&limit=${limit}&offset=${offset}`, accessToken);
    const data = Array.isArray(page?.data) ? page.data : [];
    collections.push(...data);
    if (!data.length || collections.length >= Number(page?.total || 0)) break;
  }
  return { account: me, collections };
}

async function collectionToLocalDraft(collection, itemType, coversPath, options = {}) {
  const subject = options.fullSubject || collection?.subject || {};
  const subjectId = String(collection?.subject_id || subject?.id || "");
  if (!subjectId) return null;
  const coverPath = options.downloadCover === false ? "" : await downloadCover(subjectId, coverUrlFromCollection(collection), coversPath);
  const primaryTitle = subject.name_cn || subject.name || `Bangumi ${subjectId}`;
  const details = {
    bangumi_type: subject.type ? String(subject.type) : "",
    air_date: subject.date || ""
  };
  if (itemType === "anime") {
    details.season = animeSeasonFromSubject(subject);
    if (Number(collection?.ep_status) > 0) details.progress = String(collection.ep_status);
  } else if (itemType === "game") {
    const releaseDate = gameReleaseDateFromSubject(subject, options.preferredYear);
    if (releaseDate) details.release_date = releaseDate;
  }
  return {
    item_type: itemType,
    title: primaryTitle,
    title_cn: subject.name_cn || primaryTitle,
    original_title: subject.name || "",
    year: yearFromDate(subject.date),
    status: collectionTypeToLocal(collection.type, itemType),
    rating: ratingToLocal(collection.rate),
    bangumi_subject_id: subjectId,
    bangumi_url: `https://bgm.tv/subject/${subjectId}`,
    cover_path: coverPath,
    notes: "",
    details
  };
}

function localStatusToCollectionType(status, itemType) {
  const value = String(status || "");
  if (value.includes("抛弃") || value.includes("放弃")) return 5;
  if (["game", "online_game", "eroge"].includes(itemType)) {
    if (value.includes("在玩")) return 3;
    if (value.includes("云过")) return 4;
    if (value.includes("玩过")) return 2;
    if (value.includes("搁置")) return 4;
    return 1;
  }
  if (value.includes("追番")) return 3;
  if (value.includes("搁置")) return 4;
  if (value.includes("看完") || value.includes("二刷")) return 2;
  return 1;
}

function localRatingToBangumi(rating) {
  if (String(rating || "").includes("💔")) return 1;
  const stars = (String(rating || "").match(/⭐/g) || []).length;
  return stars ? stars * 2 : 0;
}

async function pushBangumiCollection(accessToken, item) {
  const subjectId = String(item?.bangumi_subject_id || "");
  if (!subjectId) throw new Error("缺少 Bangumi Subject ID");
  await fetchBangumiApi(`/users/-/collections/${subjectId}`, accessToken, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: localStatusToCollectionType(item.status, item.item_type), rate: localRatingToBangumi(item.rating) })
  });
}

async function pushAnimeEpisodeProgress(accessToken, item) {
  const target = Math.max(0, Number(item?.details?.progress) || 0);
  if (!target) return 0;
  const subjectId = String(item?.bangumi_subject_id || "");
  const [episodePage, collectionPage] = await Promise.all([
    fetchBangumiApi(`/episodes?subject_id=${subjectId}&type=0&limit=100`, accessToken),
    fetchBangumiApi(`/users/-/collections/${subjectId}/episodes`, accessToken)
  ]);
  const episodes = Array.isArray(episodePage?.data) ? episodePage.data : [];
  const collections = Array.isArray(collectionPage) ? collectionPage : (collectionPage?.data || []);
  const completedIds = new Set(collections.filter((entry) => Number(entry.type) === 2).map((entry) => String(entry.episode_id || entry.episode?.id || "")));
  const watched = episodes.filter((episode) => Number(episode.sort || episode.ep || 0) <= target && !completedIds.has(String(episode.id)));
  let updated = 0;
  for (const episode of watched) {
    await fetchBangumiApi(`/users/-/collections/-/episodes/${episode.id}`, accessToken, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: 2 })
    });
    updated += 1;
  }
  return updated;
}
async function importBangumiSubject(inputUrl, coversPath, options = {}) {
  const subjectId = extractSubjectId(inputUrl);
  const subject = await fetchSubject(subjectId, options.accessToken || "");
  const coverPath = await downloadCover(subjectId, coverUrlFromSubject(subject), coversPath);
  const sourceUrl = `https://bgm.tv/subject/${subjectId}`;

  const primaryTitle = subject.name_cn || subject.name || `Bangumi ${subjectId}`;

  return {
    subjectId,
    sourceUrl,
    rawType: subject.type,
    draft: {
      item_type: suggestLocalType(subject),
      title: primaryTitle,
      title_cn: subject.name_cn || primaryTitle,
      original_title: subject.name || "",
      year: yearFromDate(subject.date),
      status: "",
      rating: "",
      bangumi_subject_id: subjectId,
      bangumi_url: sourceUrl,
      cover_path: coverPath,
      notes: "",
      details: {
        bangumi_type: subject.type ? String(subject.type) : "",
        air_date: subject.date || "",
        season: animeSeasonFromSubject(subject),
        ...(Number(subject.type) === 4 && gameReleaseDateFromSubject(subject, options.preferredYear) ? { release_date: gameReleaseDateFromSubject(subject, options.preferredYear) } : {})
      }
    }
  };
}

async function fetchBangumiSubjectForSync(subjectId, accessToken = "") {
  await pauseSyncRequest();
  return fetchSubject(subjectId, accessToken);
}

async function testBangumiConnection() {
  const response = await fetchWithTimeout(`${API_BASE}/1`);
  if (!response.ok) throw new Error(`Bangumi API 连接测试失败：HTTP ${response.status}`);
}
module.exports = {
  configureBangumiProxy,
  testBangumiConnection,
  extractSubjectId,
  importBangumiSubject,
  updateBangumiSubject: importBangumiSubject,
  verifyBangumiAccessToken,
  listBangumiCollections,
  listBangumiCharacterCollections,
  characterCollectionToLocalDraft,
  fetchBangumiCharacterForSync,
  collectionToLocalDraft,
  fetchBangumiSubjectForSync,
  pushBangumiCollection,
  pushAnimeEpisodeProgress
};







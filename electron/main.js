const { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, net, protocol, safeStorage, shell, screen, WebContentsView } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const fs = require("node:fs");
const crypto = require("node:crypto");
const initSqlJs = require("sql.js");
const { configureBangumiProxy, testBangumiConnection, importBangumiSubject, verifyBangumiAccessToken, listBangumiCollections, listBangumiCharacterCollections, collectionToLocalDraft, characterCollectionToLocalDraft, fetchBangumiCharacterForSync, fetchBangumiSubjectForSync, pushBangumiCollection, pushAnimeEpisodeProgress } = require("./main/bangumiApi");
const { normalizeBangumiProxy } = require("./main/bangumiProxy");
const { backupDatabaseIfDue, writeDatabaseAtomically } = require("./main/databaseFiles");
const { wifeMatchesSearch } = require("./main/wifeSearch");

const { ensureDatabaseSchema } = require("./main/databaseSchema");
const { collectImageReferences, imageUsage } = require("./main/imageReferences");
const { findBangumiItem } = require("./main/bangumiItems");
const { claimSingleInstance } = require("./main/singleInstance");

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
let mainWindow;
let bangumiBrowserView;
let bangumiBrowserIdleTimer;
let db;
let storagePaths;

protocol.registerSchemesAsPrivileged([
  { scheme: "lifegumi-file", privileges: { standard: true, secure: true, supportFetchAPI: true } }
]);

const ALLOWED_EXTERNAL_HOSTS = new Set([
  "bgm.tv",
  "bangumi.tv",
  "movie.douban.com",
  "book.douban.com",
  "m.douban.com"
]);
const COVER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);


function isPathInside(parentPath, targetPath) {
  const parent = path.resolve(parentPath);
  const target = path.resolve(targetPath);
  const relative = path.relative(parent, target);
  return relative === "" || (relative && !relative.startsWith("..") && !path.isAbsolute(relative));
}

function isAllowedCoverPath(filePath) {
  const { coversPath, notebookImagesPath } = ensureAppStorage();
  const ext = path.extname(filePath).toLowerCase();
  return COVER_EXTENSIONS.has(ext) && (isPathInside(coversPath, filePath) || isPathInside(notebookImagesPath, filePath));
}

function forbiddenResponse(message = "Forbidden") {
  return new Response(message, { status: 403 });
}

function isAllowedExternalUrl(urlText) {
  try {
    const parsed = new URL(urlText);
    return parsed.protocol === "https:" && ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

function isAppNavigationUrl(urlText) {
  try {
    const parsed = new URL(urlText);
    if (parsed.protocol === "file:") return true;
    return isDev && process.env.VITE_DEV_SERVER_URL && urlText.startsWith(process.env.VITE_DEV_SERVER_URL);
  } catch {
    return false;
  }
}

function wireExternalLinkSafety(window) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) shell.openExternal(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isAppNavigationUrl(url)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) shell.openExternal(url);
  });
}


const BANGUMI_BROWSER_HOME = "https://bgm.tv/";
const BANGUMI_BROWSER_IDLE_MS = 30 * 60 * 1000;

function isBangumiBrowserUrl(urlText) {
  try {
    const parsed = new URL(urlText);
    const host = parsed.hostname.toLowerCase();
    return parsed.protocol === "https:" && (host === "bgm.tv" || host.endsWith(".bgm.tv") || host === "bangumi.tv" || host.endsWith(".bangumi.tv"));
  } catch {
    return false;
  }
}

function isBangumiSubjectUrl(urlText) {
  if (!isBangumiBrowserUrl(urlText)) return false;
  try {
    return /^\/subject\/\d+\/?$/.test(new URL(urlText).pathname);
  } catch {
    return false;
  }
}
function normalizeBangumiBrowserUrl(urlText) {
  const value = String(urlText || "").trim();
  if (!value) return BANGUMI_BROWSER_HOME;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  return isBangumiBrowserUrl(candidate) ? candidate : null;
}

function sendBangumiBrowserState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const contents = bangumiBrowserView?.webContents;
  mainWindow.webContents.send("bangumiBrowser:state", {
    created: Boolean(contents && !contents.isDestroyed()),
    url: contents && !contents.isDestroyed() ? contents.getURL() || BANGUMI_BROWSER_HOME : BANGUMI_BROWSER_HOME,
    title: contents && !contents.isDestroyed() ? contents.getTitle() || "Bangumi" : "Bangumi",
    canGoBack: Boolean(contents && !contents.isDestroyed() && contents.navigationHistory.canGoBack()),
    canGoForward: Boolean(contents && !contents.isDestroyed() && contents.navigationHistory.canGoForward()),
    loading: Boolean(contents && !contents.isDestroyed() && contents.isLoading())
  });
}

function clearBangumiBrowserIdleTimer() {
  if (bangumiBrowserIdleTimer) clearTimeout(bangumiBrowserIdleTimer);
  bangumiBrowserIdleTimer = null;
}

function destroyBangumiBrowser() {
  clearBangumiBrowserIdleTimer();
  if (!bangumiBrowserView) return;
  const view = bangumiBrowserView;
  bangumiBrowserView = null;
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.contentView.removeChildView(view);
  if (!view.webContents.isDestroyed()) view.webContents.close();
  sendBangumiBrowserState();
}

function scheduleBangumiBrowserCleanup() {
  clearBangumiBrowserIdleTimer();
  bangumiBrowserIdleTimer = setTimeout(destroyBangumiBrowser, BANGUMI_BROWSER_IDLE_MS);
}

function ensureBangumiBrowser() {
  clearBangumiBrowserIdleTimer();
  if (bangumiBrowserView && !bangumiBrowserView.webContents.isDestroyed()) return bangumiBrowserView;
  const view = new WebContentsView({
    webPreferences: {
      partition: "persist:lifegumi-bangumi",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  bangumiBrowserView = view;
  mainWindow.contentView.addChildView(view);
  view.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  view.webContents.on("context-menu", (_event, params) => {
    const template = [];
    if (params.linkURL) {
      template.push({ label: "复制链接地址", click: () => clipboard.writeText(params.linkURL) });
      if (isBangumiSubjectUrl(params.linkURL)) {
        template.push({ label: "从 Bangumi 导入", click: () => mainWindow.webContents.send("bangumiBrowser:importSubject", params.linkURL) });
      }
      if (/^https?:\/\//i.test(params.linkURL)) {
        template.push({ label: "在默认浏览器打开", click: () => shell.openExternal(params.linkURL) });
      }
    }
    if (params.selectionText) {
      if (template.length) template.push({ type: "separator" });
      template.push({ label: "复制选中文字", role: "copy" });
    }
    if (!template.length) {
      template.push({ label: "复制当前页网址", click: () => clipboard.writeText(view.webContents.getURL()) });
    }
    Menu.buildFromTemplate(template).popup({ window: mainWindow });
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    if (isBangumiBrowserUrl(url)) view.webContents.loadURL(url);
    else if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  view.webContents.on("will-navigate", (event, url) => {
    if (isBangumiBrowserUrl(url)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });
  ["did-start-loading", "did-stop-loading", "did-navigate", "did-navigate-in-page", "page-title-updated"].forEach((eventName) => {
    view.webContents.on(eventName, sendBangumiBrowserState);
  });
  view.webContents.loadURL(BANGUMI_BROWSER_HOME);
  return view;
}

function assertMainRenderer(event) {
  if (!mainWindow || event.sender !== mainWindow.webContents) throw new Error("Unauthorized browser control request");
}
function ensureAppStorage() {
  const userDataPath = app.getPath("userData");
  const coversPath = path.join(userDataPath, "covers");
  const notebookImagesPath = path.join(userDataPath, "notebook-images");
  fs.mkdirSync(coversPath, { recursive: true });
  fs.mkdirSync(notebookImagesPath, { recursive: true });
  return {
    userDataPath,
    coversPath,
    notebookImagesPath,
    databasePath: path.join(userDataPath, "lifegumi.sqlite")
  };
}

function getProjectRootPath() {
  if (!app.isPackaged) return app.getAppPath();
  const exeDir = path.dirname(app.getPath("exe"));
  if (path.basename(exeDir) === "win-unpacked" && path.basename(path.dirname(exeDir)) === "release") {
    return path.dirname(path.dirname(exeDir));
  }
  return exeDir;
}

function getProjectDataPath() {
  return path.join(getProjectRootPath(), "data-public");
}


app.setPath("userData", getProjectDataPath());
const hasInstanceLock = claimSingleInstance(app, () => mainWindow);

// Keep all user data beside the portable app instead of Electron's C: userData folder.


function ensureNotebookTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS notebook_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      order_index INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS notebook_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notebook_notes_category ON notebook_notes(category_id);
    CREATE INDEX IF NOT EXISTS idx_notebook_notes_updated ON notebook_notes(updated_at);
    CREATE TABLE IF NOT EXISTS notebook_note_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      image_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_notebook_note_images_note ON notebook_note_images(note_id);
  `);
  const categoryCount = Number(selectOne("SELECT COUNT(*) AS count FROM notebook_categories")?.count || 0);
  if (!categoryCount) db.run("INSERT INTO notebook_categories (name, order_index) VALUES (?, 0)", ["默认"]);
}
async function initDatabase() {
  storagePaths = ensureAppStorage();
  backupDatabaseIfDue(storagePaths.databasePath);
  const SQL = await initSqlJs({
    locateFile: (file) => require.resolve(`sql.js/dist/${file}`)
  });
  db = loadDatabase(SQL, storagePaths.databasePath);
  ensureDatabaseSchema(db);
  ensureNotebookTables();
  migratePublishedBookItems();
  migrateGameCloudValues();
  removeGameTimeReferenceItems();
  saveDatabase();
}

function loadDatabase(SQL, databasePath) {
  if (fs.existsSync(databasePath)) {
    return new SQL.Database(fs.readFileSync(databasePath));
  }
  return new SQL.Database();
}

function getAppSetting(key) {
  return selectOne("SELECT setting_value FROM app_settings WHERE setting_key = ?", [key])?.setting_value || "";
}

function setAppSetting(key, value) {
  db.run(`
    INSERT INTO app_settings (setting_key, setting_value, updated_at)
    VALUES (?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = CURRENT_TIMESTAMP
  `, [key, String(value || "")]);
}

function removeAppSetting(key) {
  db.run("DELETE FROM app_settings WHERE setting_key = ?", [key]);
}

function getBangumiAccessToken() {
  const encrypted = getAppSetting("bangumi_access_token");
  if (!encrypted) throw new Error("请先在 Bangumi 同步中保存 Access Token");
  if (!safeStorage.isEncryptionAvailable()) throw new Error("当前 Windows 安全存储不可用，无法读取 Bangumi Access Token");
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, "base64"));
  } catch {
    throw new Error("Bangumi Access Token 无法读取，请重新保存");
  }
}

function getOptionalBangumiAccessToken() {
  return getAppSetting("bangumi_access_token") ? getBangumiAccessToken() : "";
}

function saveBangumiAccessToken(token, account) {
  if (!safeStorage.isEncryptionAvailable()) throw new Error("当前 Windows 安全存储不可用，无法安全保存 Access Token");
  const encrypted = safeStorage.encryptString(token).toString("base64");
  setAppSetting("bangumi_access_token", encrypted);
  setAppSetting("bangumi_username", account.username || "");
  setAppSetting("bangumi_nickname", account.nickname || account.username || "");
}

function bangumiSyncStatus() {
  return {
    configured: Boolean(getAppSetting("bangumi_access_token")),
    proxyUrl: getAppSetting("bangumi_proxy_url"),
    username: getAppSetting("bangumi_username"),
    nickname: getAppSetting("bangumi_nickname"),
    lastPullAt: getAppSetting("bangumi_last_pull_at"),
    lastPushAt: getAppSetting("bangumi_last_push_at")
  };
}

function bangumiCollectionSignature(item) {
  return `${item?.status || ""}|${item?.rating || ""}`;
}

function bangumiEpisodeProgress(item) {
  return item?.item_type === "anime" ? String(item?.details?.progress || "") : "";
}

function getBangumiSyncItemState(itemId) {
  return selectOne("SELECT * FROM bangumi_sync_state WHERE item_id = ?", [itemId]);
}

function saveBangumiSyncItemState(item) {
  const signature = bangumiCollectionSignature(item);
  const progress = bangumiEpisodeProgress(item);
  const previous = getBangumiSyncItemState(item.id);
  if (previous?.collection_signature === signature && previous?.episode_progress === progress) return;
  db.run(`
    INSERT INTO bangumi_sync_state (item_id, collection_signature, episode_progress, updated_at)
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(item_id) DO UPDATE SET collection_signature = excluded.collection_signature,
      episode_progress = excluded.episode_progress, updated_at = CURRENT_TIMESTAMP
  `, [item.id, signature, progress]);
}

function sendBangumiSyncProgress(payload) {
  mainWindow?.webContents.send("bangumiSync:progress", payload);
}

function syncDisplayValue(value) {
  const text = String(value ?? "").trim();
  return text || "未填写";
}

function describeBangumiChanges(existing, next, details, itemType) {
  const fields = itemType === "wife"
    ? [
      ["title_cn", "中文名", existing.title_cn, next.title_cn],
      ["original_title", "原文名", existing.original_title, next.original_title],
      ["summary", "简介", existing.details?.summary, details.summary]
    ]
    : [
      ["status", "状态", existing.status, next.status],
      ["rating", "评分", existing.rating, next.rating],
      ["year", "年份", existing.year, next.year],
      ["progress", "进度", existing.details?.progress, details.progress],
      ["release_date", "发售日期", existing.details?.release_date, details.release_date],
      ["air_date", "开播日期", existing.details?.air_date, details.air_date]
    ];
  return fields
    .filter(([, , before, after]) => String(before ?? "") !== String(after ?? ""))
    .map(([key, label, before, after]) => ({ key, label, before: syncDisplayValue(before), after: syncDisplayValue(after) }));
}

function saveSyncedItem(existingRow, draft) {
  const existing = existingRow ? rowToItem(existingRow) : null;
  const gameTypes = new Set(["game", "online_game"]);
  const compatibleGameType = draft.item_type === "game" && gameTypes.has(existing?.item_type);
  if (existing && existing.item_type !== draft.item_type && !compatibleGameType) return { action: "skipped", id: existing.id, changes: [] };
  const mergedDetails = { ...(existing?.details || {}), ...(draft.details || {}) };
  const payload = existing ? {
    ...existing,
    title: existing.item_type === "wife" ? draft.title : existing.title || draft.title,
    title_cn: existing.item_type === "wife" ? draft.title_cn : existing.title_cn || draft.title_cn || draft.title,
    original_title: existing.item_type === "wife" ? draft.original_title : existing.original_title || draft.original_title,
    year: existing.year || draft.year,
    status: existing.item_type === "wife" ? existing.status : draft.status,
    rating: existing.item_type === "wife" ? existing.rating : draft.rating,
    bangumi_subject_id: draft.bangumi_subject_id,
    bangumi_url: draft.bangumi_url,
    cover_path: existing.cover_path || draft.cover_path,
    details: mergedDetails
  } : draft;
  const next = normalizeItem(payload);
  if (existing) {
    const changes = describeBangumiChanges(existing, next, mergedDetails, existing.item_type);
    const persistedFields = ["title", "title_cn", "original_title", "year", "status", "rating", "bangumi_subject_id", "bangumi_url", "cover_path"];
    const unchanged = persistedFields.every((key) => String(existing[key] || "") === String(next[key] || ""))
      && JSON.stringify(existing.details || {}) === next.details_json;
    if (unchanged) return { action: "skipped", id: existing.id, changes: [] };
    db.run(`UPDATE items SET title = @title, title_cn = @title_cn, original_title = @original_title, year = @year,
      status = @status, rating = @rating, bangumi_subject_id = @bangumi_subject_id, bangumi_url = @bangumi_url,
      cover_path = @cover_path, details_json = @details_json, updated_at = CURRENT_TIMESTAMP WHERE id = @id`, {
      "@title": next.title, "@title_cn": next.title_cn, "@original_title": next.original_title, "@year": next.year,
      "@status": next.status, "@rating": next.rating, "@bangumi_subject_id": next.bangumi_subject_id,
      "@bangumi_url": next.bangumi_url, "@cover_path": next.cover_path, "@details_json": next.details_json, "@id": existing.id
    });
    return { action: "updated", id: existing.id, changes };
  }
  db.run(`INSERT INTO items (item_type, title, title_cn, original_title, year, status, rating, bangumi_subject_id, bangumi_url, cover_path, notes, details_json)
    VALUES (@item_type, @title, @title_cn, @original_title, @year, @status, @rating, @bangumi_subject_id, @bangumi_url, @cover_path, @notes, @details_json)`, {
    "@item_type": next.item_type, "@title": next.title, "@title_cn": next.title_cn, "@original_title": next.original_title,
    "@year": next.year, "@status": next.status, "@rating": next.rating, "@bangumi_subject_id": next.bangumi_subject_id,
    "@bangumi_url": next.bangumi_url, "@cover_path": next.cover_path, "@notes": next.notes, "@details_json": next.details_json
  });
  return { action: "created", id: selectOne("SELECT id FROM items ORDER BY id DESC LIMIT 1")?.id, changes: [] };
}

function normalizeBangumiSyncType(value) {
  if (value === "anime" || value === "game") return value;
  throw new Error("请选择动画或游戏后再同步");
}

async function pullBangumiCollections(requestedType) {
  const itemType = normalizeBangumiSyncType(requestedType);
  const token = getBangumiAccessToken();
  const remote = await listBangumiCollections(token, itemType === "anime" ? 2 : 4);
  const collections = remote.collections;
  const total = collections.length;
  const remoteIds = new Set(collections.map((entry) => String(entry.subject_id || entry.subject?.id || "")));
  const localTypes = itemType === "game" ? ["game", "online_game"] : ["anime"];
  const typePlaceholders = localTypes.map(() => "?").join(", ");
  const missing = selectRows(`SELECT i.* FROM items i INNER JOIN bangumi_sync_state s ON s.item_id = i.id WHERE i.item_type IN (${typePlaceholders}) AND TRIM(COALESCE(i.bangumi_subject_id, '')) <> ''`, localTypes)
    .filter((item) => !remoteIds.has(String(item.bangumi_subject_id))).map(rowToItem);
  const result = { created: 0, updated: 0, skipped: 0, failed: 0, total, account: remote.account, changes: [], errors: [] };
  let current = 0;
  for (const collection of collections) {
    current += 1;
    const title = collection?.subject?.name_cn || collection?.subject?.name || "未命名条目";
    sendBangumiSyncProgress({ direction: "pull", current, total, title });
    try {
      const subjectId = String(collection?.subject_id || collection?.subject?.id || "");
      const existing = subjectId ? findBangumiItem(selectOne, subjectId, "subject") : null;
      const existingItem = existing ? rowToItem(existing) : null;
      const gameDetailsChecked = Boolean(existingItem?.details?.bangumi_game_details_checked_at);
      const needsGameDetails = itemType === "game" && (!existing || (!existingItem?.details?.release_date && !gameDetailsChecked));
      let fullSubject = null;
      if (needsGameDetails) {
        try {
          fullSubject = await fetchBangumiSubjectForSync(subjectId, token);
        } catch (error) {
          if (error?.code === "BANGUMI_RATE_LIMIT") throw error;
        }
      }
      const draft = await collectionToLocalDraft(collection, itemType, ensureAppStorage().coversPath, {
        downloadCover: !existing?.cover_path,
        fullSubject,
        preferredYear: existingItem?.year || fullSubject?.date?.slice(0, 4) || ""
      });
      if (!draft) { result.skipped += 1; continue; }
      if (needsGameDetails) {
        draft.details = { ...draft.details, bangumi_game_details_checked_at: new Date().toISOString() };
      }
      const saved = saveSyncedItem(existing, draft);
      const item = saved.id ? rowToItem(selectOne("SELECT * FROM items WHERE id = ?", [saved.id])) : null;
      if (item) saveBangumiSyncItemState(item);
      result[saved.action] += 1;
      if (saved.action === "created" || saved.action === "updated") {
        result.changes.push({ action: saved.action, id: saved.id, title: item?.title_cn || item?.title || title, itemType: item?.item_type || itemType, fields: saved.changes || [] });
      }
      if (current % 25 === 0) saveDatabase();
    } catch (error) {
      if (error?.code === "BANGUMI_RATE_LIMIT") {
        saveDatabase();
        throw error;
      }
      result.failed += 1;
      result.errors.push({ title, message: error.message || "同步失败" });
    }
  }
  result.missing = missing;
  setAppSetting(`bangumi_last_pull_at_${itemType}`, new Date().toISOString());
  saveDatabase();
  return result;
}

async function pushBangumiCollections(requestedType) {
  const itemType = normalizeBangumiSyncType(requestedType);
  const token = getBangumiAccessToken();
  const localTypes = itemType === "game" ? ["game", "online_game"] : ["anime"];
  const typePlaceholders = localTypes.map(() => "?").join(", ");
  const rows = selectRows(`SELECT * FROM items WHERE item_type IN (${typePlaceholders}) AND TRIM(COALESCE(bangumi_subject_id, '')) <> ''`, localTypes);
  const result = { pushed: 0, skipped: 0, episodes: 0, failed: 0, total: rows.length, changes: [], errors: [] };
  let current = 0;
  for (const row of rows) {
    current += 1;
    const item = rowToItem(row);
    sendBangumiSyncProgress({ direction: "push", current, total: rows.length, title: item?.title_cn || item?.title || "未命名条目" });
    try {
      const previous = getBangumiSyncItemState(item.id);
      const collectionChanged = !previous || previous.collection_signature !== bangumiCollectionSignature(item);
      const episodeChanged = item.item_type === "anime" && (!previous || previous.episode_progress !== bangumiEpisodeProgress(item));
      if (!collectionChanged && !episodeChanged) { result.skipped += 1; continue; }
      if (collectionChanged) await pushBangumiCollection(token, item);
      const episodeCount = episodeChanged ? await pushAnimeEpisodeProgress(token, item) : 0;
      result.episodes += episodeCount;
      saveBangumiSyncItemState(item);
      result.pushed += 1;
      result.changes.push({
        action: "pushed",
        id: item.id,
        title: item?.title_cn || item?.title || "未命名条目",
        itemType: item.item_type,
        fields: [
          ...(collectionChanged ? [{ key: "collection", label: "状态与评分", before: "本地", after: "已上传" }] : []),
          ...(episodeChanged ? [{ key: "progress", label: "观看进度", before: String(previous?.episode_progress || 0), after: String(item.details?.progress || 0) }] : [])
        ],
        episodes: episodeCount
      });
      if (current % 25 === 0) saveDatabase();
    } catch (error) {
      if (error?.code === "BANGUMI_RATE_LIMIT") {
        saveDatabase();
        throw error;
      }
      result.failed += 1;
      result.errors.push({ title: item?.title_cn || item?.title || "未命名条目", message: error.message || "同步失败" });
    }
  }
  setAppSetting(`bangumi_last_push_at_${itemType}`, new Date().toISOString());
  saveDatabase();
  return result;
}
function getItemCount() {
  try {
    return Number(selectOne("SELECT COUNT(*) AS count FROM items")?.count || 0);
  } catch {
    return 0;
  }
}

// Packaged builds include the Excel-imported database as a first-run seed.
// It is only used when the user's current database is empty, so real data is never overwritten.

function saveDatabase() {
  if (!db || !storagePaths) return;
  writeDatabaseAtomically(storagePaths.databasePath, Buffer.from(db.export()));
}


function selectRows(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function selectOne(sql, params = []) {
  return selectRows(sql, params)[0] || null;
}

function rowToItem(row) {
  if (!row) return null;
  let details = {};
  try {
    details = row.details_json ? JSON.parse(row.details_json) : {};
  } catch {
    details = {};
  }
  if (row.item_type === "wife" && details.real_person_type === "偶像") details.real_person_type = "欧美";
  return {
    ...row,
    details
  };
}

function isPublishedBookKind(value) {
  const text = String(value || "");
  return text.includes("出版书") || text.includes("出版");
}

function migratePublishedBookItems() {
  const rows = selectRows("SELECT id, details_json FROM items WHERE item_type = 'novel'");
  for (const row of rows) {
    let details = {};
    try {
      details = row.details_json ? JSON.parse(row.details_json) : {};
    } catch {
      details = {};
    }
    if (!isPublishedBookKind(details.kind)) continue;
    delete details.kind;
    db.run("UPDATE items SET item_type = 'published_book', details_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [JSON.stringify(details), row.id]);
  }
}

function migrateGameCloudValues() {
  const rows = selectRows("SELECT id, details_json FROM items WHERE item_type = 'game'");
  for (const row of rows) {
    let details = {};
    try { details = JSON.parse(row.details_json || "{}"); } catch { details = {}; }
    const previous = String(details.cloud || "").trim();
    if (!previous) continue;
    const nextValue = /^(是|云过|true|1)/i.test(previous) ? "云过 ☁️" : "";
    if (previous === nextValue) continue;
    if (nextValue) details.cloud = nextValue;
    else delete details.cloud;
    db.run("UPDATE items SET details_json = ? WHERE id = ?", [JSON.stringify(details), row.id]);
  }
}

function removeGameTimeReferenceItems() {
  db.run("DELETE FROM items WHERE item_type = 'game_time_reference'");
}





function rowToActivity(row) {
  if (!row) return null;
  const item = row.linked_id ? rowToItem({
    id: row.linked_id,
    item_type: row.linked_item_type,
    title: row.linked_title,
    title_cn: row.linked_title_cn,
    original_title: row.linked_original_title,
    year: row.linked_year,
    status: row.linked_status,
    rating: row.linked_rating,
    bangumi_subject_id: row.linked_bangumi_subject_id,
    bangumi_url: row.linked_bangumi_url,
    cover_path: row.linked_cover_path,
    notes: row.linked_notes,
    details_json: row.linked_details_json,
    created_at: row.linked_created_at,
    updated_at: row.linked_updated_at
  }) : null;

  return {
    id: row.id,
    action: row.action || "记录",
    item_id: row.item_id || null,
    subject_title: row.subject_title || "",
    progress_text: row.progress_text || "",
    note: row.note || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
    item
  };
}

function normalizeActivity(payload = {}, fallback = {}) {
  const itemId = Number(payload.item_id ?? fallback.item_id ?? 0) || null;
  return {
    action: String(payload.action ?? fallback.action ?? "记录").trim().slice(0, 24) || "记录",
    item_id: itemId,
    subject_title: String(payload.subject_title ?? fallback.subject_title ?? "").trim().slice(0, 220),
    progress_text: String(payload.progress_text ?? fallback.progress_text ?? "").trim().slice(0, 100),
    note: String(payload.note ?? fallback.note ?? "").trim().slice(0, 1600)
  };
}

function activitySelectSql() {
  return [
    "SELECT a.*",
    "i.id AS linked_id",
    "i.item_type AS linked_item_type",
    "i.title AS linked_title",
    "i.title_cn AS linked_title_cn",
    "i.original_title AS linked_original_title",
    "i.year AS linked_year",
    "i.status AS linked_status",
    "i.rating AS linked_rating",
    "i.bangumi_subject_id AS linked_bangumi_subject_id",
    "i.bangumi_url AS linked_bangumi_url",
    "i.cover_path AS linked_cover_path",
    "i.notes AS linked_notes",
    "i.details_json AS linked_details_json",
    "i.created_at AS linked_created_at",
    "i.updated_at AS linked_updated_at",
    "FROM activity_logs a",
    "LEFT JOIN items i ON i.id = a.item_id"
  ].join(", ").replace(", FROM", " FROM").replace(", LEFT", " LEFT");
}

function displayItemTitle(item) {
  return item?.title_cn || item?.title || item?.original_title || "未命名";
}

function firstNumber(value) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : 0;
}

function normalizedProgress(item) {
  const details = item?.details || {};
  if (item?.item_type === "anime") {
    const current = firstNumber(details.progress);
    return current ? { key: "anime:" + current, text: "第 " + current + " 集", action: "看了" } : null;
  }
  if (item?.item_type === "manga") {
    const chapter = firstNumber(details.current_chapter || details.progress_chapters);
    const volume = firstNumber(details.current_volume);
    if (chapter) return { key: "manga:c:" + chapter, text: "第 " + chapter + " 话", action: "读过" };
    if (volume) return { key: "manga:v:" + volume, text: "第 " + volume + " 卷", action: "读过" };
  }
  if (item?.item_type === "light_novel") {
    const volume = firstNumber(details.current_volume || details.progress);
    return volume ? { key: "light_novel:v:" + volume, text: "第 " + volume + " 卷", action: "读过" } : null;
  }
  return null;
}

function actionFromStatus(status, itemType) {
  const value = String(status || "");
  if (value.includes("二刷")) return "二刷";
  if (value.includes("看完")) return "看完";
  if (value.includes("玩过")) return "玩完";
  if (value.includes("已购买")) return "买了";
  if (value.includes("在玩")) return "在玩";
  if (value.includes("在看")) return itemType === "light_novel" || itemType === "novel" ? "在读" : "在看";
  if (value.includes("追")) return "在追";
  if (value.includes("想玩")) return "想玩";
  if (value.includes("想买")) return "想买";
  if (value.includes("想看")) return "想看";
  if (value.includes("云过")) return "云过";
  if (value.includes("未购买")) return "未购买";
  if (value.includes("抛弃") || value.includes("放弃")) return "抛弃";
  if (value.includes("搁置")) return "搁置";
  return "添加";
}

function insertActivityLog(payload) {
  const next = normalizeActivity(payload);
  if (!next.item_id && !next.subject_title && !next.note && !next.progress_text) return;
  db.run([
    "INSERT INTO activity_logs (action, item_id, subject_title, progress_text, note)",
    "VALUES (@action, @item_id, @subject_title, @progress_text, @note)"
  ].join(" "), {
    "@action": next.action,
    "@item_id": next.item_id,
    "@subject_title": next.subject_title,
    "@progress_text": next.progress_text,
    "@note": next.note
  });
}

function logItemCreated(item) {
  if (!item?.id) return;
  insertActivityLog({
    action: actionFromStatus(item.status, item.item_type),
    item_id: item.id,
    subject_title: displayItemTitle(item),
    progress_text: normalizedProgress(item)?.text || "",
    note: ""
  });
}

function logItemUpdated(before, after) {
  if (!after?.id) return;
  const beforeProgress = normalizedProgress(before);
  const afterProgress = normalizedProgress(after);
  const statusChanged = String(before?.status || "") !== String(after.status || "");
  const progressChanged = (beforeProgress?.key || "") !== (afterProgress?.key || "");
  if (!statusChanged && !progressChanged) return;

  insertActivityLog({
    action: statusChanged ? actionFromStatus(after.status, after.item_type) : (afterProgress?.action || "更新"),
    item_id: after.id,
    subject_title: displayItemTitle(after),
    progress_text: afterProgress?.text || "",
    note: ""
  });
}

function yearRank(year) {
  if (!year) return Number.NEGATIVE_INFINITY;
  if (year === "1997年前") return 0;
  const match = String(year).match(/\d{4}/);
  return match ? Number(match[0]) : Number.NEGATIVE_INFINITY;
}

function seasonRank(item) {
  if (item.item_type !== "anime") return 0;
  const season = item.details?.season || "";
  if (season.includes("Q4")) return 4;
  if (season.includes("Q3")) return 3;
  if (season.includes("Q2")) return 2;
  if (season.includes("Q1")) return 1;
  return 0;
}

function isDislikeRating(rating) {
  const value = String(rating || "");
  return value.includes("💔") || value.includes("破碎") || value.includes("不喜欢");
}

function ratingRank(rating) {
  if (isDislikeRating(rating)) return -1;
  const stars = String(rating || "").match(/⭐/g);
  return stars ? stars.length : 0;
}

function isHiddenByDroppedToggle(item) {
  const status = String(item?.status || "");
  return /抛弃|放弃/.test(status) || isDislikeRating(item?.rating);
}

function statusRank(status) {
  const value = String(status || "");
  if (value.includes("追") || value.includes("在看") || value.includes("在玩")) return 0;
  if (value.includes("二刷")) return 1;
  if (value.includes("看完") || value.includes("玩过") || value.includes("已购买")) return 2;
  if (value.includes("搁置")) return 3;
  if (value.includes("想")) return 4;
  if (value.includes("未购买")) return 5;
  if (value.includes("云")) return 6;
  if (value.includes("抛弃") || value.includes("放弃")) return 7;
  return 8;
}

function isActiveStatus(status) {
  const value = String(status || "");
  return value.includes("追") || value.includes("在看") || value.includes("在玩");
}

function effectiveStatusRank(item) {
  const rank = statusRank(item.status);
  if (rank !== 1 && rank !== 7 && isDislikeRating(item.rating)) return 6.5;
  return rank;
}

function shouldSortByRating(item) {
  return statusRank(item.status) === 2 && !isDislikeRating(item.rating);
}

function compareRating(a, b) {
  const aCanSort = shouldSortByRating(a);
  const bCanSort = shouldSortByRating(b);
  if (!aCanSort && !bCanSort) return 0;
  if (aCanSort !== bCanSort) return aCanSort ? -1 : 1;
  return ratingRank(b.rating) - ratingRank(a.rating);
}


function isReadingOrPlayingPinned(item) {
  const status = String(item?.status || "");
  return (item?.item_type === "novel" && status.includes("在看"))
    || (item?.item_type === "eroge" && status.includes("在玩"));
}

function shouldUseNewestOnlySort(item) {
  return item?.item_type === "novel";
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.item_type === "wife" && b.item_type === "wife") {
      const aOrder = Number.isFinite(Number(a.details?.wife_order)) ? Number(a.details.wife_order) : Number.MAX_SAFE_INTEGER;
      const bOrder = Number.isFinite(Number(b.details?.wife_order)) ? Number(b.details.wife_order) : Number.MAX_SAFE_INTEGER;
      return aOrder - bOrder || Number(a.id || 0) - Number(b.id || 0);
    }
    const activeDiff = Number(isActiveStatus(b.status)) - Number(isActiveStatus(a.status));
    if (activeDiff !== 0) return activeDiff;

    const yearDiff = yearRank(b.year) - yearRank(a.year);
    if (yearDiff !== 0) return yearDiff;

    if (a.item_type === b.item_type && shouldUseNewestOnlySort(a)) {
      const pinnedDiff = Number(isReadingOrPlayingPinned(b)) - Number(isReadingOrPlayingPinned(a));
      if (pinnedDiff !== 0) return pinnedDiff;
      return Number(b.id || 0) - Number(a.id || 0);
    }

    const statusDiff = effectiveStatusRank(a) - effectiveStatusRank(b);
    if (statusDiff !== 0) return statusDiff;
    const statusNameDiff = String(a.status || "").localeCompare(String(b.status || ""), "zh-Hans-CN");
    if (statusNameDiff !== 0) return statusNameDiff;

    if (a.item_type === "anime" && b.item_type === "anime") {
      const seasonDiff = seasonRank(b) - seasonRank(a);
      if (seasonDiff !== 0) return seasonDiff;
    }

    const ratingDiff = compareRating(a, b);
    if (ratingDiff !== 0) return ratingDiff;

    return Number(b.id || 0) - Number(a.id || 0);
  });
}

function saveCover(sourcePath) {
  if (!sourcePath) return null;
  const { coversPath } = ensureAppStorage();
  if (isPathInside(coversPath, sourcePath)) return path.resolve(sourcePath);
  const ext = path.extname(sourcePath) || ".png";
  const fileName = `${Date.now()}-${crypto.randomUUID()}${ext}`;
  const targetPath = path.join(coversPath, fileName);
  fs.copyFileSync(sourcePath, targetPath);
  return targetPath;
}

function listCoverFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listCoverFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }
  return files;
}

function cleanUnusedCovers() {
  const { coversPath } = ensureAppStorage();
  const coverRoot = path.resolve(coversPath).toLowerCase();
  const referencedPaths = collectImageReferences(selectRows);
  const usedCovers = new Set(
    referencedPaths
      .filter(Boolean)
      .map((coverPath) => path.resolve(String(coverPath)))
      .filter((coverPath) => coverPath.toLowerCase().startsWith(coverRoot))
      .map((coverPath) => coverPath.toLowerCase())
  );

  const coverFiles = listCoverFiles(coversPath);
  let deleted = 0;
  let failed = 0;
  for (const coverFile of coverFiles) {
    if (usedCovers.has(path.resolve(coverFile).toLowerCase())) continue;
    try {
      fs.unlinkSync(coverFile);
      deleted += 1;
    } catch {
      failed += 1;
    }
  }
  return { ok: true, scanned: coverFiles.length, deleted, failed, coversPath };
}

ipcMain.handle("images:usage", (_event, imagePath, excludingItemId) => {
  return imageUsage(selectRows, imagePath, excludingItemId);
});

async function confirmAndCleanUnusedCovers() {
  const result = await dialog.showMessageBox(mainWindow, {
    type: "question",
    buttons: ["取消", "清理"],
    defaultId: 0,
    cancelId: 0,
    title: "清理未引用封面",
    message: "清理未被任何条目引用的封面图片？",
    detail: "只会删除封面目录中未被条目或记事本使用的图片。"
  });
  if (result.response !== 1) return;

  const cleaned = cleanUnusedCovers();
  await dialog.showMessageBox(mainWindow, {
    type: cleaned.failed ? "warning" : "info",
    title: "清理完成",
    message: `已删除 ${cleaned.deleted} 张未引用封面`,
    detail: cleaned.failed ? `${cleaned.failed} 个文件删除失败，可能正在被占用。` : `扫描了 ${cleaned.scanned} 个封面文件。`
  });
}

function bangumiItemIdFromUrl(value, itemType) {
  const resource = itemType === "wife" ? "character" : "subject";
  const match = String(value || "").match(new RegExp(`(?:bgm\\.tv|bangumi\\.tv|chii\\.in)/${resource}/(\\d+)`, "i"));
  return match?.[1] || "";
}

function normalizeItem(payload) {
  const primaryTitle = payload.title || payload.title_cn || payload.original_title || "";
  const details = { ...(payload.details || {}) };
  if (payload.item_type === "wife" && details.real_person_type === "偶像") details.real_person_type = "欧美";
  return {
    item_type: payload.item_type,
    title: primaryTitle,
    title_cn: payload.title_cn || primaryTitle,
    original_title: payload.original_title || "",
    year: payload.year || "",
    status: payload.status || "",
    rating: payload.rating || "",
    bangumi_subject_id: bangumiItemIdFromUrl(payload.bangumi_url, payload.item_type) || payload.bangumi_subject_id || "",
    bangumi_url: payload.bangumi_url || "",
    cover_path: payload.cover_path || "",
    notes: payload.notes || "",
    details_json: JSON.stringify(details)
  };
}

function createWindow() {
  const { width: workWidth, height: workHeight } = screen.getPrimaryDisplay().workAreaSize;
  const defaultWidth = Math.min(1720, Math.max(1320, workWidth - 120));
  const defaultHeight = Math.min(930, Math.max(760, workHeight - 120));

  mainWindow = new BrowserWindow({
    width: defaultWidth,
    height: defaultHeight,
    minWidth: 1280,
    minHeight: 720,
    center: true,
    backgroundColor: "#f6f7fb",
    title: "Lifegumi",
    icon: path.join(__dirname, "assets", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  wireExternalLinkSafety(mainWindow);
  mainWindow.on("closed", destroyBangumiBrowser);

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function createChineseMenu() {
  const template = [
    {
      label: "文件",
      submenu: [
        { label: "重新加载", role: "reload" },
        { label: "强制重新加载", role: "forceReload" },
        { type: "separator" },
        { label: "退出", role: "quit" }
      ]
    },
    {
      label: "编辑",
      submenu: [
        { label: "撤销", role: "undo" },
        { label: "重做", role: "redo" },
        { type: "separator" },
        { label: "剪切", role: "cut" },
        { label: "复制", role: "copy" },
        { label: "粘贴", role: "paste" },
        { label: "全选", role: "selectAll" }
      ]
    },
    {
      label: "视图",
      submenu: [
        { label: "放大", role: "zoomIn" },
        { label: "缩小", role: "zoomOut" },
        { label: "重置缩放", role: "resetZoom" },
        { type: "separator" },
        { label: "全屏", role: "togglefullscreen" }
      ]
    },
    {
      label: "帮助",
      submenu: [
        {
          label: "打开数据目录",
          click: () => shell.openPath(ensureAppStorage().userDataPath)
        },
        {
          label: "清理未引用封面",
          click: () => confirmAndCleanUnusedCovers()
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (hasInstanceLock) app.whenReady().then(async () => {
  await initDatabase();
  await configureBangumiProxy(getAppSetting("bangumi_proxy_url"));
}).then(() => {
  createChineseMenu();
  protocol.handle("lifegumi-file", (request) => {
    try {
      const url = new URL(request.url);
      const filePath = decodeURIComponent(url.pathname.slice(1));
      if (!isAllowedCoverPath(filePath)) return forbiddenResponse();
      if (!fs.existsSync(filePath)) return new Response("Not Found", { status: 404 });
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return forbiddenResponse("Invalid lifegumi-file URL");
    }
  });
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  saveDatabase();
  if (db) db.close();
});

ipcMain.handle("bangumiBrowser:show", (event) => {
  assertMainRenderer(event);
  const view = ensureBangumiBrowser();
  clearBangumiBrowserIdleTimer();
  view.setVisible(true);
  sendBangumiBrowserState();
  return { ok: true };
});

ipcMain.handle("bangumiBrowser:hide", (event) => {
  assertMainRenderer(event);
  if (bangumiBrowserView) {
    bangumiBrowserView.setVisible(false);
    scheduleBangumiBrowserCleanup();
  }
  return { ok: true };
});

ipcMain.handle("bangumiBrowser:close", (event) => {
  assertMainRenderer(event);
  destroyBangumiBrowser();
  return { ok: true };
});

ipcMain.handle("bangumiBrowser:setBounds", (event, bounds = {}) => {
  assertMainRenderer(event);
  if (!bangumiBrowserView) return { ok: false };
  const nextBounds = {
    x: Math.max(0, Math.round(Number(bounds.x) || 0)),
    y: Math.max(0, Math.round(Number(bounds.y) || 0)),
    width: Math.max(1, Math.round(Number(bounds.width) || 1)),
    height: Math.max(1, Math.round(Number(bounds.height) || 1))
  };
  bangumiBrowserView.setBounds(nextBounds);
  return { ok: true };
});

ipcMain.handle("bangumiBrowser:navigate", (event, url) => {
  assertMainRenderer(event);
  const target = normalizeBangumiBrowserUrl(url);
  if (!target) throw new Error("只能在内置窗口中访问 Bangumi 网站");
  ensureBangumiBrowser().webContents.loadURL(target);
  return { ok: true };
});

ipcMain.handle("bangumiBrowser:control", (event, action) => {
  assertMainRenderer(event);
  const contents = bangumiBrowserView?.webContents;
  if (!contents || contents.isDestroyed()) return { ok: false };
  const history = contents.navigationHistory;
  if (action === "back" && history.canGoBack()) history.goBack();
  else if (action === "forward" && history.canGoForward()) history.goForward();
  else if (action === "reload") contents.reload();
  else if (action === "copyUrl" && isBangumiBrowserUrl(contents.getURL())) clipboard.writeText(contents.getURL());
  else if (action === "external" && isBangumiBrowserUrl(contents.getURL())) shell.openExternal(contents.getURL());
  sendBangumiBrowserState();
  return { ok: true };
});
ipcMain.handle("app:getStorageInfo", () => ensureAppStorage());
ipcMain.handle("covers:cleanUnused", () => cleanUnusedCovers());

ipcMain.handle("dialog:selectCover", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择封面图片",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return saveCover(result.filePaths[0]);
});

ipcMain.handle("dialog:selectCovers", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择人物图片",
    properties: ["openFile", "multiSelections"],
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "gif"] }]
  });
  return result.canceled ? [] : result.filePaths.map(saveCover);
});

ipcMain.handle("clipboard:pasteCover", (event) => {
  assertMainRenderer(event);
  const image = clipboard.readImage();
  if (image.isEmpty()) throw new Error("剪贴板里没有图片");
  const buffer = image.toPNG();
  if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error("图片不能超过 12 MB");
  const { coversPath } = ensureAppStorage();
  const imagePath = path.join(coversPath, `${Date.now()}-${crypto.randomUUID()}.png`);
  fs.writeFileSync(imagePath, buffer);
  return imagePath;
});

ipcMain.handle("shell:showPath", async (_event, targetPath) => {
  if (!targetPath) return;
  await shell.showItemInFolder(targetPath);
});

ipcMain.handle("notebook:list", (_event, options = {}) => {
  const requestedCategoryId = Math.max(0, Number(options.categoryId) || 0);
  const categories = selectRows([
    "SELECT c.id, c.name, c.order_index, c.created_at, c.updated_at,",
    "COUNT(n.id) AS note_count FROM notebook_categories c",
    "LEFT JOIN notebook_notes n ON n.category_id = c.id",
    "GROUP BY c.id ORDER BY c.order_index ASC, c.id ASC"
  ].join(" "));
  const categoryId = categories.some((item) => Number(item.id) === requestedCategoryId)
    ? requestedCategoryId
    : Number(categories[0]?.id || 0);
  const notes = categoryId ? selectRows([
    "SELECT id, category_id, title, content, created_at, updated_at",
    "FROM notebook_notes WHERE category_id = ?",
    "ORDER BY datetime(updated_at) DESC, id DESC"
  ].join(" "), [categoryId]).map((note) => ({
    ...note,
    images: selectRows("SELECT id, note_id, image_path, created_at FROM notebook_note_images WHERE note_id = ? ORDER BY id ASC", [note.id])
  })) : [];
  return { categories, categoryId, notes };
});

ipcMain.handle("notebook:createCategory", (_event, name) => {
  const nextName = String(name || "").trim().slice(0, 40);
  if (!nextName) throw new Error("请填写分类名称");
  const order = Number(selectOne("SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM notebook_categories")?.next_order || 0);
  db.run("INSERT INTO notebook_categories (name, order_index) VALUES (?, ?)", [nextName, order]);
  const created = selectOne("SELECT * FROM notebook_categories WHERE id = last_insert_rowid()");
  saveDatabase();
  return created;
});

ipcMain.handle("notebook:renameCategory", (_event, id, name) => {
  const categoryId = Math.max(0, Number(id) || 0);
  const nextName = String(name || "").trim().slice(0, 40);
  if (!categoryId || !nextName) throw new Error("分类名称不能为空");
  db.run("UPDATE notebook_categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [nextName, categoryId]);
  saveDatabase();
  return selectOne("SELECT * FROM notebook_categories WHERE id = ?", [categoryId]);
});

ipcMain.handle("notebook:deleteCategory", (_event, id) => {
  const categoryId = Math.max(0, Number(id) || 0);
  const categories = selectRows("SELECT id FROM notebook_categories ORDER BY order_index ASC, id ASC");
  if (categories.length <= 1) throw new Error("至少保留一个分类");
  if (!categories.some((item) => Number(item.id) === categoryId)) throw new Error("分类不存在");
  const fallbackId = Number(categories.find((item) => Number(item.id) !== categoryId).id);
  db.run("UPDATE notebook_notes SET category_id = ?, updated_at = CURRENT_TIMESTAMP WHERE category_id = ?", [fallbackId, categoryId]);
  db.run("DELETE FROM notebook_categories WHERE id = ?", [categoryId]);
  saveDatabase();
  return { ok: true, categoryId: fallbackId };
});

ipcMain.handle("notebook:createNote", (_event, categoryId) => {
  const targetCategoryId = Math.max(0, Number(categoryId) || 0);
  if (!selectOne("SELECT id FROM notebook_categories WHERE id = ?", [targetCategoryId])) throw new Error("分类不存在");
  db.run("INSERT INTO notebook_notes (category_id, title, content) VALUES (?, ?, '')", [targetCategoryId, "未命名笔记"]);
  const created = selectOne("SELECT * FROM notebook_notes WHERE id = last_insert_rowid()");
  saveDatabase();
  return created;
});

ipcMain.handle("notebook:updateNote", (_event, id, payload = {}) => {
  const noteId = Math.max(0, Number(id) || 0);
  const existing = selectOne("SELECT * FROM notebook_notes WHERE id = ?", [noteId]);
  if (!existing) throw new Error("笔记不存在");
  const categoryId = Math.max(0, Number(payload.category_id ?? existing.category_id) || 0);
  if (!selectOne("SELECT id FROM notebook_categories WHERE id = ?", [categoryId])) throw new Error("分类不存在");
  const title = String(payload.title ?? existing.title ?? "").trim().slice(0, 200) || "未命名笔记";
  const noteContent = String(payload.content ?? existing.content ?? "").slice(0, 200000);
  db.run("UPDATE notebook_notes SET category_id = ?, title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [categoryId, title, noteContent, noteId]);
  saveDatabase();
  return selectOne("SELECT * FROM notebook_notes WHERE id = ?", [noteId]);
});

ipcMain.handle("notebook:addImage", (_event, noteIdValue, dataUrl) => {
  const noteId = Math.max(0, Number(noteIdValue) || 0);
  if (!selectOne("SELECT id FROM notebook_notes WHERE id = ?", [noteId])) throw new Error("笔记不存在");
  const match = String(dataUrl || "").match(/^data:image\/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) throw new Error("只支持 PNG、JPEG、WebP 或 GIF 图片");
  const buffer = Buffer.from(match[2], "base64");
  if (!buffer.length || buffer.length > 12 * 1024 * 1024) throw new Error("单张图片不能超过 12 MB");
  const extension = match[1] === "jpeg" ? ".jpg" : `.${match[1]}`;
  const { notebookImagesPath } = ensureAppStorage();
  const imagePath = path.join(notebookImagesPath, `${Date.now()}-${crypto.randomUUID()}${extension}`);
  fs.writeFileSync(imagePath, buffer);
  db.run("INSERT INTO notebook_note_images (note_id, image_path) VALUES (?, ?)", [noteId, imagePath]);
  const created = selectOne("SELECT * FROM notebook_note_images WHERE id = last_insert_rowid()");
  saveDatabase();
  return created;
});

ipcMain.handle("notebook:deleteImage", (_event, imageIdValue) => {
  const imageId = Math.max(0, Number(imageIdValue) || 0);
  const image = selectOne("SELECT * FROM notebook_note_images WHERE id = ?", [imageId]);
  if (!image) return { ok: true };
  const { notebookImagesPath } = ensureAppStorage();
  if (image.image_path && isPathInside(notebookImagesPath, image.image_path) && fs.existsSync(image.image_path)) fs.unlinkSync(image.image_path);
  db.run("DELETE FROM notebook_note_images WHERE id = ?", [imageId]);
  saveDatabase();
  return { ok: true };
});

ipcMain.handle("notebook:deleteNote", (_event, id) => {
  const noteId = Math.max(0, Number(id) || 0);
  const images = selectRows("SELECT image_path FROM notebook_note_images WHERE note_id = ?", [noteId]);
  const { notebookImagesPath } = ensureAppStorage();
  for (const image of images) {
    if (image.image_path && isPathInside(notebookImagesPath, image.image_path) && fs.existsSync(image.image_path)) fs.unlinkSync(image.image_path);
  }
  db.run("DELETE FROM notebook_note_images WHERE note_id = ?", [noteId]);
  db.run("DELETE FROM notebook_notes WHERE id = ?", [noteId]);
  saveDatabase();
  return { ok: true };
});

ipcMain.handle("clipboard:writeText", (_event, value) => {
  clipboard.writeText(String(value || ""));
  return { ok: true };
});




ipcMain.handle("activity:list", (_event, options = {}) => {
  const pageSize = 20;
  const requestedPage = Math.max(1, Number(options.page) || 1);
  const total = Number(selectOne("SELECT COUNT(*) AS count FROM activity_logs")?.count || 0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(requestedPage, totalPages);
  const activities = selectRows(activitySelectSql() + " ORDER BY datetime(a.created_at) DESC, a.id DESC LIMIT ? OFFSET ?", [pageSize, (page - 1) * pageSize])
    .map(rowToActivity)
    .filter(Boolean);
  return { activities, pagination: { page, pageSize, total, totalPages } };
});

ipcMain.handle("activity:create", (_event, payload = {}) => {
  const next = normalizeActivity(payload);
  if (!next.note && !next.subject_title && !next.item_id) {
    throw new Error("请先写点内容，或者选择一个关联条目");
  }
  db.run([
    "INSERT INTO activity_logs (action, item_id, subject_title, progress_text, note)",
    "VALUES (@action, @item_id, @subject_title, @progress_text, @note)"
  ].join(" "), {
    "@action": next.action,
    "@item_id": next.item_id,
    "@subject_title": next.subject_title,
    "@progress_text": next.progress_text,
    "@note": next.note
  });
  const created = selectRows(activitySelectSql() + " WHERE a.id = last_insert_rowid()")[0];
  saveDatabase();
  return rowToActivity(created);
});

ipcMain.handle("activity:update", (_event, id, payload = {}) => {
  const existing = selectOne("SELECT * FROM activity_logs WHERE id = ?", [id]);
  if (!existing) throw new Error("Activity not found");
  const next = normalizeActivity(payload, existing);
  db.run([
    "UPDATE activity_logs SET",
    "action = @action, item_id = @item_id, subject_title = @subject_title,",
    "progress_text = @progress_text, note = @note, updated_at = CURRENT_TIMESTAMP",
    "WHERE id = @id"
  ].join(" "), {
    "@action": next.action,
    "@item_id": next.item_id,
    "@subject_title": next.subject_title,
    "@progress_text": next.progress_text,
    "@note": next.note,
    "@id": id
  });
  const updated = selectRows(activitySelectSql() + " WHERE a.id = ?", [id])[0];
  saveDatabase();
  return rowToActivity(updated);
});

ipcMain.handle("activity:delete", (_event, id) => {
  db.run("DELETE FROM activity_logs WHERE id = ?", [id]);
  saveDatabase();
  return { ok: true };
});

ipcMain.handle("items:list", (_event, filters = {}) => {
  const search = (filters.search || "").trim().toLowerCase();
  const sourceById = search && (!filters.item_type || filters.item_type === "all" || filters.item_type === "wife")
    ? new Map(selectRows("SELECT id, title, title_cn, original_title FROM items WHERE item_type != 'wife'").map((row) => [String(row.id), row]))
    : new Map();
  const clearedOnly = filters.status === "通关 🚩";
  const demoOnly = filters.status === "试玩版 🧪";
  const conditions = [];
  const params = [];
  if (filters.item_type && filters.item_type !== "all") { conditions.push("item_type = ?"); params.push(filters.item_type); }
  if (filters.status && !clearedOnly && !demoOnly) { conditions.push("status = ?"); params.push(filters.status); }
  if (filters.year) { conditions.push("year = ?"); params.push(filters.year); }
  if (filters.rating) {
    conditions.push(filters.rating === "__rated__" ? "TRIM(COALESCE(rating, '')) <> ''" : "rating = ?");
    if (filters.rating !== "__rated__") params.push(filters.rating);
  }
  const where = conditions.length ? ` WHERE ${conditions.join(" AND ")}` : "";
  return sortItems(selectRows(`SELECT * FROM items${where} ORDER BY id ASC`, params)
    .filter((item) => filters.show_dropped || !isHiddenByDroppedToggle(item))
    .map(rowToItem)
    .filter(Boolean)
    .filter((item) => !clearedOnly || /^(是|已通关|通关|true|1)/i.test(String(item.details?.cleared || "").trim()))
    .filter((item) => !demoOnly || /^(是|试玩版|试玩|true|1)/i.test(String(item.details?.demo || "").trim()))
    .filter((item) => !filters.region || item.details?.region === filters.region)
    .filter((item) => {
      if (!search) return true;
      if (item.item_type === "wife") {
        return wifeMatchesSearch(item, search, sourceById);
      }
      const detailValues = Object.values(item.details || {});
      return [
        item.item_type,
        item.title,
        item.title_cn,
        item.original_title,
        item.year,
        item.status,
        item.rating,
        item.bangumi_subject_id,
        item.bangumi_url,
        item.notes,
        ...detailValues
      ].some((value) => String(value || "").toLowerCase().includes(search));
    }));
});

ipcMain.handle("items:getByBangumiSubjectId", (_event, subjectId) => {
  const existing = findBangumiItem(selectOne, subjectId, "subject");
  return existing ? rowToItem(existing) : null;
});

ipcMain.handle("bangumi:import", async (_event, inputUrl) => {
  try {
    const imported = await importBangumiSubject(inputUrl, ensureAppStorage().coversPath, { accessToken: getOptionalBangumiAccessToken() });
    const existing = findBangumiItem(selectOne, imported.subjectId, "subject");
    return {
      ok: true,
      ...imported,
      existing: existing ? rowToItem(existing) : null
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Bangumi 导入失败，请稍后再试"
    };
  }
});


ipcMain.handle("bangumi:updateDraft", async (_event, input) => {
  try {
    const request = input && typeof input === "object" ? input : { input };
    const text = String(request.input || "").trim();
    const subjectUrl = /^\d+$/.test(text) ? `https://bgm.tv/subject/${text}` : text;
    const imported = await importBangumiSubject(subjectUrl, ensureAppStorage().coversPath, { preferredYear: request.preferredYear || "", accessToken: getOptionalBangumiAccessToken() });
    return {
      ok: true,
      ...imported
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Bangumi 更新失败，请稍后再试"
    };
  }
});

ipcMain.handle("bangumiSync:status", () => bangumiSyncStatus());

ipcMain.handle("bangumiSync:saveProxy", async (_event, input) => {
  const previous = getAppSetting("bangumi_proxy_url");
  try {
    const proxyUrl = normalizeBangumiProxy(input);
    await configureBangumiProxy(proxyUrl);
    if (proxyUrl) await testBangumiConnection();
    setAppSetting("bangumi_proxy_url", proxyUrl);
    saveDatabase();
    return { ok: true, status: bangumiSyncStatus() };
  } catch (error) {
    await configureBangumiProxy(previous).catch(() => {});
    return { ok: false, error: error.message || "代理连接测试失败" };
  }
});

ipcMain.handle("bangumiSync:saveToken", async (_event, accessToken) => {
  try {
    const token = String(accessToken || "").trim();
    if (!token) throw new Error("请输入 Bangumi Access Token");
    const account = await verifyBangumiAccessToken(token);
    if (!account.username) throw new Error("无法读取 Bangumi 账号信息，请检查 Access Token");
    saveBangumiAccessToken(token, account);
    saveDatabase();
    return { ok: true, status: bangumiSyncStatus() };
  } catch (error) {
    return { ok: false, error: error.message || "Bangumi Access Token 验证失败" };
  }
});

ipcMain.handle("bangumiSync:clearToken", () => {
  removeAppSetting("bangumi_access_token");
  removeAppSetting("bangumi_username");
  removeAppSetting("bangumi_nickname");
  saveDatabase();
  return bangumiSyncStatus();
});

ipcMain.handle("bangumiSync:pull", async (_event, itemType) => {
  try {
    return { ok: true, result: await pullBangumiCollections(itemType) };
  } catch (error) {
    return { ok: false, error: error.message || "从 Bangumi 拉取失败" };
  }
});

ipcMain.handle("bangumiSync:push", async (_event, itemType) => {
  try {
    return { ok: true, result: await pushBangumiCollections(itemType) };
  } catch (error) {
    return { ok: false, error: error.message || "同步到 Bangumi 失败" };
  }
});

function saveItemImages(payload) {
  if (payload.item_type !== "wife") {
    return {
      ...payload,
      cover_path: payload.coverSourcePath ? saveCover(payload.coverSourcePath) : payload.cover_path,
      coverSourcePath: ""
    };
  }
  const sourcePaths = Array.from(new Set((payload.gallerySourcePaths || []).filter(Boolean)));
  const savedBySource = new Map(sourcePaths.map((sourcePath) => [sourcePath, saveCover(sourcePath)]));
  let coverPath = payload.cover_path || "";
  if (payload.coverSourcePath) coverPath = savedBySource.get(payload.coverSourcePath) || saveCover(payload.coverSourcePath);
  const galleryPaths = Array.from(new Set([
    ...(Array.isArray(payload.galleryOrder) ? payload.galleryOrder.map((imagePath) => savedBySource.get(imagePath) || imagePath) : []),
    ...(Array.isArray(payload.details?.gallery_paths) ? payload.details.gallery_paths : []),
    ...savedBySource.values(),
    coverPath
  ].filter(Boolean)));
  return {
    ...payload,
    cover_path: coverPath,
    coverSourcePath: "",
    gallerySourcePaths: [],
    details: { ...payload.details, gallery_paths: galleryPaths }
  };
}

ipcMain.handle("items:create", (_event, payload) => {
  if (!["anime","manga","light_novel","game","online_game","movie","tv_drama","novel","published_book"].includes(payload.item_type)) throw new Error("不支持此条目分类");
  const next = normalizeItem(saveItemImages(payload));
  db.run(`
    INSERT INTO items (
      item_type, title, title_cn, original_title, year, status, rating,
      bangumi_subject_id, bangumi_url, cover_path, notes, details_json
    ) VALUES (
      @item_type, @title, @title_cn, @original_title, @year, @status, @rating,
      @bangumi_subject_id, @bangumi_url, @cover_path, @notes, @details_json
    )
  `, {
    "@item_type": next.item_type,
    "@title": next.title,
    "@title_cn": next.title_cn,
    "@original_title": next.original_title,
    "@year": next.year,
    "@status": next.status,
    "@rating": next.rating,
    "@bangumi_subject_id": next.bangumi_subject_id,
    "@bangumi_url": next.bangumi_url,
    "@cover_path": next.cover_path,
    "@notes": next.notes,
    "@details_json": next.details_json
  });
  const created = selectOne("SELECT * FROM items ORDER BY id DESC LIMIT 1");
  const item = rowToItem(created);
  if (!item) throw new Error("保存失败：没有找到新建记录");
  logItemCreated(item);
  saveDatabase();
  return item;
});

ipcMain.handle("items:update", (_event, id, payload) => {
  const existing = selectOne("SELECT * FROM items WHERE id = ?", [id]);
  if (!existing) throw new Error("Item not found");
  const beforeItem = rowToItem(existing);

  if (!["anime","manga","light_novel","game","online_game","movie","tv_drama","novel","published_book"].includes(payload.item_type)) throw new Error("不支持此条目分类");
  const next = normalizeItem(saveItemImages(payload));
  db.run(`
    UPDATE items SET
      item_type = @item_type,
      title = @title,
      title_cn = @title_cn,
      original_title = @original_title,
      year = @year,
      status = @status,
      rating = @rating,
      bangumi_subject_id = @bangumi_subject_id,
      bangumi_url = @bangumi_url,
      cover_path = @cover_path,
      notes = @notes,
      details_json = @details_json,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `, {
    "@item_type": next.item_type,
    "@title": next.title,
    "@title_cn": next.title_cn,
    "@original_title": next.original_title,
    "@year": next.year,
    "@status": next.status,
    "@rating": next.rating,
    "@bangumi_subject_id": next.bangumi_subject_id,
    "@bangumi_url": next.bangumi_url,
    "@cover_path": next.cover_path,
    "@notes": next.notes,
    "@details_json": next.details_json,
    "@id": id
  });
  const updated = selectOne("SELECT * FROM items WHERE id = ?", [id]);
  const item = rowToItem(updated);
  if (!item) throw new Error("保存失败：没有找到更新后的记录");
  logItemUpdated(beforeItem, item);
  saveDatabase();
  return item;
});

ipcMain.handle("items:delete", (_event, id) => {
  const existing = selectOne("SELECT * FROM items WHERE id = ?", [id]);
  if (!existing) return { ok: true };
  db.run("DELETE FROM items WHERE id = ?", [id]);
  saveDatabase();
  return { ok: true };
});




































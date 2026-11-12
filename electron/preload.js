const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("lifegumi", {
  toFileUrl: (targetPath) => targetPath ? `lifegumi-file://local/${encodeURIComponent(targetPath)}` : "",
  getStorageInfo: () => ipcRenderer.invoke("app:getStorageInfo"),
  selectCover: () => ipcRenderer.invoke("dialog:selectCover"),
  selectCovers: () => ipcRenderer.invoke("dialog:selectCovers"),
  pasteClipboardCover: () => ipcRenderer.invoke("clipboard:pasteCover"),
  showPath: (targetPath) => ipcRenderer.invoke("shell:showPath", targetPath),
  listItems: (filters) => ipcRenderer.invoke("items:list", filters),
  getItemByBangumiSubjectId: (subjectId) => ipcRenderer.invoke("items:getByBangumiSubjectId", subjectId),
  createItem: (payload) => ipcRenderer.invoke("items:create", payload),
  updateItem: (id, payload) => ipcRenderer.invoke("items:update", id, payload),
  deleteItem: (id) => ipcRenderer.invoke("items:delete", id),
  getImageUsage: (imagePath, excludingItemId) => ipcRenderer.invoke("images:usage", imagePath, excludingItemId),
  importBangumi: (inputUrl) => ipcRenderer.invoke("bangumi:import", inputUrl),
  updateFromBangumi: (input) => ipcRenderer.invoke("bangumi:updateDraft", input),
  getBangumiSyncStatus: () => ipcRenderer.invoke("bangumiSync:status"),
  saveBangumiProxy: (proxyUrl) => ipcRenderer.invoke("bangumiSync:saveProxy", proxyUrl),
  saveBangumiAccessToken: (token) => ipcRenderer.invoke("bangumiSync:saveToken", token),
  clearBangumiAccessToken: () => ipcRenderer.invoke("bangumiSync:clearToken"),
  pullBangumiSync: (itemType) => ipcRenderer.invoke("bangumiSync:pull", itemType),
  pushBangumiSync: (itemType) => ipcRenderer.invoke("bangumiSync:push", itemType),
  onBangumiSyncProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("bangumiSync:progress", listener);
    return () => ipcRenderer.removeListener("bangumiSync:progress", listener);
  },
  listActivities: (options) => ipcRenderer.invoke("activity:list", options),
  createActivity: (payload) => ipcRenderer.invoke("activity:create", payload),
  updateActivity: (id, payload) => ipcRenderer.invoke("activity:update", id, payload),
  deleteActivity: (id) => ipcRenderer.invoke("activity:delete", id),
  listNotebook: (options) => ipcRenderer.invoke("notebook:list", options),
  createNotebookCategory: (name) => ipcRenderer.invoke("notebook:createCategory", name),
  renameNotebookCategory: (id, name) => ipcRenderer.invoke("notebook:renameCategory", id, name),
  deleteNotebookCategory: (id) => ipcRenderer.invoke("notebook:deleteCategory", id),
  createNotebookNote: (categoryId) => ipcRenderer.invoke("notebook:createNote", categoryId),
  updateNotebookNote: (id, payload) => ipcRenderer.invoke("notebook:updateNote", id, payload),
  deleteNotebookNote: (id) => ipcRenderer.invoke("notebook:deleteNote", id),
  addNotebookImage: (noteId, dataUrl) => ipcRenderer.invoke("notebook:addImage", noteId, dataUrl),
  deleteNotebookImage: (imageId) => ipcRenderer.invoke("notebook:deleteImage", imageId),
  writeClipboardText: (value) => ipcRenderer.invoke("clipboard:writeText", value),
  showBangumiBrowser: () => ipcRenderer.invoke("bangumiBrowser:show"),
  hideBangumiBrowser: () => ipcRenderer.invoke("bangumiBrowser:hide"),
  closeBangumiBrowser: () => ipcRenderer.invoke("bangumiBrowser:close"),
  setBangumiBrowserBounds: (bounds) => ipcRenderer.invoke("bangumiBrowser:setBounds", bounds),
  navigateBangumiBrowser: (url) => ipcRenderer.invoke("bangumiBrowser:navigate", url),
  controlBangumiBrowser: (action) => ipcRenderer.invoke("bangumiBrowser:control", action),
  onBangumiBrowserState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on("bangumiBrowser:state", listener);
    return () => ipcRenderer.removeListener("bangumiBrowser:state", listener);
  },
  onBangumiBrowserImportSubject: (callback) => {
    const listener = (_event, url) => callback(url);
    ipcRenderer.on("bangumiBrowser:importSubject", listener);
    return () => ipcRenderer.removeListener("bangumiBrowser:importSubject", listener);
  }
});






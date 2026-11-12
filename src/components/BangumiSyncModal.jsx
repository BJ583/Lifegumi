import { useEffect, useState } from "react";
import { Download, KeyRound, RefreshCw, Trash2, Upload, X } from "lucide-react";

export function BangumiSyncModal({ open, initialType = "anime", onClose, onCompleted, onResult, showToast }) {
  const [missing, setMissing] = useState([]);
  const [checked, setChecked] = useState([]);
  const [status, setStatus] = useState(null);
  const [token, setToken] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null);
  const [syncType, setSyncType] = useState("anime");

  async function refreshStatus() {
    const next = await window.lifegumi.getBangumiSyncStatus();
    setStatus(next);
    setProxyUrl(next.proxyUrl || "");
  }

  useEffect(() => {
    if (!open) return;
    setSyncType(initialType);
    setError("");
    setToken("");
    setProgress(null);
    setMissing([]);
    setChecked([]);
    refreshStatus();
    return window.lifegumi.onBangumiSyncProgress((next) => setProgress(next));
  }, [open, initialType]);

  if (!open) return null;

  async function saveToken() {
    if (!token.trim() || busy) return;
    setBusy("token");
    setError("");
    const result = await window.lifegumi.saveBangumiAccessToken(token.trim());
    setBusy("");
    if (!result.ok) {
      setError(result.error || "Access Token 验证失败");
      return;
    }
    setToken("");
    setStatus(result.status);
    showToast("Bangumi 账号已连接");
  }

  async function clearToken() {
    if (busy || !confirm("确定断开当前 Bangumi 账号吗？本地记录不会删除。")) return;
    setBusy("clear");
    const next = await window.lifegumi.clearBangumiAccessToken();
    setStatus(next);
    setBusy("");
    showToast("已断开 Bangumi 账号");
  }

  async function saveProxy() {
    if (busy) return;
    setBusy("proxy");
    setError("");
    const result = await window.lifegumi.saveBangumiProxy(proxyUrl);
    setBusy("");
    if (!result.ok) {
      setError(result.error || "代理连接测试失败");
      return;
    }
    setStatus(result.status);
    setProxyUrl(result.status.proxyUrl || "");
    showToast(result.status.proxyUrl ? "Bangumi 代理已连接" : "已恢复系统网络设置");
  }

  async function runSync(direction) {
    if (busy) return;
    setMissing([]);
    setChecked([]);
    setBusy(direction);
    setError("");
    setProgress({ direction, current: 0, total: 0, title: "正在准备..." });
    const result = direction === "pull" ? await window.lifegumi.pullBangumiSync(syncType) : await window.lifegumi.pushBangumiSync(syncType);
    setBusy("");
    if (!result.ok) {
      setError(result.error || "同步失败");
      return;
    }
    if (direction === 'pull') setMissing(result.result.missing || []);
    await refreshStatus();
    await onCompleted();
    onResult?.({ ...result.result, direction, scope: syncType === "anime" ? "动画" : "游戏" });
  }

  async function deleteMissing() {
    if (busy || !checked.length || !confirm(`确定删除选中的 ${checked.length} 条本地记录吗？`)) return;
    setBusy("delete");
    setError("");
    try {
      for (const id of checked) {
        await window.lifegumi.deleteItem(id);
        setMissing((items) => items.filter((item) => item.id !== id));
        setChecked((ids) => ids.filter((value) => value !== id));
      }
      await onCompleted();
      showToast("选中的本地记录已删除");
    } catch (error) {
      setError(error.message || "删除失败");
    } finally {
      setBusy("");
    }
  }
  const configured = Boolean(status?.configured);
  const allMissingChecked = missing.length > 0 && checked.length === missing.length;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal sync-modal" role="dialog" aria-modal="true" aria-label="Bangumi 同步">
        <div className="modal-header">
          <div>
            <span>Bangumi Sync</span>
            <h2>手动双向同步</h2>
          </div>
          <button className="icon-button" onClick={onClose} disabled={Boolean(busy)}><X size={18} /></button>
        </div>

        <div className="sync-body">
          <div className="sync-scope">
            <span>同步范围</span>
            <strong>{syncType === "anime" ? "动画与动画集数进度" : "游戏、网游的状态、评分和发售日期"}</strong>
            <p>本地备注、封面、自定义分类和时光机不会上传或被覆盖。</p>
          </div>

          <div className="sync-proxy-box">
            <label htmlFor="bangumi-proxy-url">Bangumi 网络代理</label>
            <div className="sync-proxy-controls">
              <input id="bangumi-proxy-url" value={proxyUrl} onChange={(event) => setProxyUrl(event.target.value)} placeholder="127.0.0.1:7897" disabled={Boolean(busy)} />
              <button type="button" className="secondary-action" onClick={saveProxy} disabled={Boolean(busy) || proxyUrl === (status?.proxyUrl || "")}>{busy === "proxy" ? "测试中..." : "测试并保存"}</button>
            </div>
            <p>Clash Verge 的端口是 7897；留空保存可恢复系统网络设置。</p>
          </div>

          {!configured ? (
            <div className="sync-token-box">
              <label>
                <span>Bangumi Access Token</span>
                <input type="password" value={token} onChange={(event) => setToken(event.target.value)} placeholder="粘贴 Access Token" autoFocus disabled={Boolean(busy)} />
              </label>
              <p>Token 使用 Windows 本机加密保存，仅用于这台电脑的 Bangumi 同步。</p>
              <button className="primary-action" onClick={saveToken} disabled={!token.trim() || Boolean(busy)}><KeyRound size={17} />{busy === "token" ? "验证中..." : "保存并验证"}</button>
            </div>
          ) : (
            <>
              <div className="sync-account">
                <KeyRound size={19} />
                <div><span>已连接 Bangumi</span><strong>{status.nickname || status.username}</strong></div>
                <button className="secondary-action" onClick={clearToken} disabled={Boolean(busy)} title="断开账号"><Trash2 size={16} />断开</button>
              </div>
              <div className="sync-type-selector" role="group" aria-label="同步类型">
                <button className={syncType === "anime" ? "active" : ""} onClick={() => { setSyncType("anime"); setMissing([]); setChecked([]); }} disabled={Boolean(busy)}>动画</button>
                <button className={syncType === "game" ? "active" : ""} onClick={() => { setSyncType("game"); setMissing([]); setChecked([]); }} disabled={Boolean(busy)}>游戏</button>
              </div>
              <div className="sync-actions">
                <button className="sync-action pull" onClick={() => runSync("pull")} disabled={Boolean(busy)}>
                  <Download size={20} /><strong>从 Bangumi 拉取{syncType === "anime" ? "动画" : "游戏"}</strong><span>{syncType === "anime" ? "新建缺失动画，更新状态、评分和集数进度" : "同步游戏和网游，保持本地分类不变"}</span>
                </button>
                <button className="sync-action push" onClick={() => runSync("push")} disabled={Boolean(busy)}>
                  <Upload size={20} /><strong>同步{syncType === "anime" ? "动画" : "游戏"}到 Bangumi</strong><span>{syncType === "anime" ? "推送动画状态、评分与集数进度" : "推送游戏状态与评分"}</span>
                </button>
              </div>
              {busy ? (
                <div className="sync-progress" role="status">
                  <RefreshCw size={15} />
                  <span>{progress?.current ? `正在${progress.direction === "pull" ? "拉取" : "上传"} ${progress.current} / ${progress.total}` : "正在准备同步..."}</span>
                  {progress?.title && <strong>{progress.title}</strong>}
                </div>
              ) : <p className="sync-note"><RefreshCw size={14} />仅在你点击按钮时联网同步，不会后台自动请求。</p>}
            </>
          )}
          {missing.length > 0 && (
            <section className="sync-missing" aria-label="云端缺失项目">
              <div className="sync-missing-header">
                <div>
                  <h3>云端已无收藏 · {missing.length} 项</h3>
                  <p>以下项目有过同步记录。勾选后可删除本地记录，未勾选的保留。</p>
                </div>
                <button
                  type="button"
                  className="secondary-action sync-select-all"
                  disabled={Boolean(busy)}
                  onClick={() => setChecked(allMissingChecked ? [] : missing.map((item) => item.id))}
                >
                  {allMissingChecked ? "取消全选" : "全选"}
                </button>
              </div>
              <div className="sync-missing-list">
                {missing.map((item) => (
                  <label key={item.id} className={`sync-missing-item${checked.includes(item.id) ? " selected" : ""}`}>
                    <input type="checkbox" disabled={Boolean(busy)} checked={checked.includes(item.id)} onChange={(event) => setChecked((ids) => event.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id))} />
                    {item.cover_path && <img src={window.lifegumi.toFileUrl(item.cover_path)} alt="" />}
                    <span>{item.title_cn || item.title}<small>{{ anime: "动画", game: "游戏", online_game: "网游" }[item.item_type] || "游戏"} · {item.year || "未填写年份"}</small></span>
                  </label>
                ))}
              </div>
              <button className="secondary-action sync-delete-missing" disabled={Boolean(busy) || !checked.length} onClick={deleteMissing}><Trash2 size={17} />删除选中的 {checked.length} 条</button>
            </section>
          )}          {error && <p className="sync-error">{error}</p>}
        </div>
      </section>
    </div>
  );
}





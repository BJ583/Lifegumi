import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, Upload, X } from "lucide-react";

const MAX_VISIBLE_CHANGES = 160;

export function BangumiSyncResultModal({ result, onClose, onOpenItem, onRetry }) {
  useEffect(() => {
    if (!result) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [result, onClose]);

  if (!result) return null;

  const pulling = result.direction === "pull";
  const changes = Array.isArray(result.changes) ? result.changes : [];
  const created = changes.filter((entry) => entry.action === "created");
  const updated = changes.filter((entry) => entry.action === "updated");
  const pushed = changes.filter((entry) => entry.action === "pushed");
  const visibleGroups = pulling
    ? [["新增", created, Plus], ["更新", updated, RefreshCw]]
    : [["已上传", pushed, Upload]];
  const cards = pulling ? [
    ["新增", result.created || 0],
    ["更新", result.updated || 0],
    ["无变化", result.skipped || 0],
    ["失败", result.failed || 0]
  ] : [
    ["已上传", result.pushed || 0],
    ["无变化", result.skipped || 0],
    ["更新集数", result.episodes || 0],
    ["失败", result.failed || 0]
  ];

  return (
    <div className="modal-backdrop sync-result-backdrop" role="presentation">
      <section className="modal sync-result-modal" role="dialog" aria-modal="true" aria-label="Bangumi 同步结果">
        <div className="modal-header">
          <div>
            <span>Bangumi Sync</span>
            <h2>{result.scope || "Bangumi"}同步完成</h2>
          </div>
          <button className="icon-button" onClick={onClose} title="关闭" aria-label="关闭"><X size={18} /></button>
        </div>

        <div className="sync-result-body">
          <div className="sync-result-summary">
            {cards.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>

          {pulling && Number(result.missing?.length || 0) > 0 && (
            <div className="sync-result-notice"><AlertTriangle size={17} /><span>另有 {result.missing.length} 条本地记录已不在 Bangumi 收藏中，可在同步窗口里选择是否删除。</span></div>
          )}

          {changes.length === 0 && !(result.errors || []).length ? (
            <div className="sync-result-empty"><CheckCircle2 size={22} /><strong>本次没有资料变化</strong><span>本地与 Bangumi 已经一致。</span></div>
          ) : (
            <div className="sync-result-groups">
              {visibleGroups.map(([label, entries, Icon]) => entries.length > 0 && (
                <section className="sync-result-group" key={label}>
                  <header><Icon size={17} /><h3>{label}</h3><span>{entries.length}</span></header>
                  <div className="sync-result-list">
                    {entries.slice(0, MAX_VISIBLE_CHANGES).map((entry, index) => (
                      <div className="sync-result-entry" key={`${entry.action}-${entry.title}-${index}`}>
                        {entry.id ? <button type="button" className="sync-result-item-link" onClick={() => onOpenItem?.(entry)}>{entry.title}</button> : <strong>{entry.title}</strong>}
                        {entry.fields?.length > 0 && (
                          <div>{entry.fields.map((field) => <span key={field.key}>{field.key === "summary" ? "简介已更新" : `${field.label}：${field.before} → ${field.after}`}</span>)}</div>
                        )}
                      </div>
                    ))}
                    {entries.length > MAX_VISIBLE_CHANGES && <p className="sync-result-more">还有 {entries.length - MAX_VISIBLE_CHANGES} 条未展开显示</p>}
                  </div>
                </section>
              ))}

              {(result.errors || []).length > 0 && (
                <section className="sync-result-group error">
                  <header><AlertTriangle size={17} /><h3>失败</h3><span>{result.errors.length}</span></header>
                  <div className="sync-result-list">
                    {result.errors.slice(0, 40).map((entry, index) => <div className="sync-result-entry" key={`${entry.title}-${index}`}><strong>{entry.title}</strong><div><span>{entry.message}</span></div></div>)}
                  </div>
                </section>
              )}
            </div>
          )}
        </div>

        <div className="modal-actions sync-result-actions">
          {(result.errors || []).length > 0 && <button type="button" className="secondary-action" onClick={onRetry}><RefreshCw size={16} />重新同步</button>}
          <button className="primary-action" onClick={onClose}>知道了</button>
        </div>
      </section>
    </div>
  );
}

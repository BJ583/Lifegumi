import { AlertTriangle, Download, X } from "lucide-react";

export function BangumiImportModal({ open, url, loading, error, duplicate, onUrlChange, onClose, onImport, onViewExisting, onOverwrite }) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal import-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <span>Bangumi Import</span>
            <h2>从 Bangumi 导入</h2>
          </div>
          <button className="icon-button" onClick={onClose} disabled={loading}><X size={18} /></button>
        </div>

        <div className="import-body">
          <label className="field">
            <span>Bangumi 条目链接</span>
            <input
              value={url}
              onChange={(event) => onUrlChange(event.target.value)}
              placeholder="粘贴 bgm.tv 或 bangumi.tv 的 subject 链接"
              autoFocus
              disabled={loading}
            />
          </label>

          {error && (
            <div className="error-box">
              <AlertTriangle size={17} />
              <span>{error}</span>
            </div>
          )}

          {duplicate && (
            <div className="duplicate-box">
              <h3>这个 Bangumi 条目已经存在</h3>
              <p>「{duplicate.existing.title_cn || duplicate.existing.title}」已经保存过。你可以查看已有条目，或用 Bangumi 信息覆盖更新后继续编辑。</p>
              <div className="duplicate-actions">
                <button className="secondary-action" onClick={onViewExisting}>查看已有条目</button>
                <button className="primary-action" onClick={onOverwrite}>覆盖更新</button>
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button className="secondary-action" onClick={onClose} disabled={loading}>取消</button>
          <button className="primary-action" onClick={onImport} disabled={loading}>
            <Download size={17} />
            {loading ? "导入中..." : "导入"}
          </button>
        </div>
      </section>
    </div>
  );
}

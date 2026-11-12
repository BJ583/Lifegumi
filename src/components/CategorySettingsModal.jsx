import { RotateCcw, X } from "lucide-react";
import { defaultCategorySettings } from "../categorySettings";

export function CategorySettingsModal({ open, settings, onChange, onClose }) {
  if (!open) return null;

  function update(index, patch) {
    onChange(settings.map((item, currentIndex) => currentIndex === index ? { ...item, ...patch } : item));
  }

  function move(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= settings.length) return;
    const next = [...settings];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next.map((item, order) => ({ ...item, order })));
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal category-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <span>Category</span>
            <h2>管理大类</h2>
          </div>
          <button className="icon-button" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="category-manager">
          {settings.map((item, index) => (
            <div className="category-row" key={item.key}>
              <div className="category-move">
                <button onClick={() => move(index, -1)} disabled={index === 0}>上移</button>
                <button onClick={() => move(index, 1)} disabled={index === settings.length - 1}>下移</button>
              </div>
              <label className="field">
                <span>{item.key}</span>
                <input value={item.label} onChange={(event) => update(index, { label: event.target.value })} />
              </label>
              <label className="hide-toggle">
                <input type="checkbox" checked={!item.hidden} onChange={(event) => update(index, { hidden: !event.target.checked })} />
                <span>显示</span>
              </label>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="secondary-action" onClick={() => onChange(defaultCategorySettings())}>
            <RotateCcw size={16} />
            恢复默认
          </button>
          <button className="primary-action" onClick={onClose}>完成</button>
        </div>
      </section>
    </div>
  );
}

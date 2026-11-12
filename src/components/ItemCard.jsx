import { Pencil, Star, Trash2 } from "lucide-react";
import { CoverImage } from "./CoverImage";

function badgeClass(prefix, value) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
}

function statusTone(status) {
  if (!status) return "neutral";
  if (status.includes("二刷")) return "replay";
  if (status.includes("看完") || status.includes("玩过") || status.includes("已购买")) return "done";
  if (status.includes("追") || status.includes("在看") || status.includes("在玩")) return "active";
  if (status.includes("未购买")) return "unpurchased";
  if (status.includes("想")) return "planned";
  if (status.includes("搁置")) return "paused";
  if (status.includes("抛弃") || status.includes("放弃")) return "dropped";
  if (status.includes("云")) return "cloud";
  return "neutral";
}

export function ItemCard({ item, selected, typeLabel, draggable = false, dragging = false, onDragStart, onDragEnd, onDrop, onSelect, onTogglePin, onEdit, onDelete }) {
  const isWife = item.item_type === "wife";
  const displayTitle = item.title_cn || item.title;
  const originalTitle = item.title_cn ? (item.original_title || item.title) : item.original_title;
  const typeClass = `type-chip type-${badgeClass("type", item.item_type)}`;
  const statusClass = `status-pill status-${statusTone(item.status)}`;

  return (
    <article
      className={`item-card ${isWife ? "wife-card" : ""} ${selected ? "selected" : ""} ${dragging ? "dragging" : ""}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={(event) => { if (draggable) event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); onDrop?.(); }}
      onClick={() => onSelect(item)}
      onDoubleClick={() => onEdit(item)}
    >
      <div className="card-cover">
        <CoverImage path={item.cover_path} title={displayTitle} />
      </div>
      <div className="card-body">
        {!isWife && <div className="card-kicker">
          <span className={typeClass}>{typeLabel}</span>
          {item.status && <span className={statusClass}>{item.status}</span>}
        </div>}
        <h3>{displayTitle}</h3>
        {originalTitle && originalTitle !== displayTitle && <p>{originalTitle}</p>}
        {!isWife && <div className="meta-row">
          {item.year && <span>{item.year}</span>}
          {item.rating && <span className="rating">{item.rating}</span>}
        </div>}
      </div>
      <div className="card-actions">
        {isWife && <button className={`wife-pin-action ${item.details?.wife_pinned ? "active" : ""}`} title={item.details?.wife_pinned ? "取消置顶" : "收藏置顶"} onClick={(event) => { event.stopPropagation(); onTogglePin?.(item); }}><Star size={16} fill={item.details?.wife_pinned ? "currentColor" : "none"} /></button>}
        <button title="编辑" onClick={(event) => { event.stopPropagation(); onEdit(item); }}><Pencil size={16} /></button>
        <button title="删除" onClick={(event) => { event.stopPropagation(); onDelete(item); }}><Trash2 size={16} /></button>
      </div>
    </article>
  );
}




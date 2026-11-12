import { useEffect, useMemo, useRef, useState } from "react";
import { Sparkles } from "lucide-react";
import { ItemCard } from "./ItemCard";

import { buildGridEntries } from "../gridEntries";

export function ItemGrid({ items, selectedId, getTypeLabel, showYearSeparators = false, yearGroupMode = "year", reorderable = false, onReorder, onTogglePin, onSelect, onEdit, onDelete, onAdd }) {
  const [draggedId, setDraggedId] = useState(null);
  const [visibleCount, setVisibleCount] = useState(80);
  const loadMoreRef = useRef(null);
  const entries = useMemo(() => buildGridEntries(items, showYearSeparators, yearGroupMode), [items, showYearSeparators, yearGroupMode]);

  useEffect(() => { setVisibleCount(80); }, [items, showYearSeparators, yearGroupMode]);

  useEffect(() => {
    if (reorderable || visibleCount >= entries.length || !loadMoreRef.current) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setVisibleCount((count) => Math.min(entries.length, count + 80));
    }, { rootMargin: "600px" });
    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [entries.length, visibleCount, reorderable]);

  if (items.length === 0) {
    return (
      <section className="empty-state">
        <Sparkles size={34} />
        <h2>这里还没有记录</h2>
        <p>添加一条收藏，或者从 Bangumi 导入。</p>
        <button className="primary-action" onClick={onAdd}>添加第一条</button>
      </section>
    );
  }

  function dropOn(targetId) {
    if (!reorderable || draggedId === null || draggedId === targetId) return;
    const from = items.findIndex((item) => item.id === draggedId);
    const to = items.findIndex((item) => item.id === targetId);
    if (from < 0 || to < 0) return;
    const reordered = [...items];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    setDraggedId(null);
    onReorder?.(reordered);
  }

  return (
    <section className="card-grid">
      {(reorderable ? entries : entries.slice(0, visibleCount)).map((entry) => entry.kind === "year" ? (
        <div key={entry.key} className="year-divider">
          <span>{entry.year}</span>
          <i />
        </div>
      ) : (
        <ItemCard
          key={entry.item.id}
          item={entry.item}
          selected={selectedId === entry.item.id}
          typeLabel={getTypeLabel(entry.item.item_type)}
          onSelect={onSelect}
          onTogglePin={onTogglePin}
          onEdit={onEdit}
          onDelete={onDelete}
          draggable={reorderable}
          dragging={draggedId === entry.item.id}
          onDragStart={() => setDraggedId(entry.item.id)}
          onDragEnd={() => setDraggedId(null)}
          onDrop={() => dropOn(entry.item.id)}
        />
      ))}
      {!reorderable && visibleCount < entries.length && <div ref={loadMoreRef} className="card-grid-load-more" aria-hidden="true" />}
    </section>
  );
}




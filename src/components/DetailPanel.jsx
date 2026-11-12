import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Pencil, Trash2, X } from "lucide-react";
import { ITEM_SCHEMAS } from "../itemSchemas";
import { CoverImage } from "./CoverImage";

export function DetailPanel({ item, typeLabel, onEdit, onDelete, onAddWifeImage }) {
  const gallery = useMemo(() => Array.from(new Set([item?.cover_path, ...(item?.details?.gallery_paths || [])].filter(Boolean))), [item]);
  const [detailImage, setDetailImage] = useState("");
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const touchStartX = useRef(null);
  useEffect(() => {
    setDetailImage(item?.cover_path || gallery[0] || "");
    setGalleryOpen(false);
    setContextMenu(null);
  }, [item?.id]);
  useEffect(() => {
    if (!galleryOpen && !contextMenu) return;
    function onKeyDown(event) {
      if (event.key === "Escape") { setGalleryOpen(false); setContextMenu(null); }
      if (!galleryOpen || gallery.length < 2) return;
      if (event.key === "ArrowLeft") changeImage(-1);
      if (event.key === "ArrowRight") changeImage(1);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [galleryOpen, contextMenu, gallery, detailImage]);
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  function changeImage(step) {
    if (gallery.length < 2) return;
    const current = Math.max(0, gallery.indexOf(detailImage));
    setDetailImage(gallery[(current + step + gallery.length) % gallery.length]);
  }

  function showImageMenu(event) {
    if (item?.item_type !== "wife") return;
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  }

  async function pasteImage() {
    setContextMenu(null);
    const imagePath = await onAddWifeImage(item);
    if (imagePath) setDetailImage(imagePath);
  }

  function onTouchStart(event) { touchStartX.current = event.touches[0]?.clientX ?? null; }
  function onTouchEnd(event) {
    if (touchStartX.current === null) return;
    const distance = event.changedTouches[0]?.clientX - touchStartX.current;
    if (Math.abs(distance) > 40) changeImage(distance < 0 ? 1 : -1);
    touchStartX.current = null;
  }
  if (!item) {
    return (
      <aside className="detail-panel">
        <div className="detail-empty">
          <h2>详情</h2>
          <p>点击任意卡片后，这里会显示完整信息。</p>
        </div>
      </aside>
    );
  }

  const schema = ITEM_SCHEMAS[item.item_type];
  const detailFields = (schema?.fields || []).filter((field) => field.scope === "details");
  const displayTitle = item.title_cn || item.title;
  const originalTitle = item.title_cn ? (item.original_title || item.title) : item.original_title;

  return (
    <aside className={`detail-panel ${item.item_type === "wife" ? "wife-detail-panel" : ""}`}>
      <div className="detail-cover" onContextMenu={showImageMenu} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        {item.item_type === "wife" && (detailImage || item.cover_path) ? (
          <button type="button" className="wife-detail-main-image" onClick={() => setGalleryOpen(true)} title="展开图库"><CoverImage path={detailImage || item.cover_path} title={displayTitle} /></button>
        ) : <CoverImage path={detailImage || item.cover_path} title={displayTitle} />}
        {item.item_type === "wife" && gallery.length > 1 && (
          <>
            <button type="button" className="wife-detail-image-arrow previous" onClick={() => changeImage(-1)} aria-label="上一张" title="上一张"><ChevronLeft size={20} /></button>
            <button type="button" className="wife-detail-image-arrow next" onClick={() => changeImage(1)} aria-label="下一张" title="下一张"><ChevronRight size={20} /></button>
          </>
        )}
      </div>
      {item.item_type === "wife" && gallery.length > 1 && (
        <div className="wife-detail-gallery" onContextMenu={showImageMenu} onWheel={(event) => { if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) event.currentTarget.scrollLeft += event.deltaX; }}>
          {gallery.map((imagePath) => <button type="button" className={detailImage === imagePath ? "active" : ""} key={imagePath} onClick={() => setDetailImage(imagePath)}><CoverImage path={imagePath} title={displayTitle} /></button>)}
        </div>
      )}
      <div className="detail-heading">
        <div>
          <span className="type-chip">{typeLabel}</span>
          <h2>{displayTitle}</h2>
          {originalTitle && originalTitle !== displayTitle && <p>{originalTitle}</p>}
        </div>
        <div className="mini-actions">
          <button title="编辑" onClick={() => onEdit(item)}><Pencil size={16} /></button>
          <button title="删除" onClick={() => onDelete(item)}><Trash2 size={16} /></button>
        </div>
      </div>
      {contextMenu && createPortal(<div className="wife-detail-context-menu" style={{ left: Math.max(8, Math.min(contextMenu.x, window.innerWidth - 205)), top: Math.max(8, Math.min(contextMenu.y, window.innerHeight - 46)) }}><button type="button" onClick={pasteImage}><ImagePlus size={16} />从剪贴板添加图片</button></div>, document.body)}
      {galleryOpen && createPortal(
        <div className="wife-gallery-lightbox" role="dialog" aria-modal="true" aria-label={`${displayTitle}图片图库`} onClick={() => setGalleryOpen(false)}>
          <button type="button" className="wife-lightbox-close" onClick={() => setGalleryOpen(false)} title="关闭" aria-label="关闭"><X size={22} /></button>
          <div className="wife-lightbox-main" onClick={(event) => event.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
            {gallery.length > 1 && <button type="button" onClick={() => changeImage(-1)} title="上一张" aria-label="上一张"><ChevronLeft size={24} /></button>}
            <CoverImage path={detailImage || item.cover_path} title={displayTitle} />
            {gallery.length > 1 && <button type="button" onClick={() => changeImage(1)} title="下一张" aria-label="下一张"><ChevronRight size={24} /></button>}
          </div>
          <div className="wife-lightbox-thumbnails" onClick={(event) => event.stopPropagation()}>
            {gallery.map((imagePath) => <button type="button" key={imagePath} className={detailImage === imagePath ? "active" : ""} onClick={() => setDetailImage(imagePath)} title="查看图片"><CoverImage path={imagePath} title={displayTitle} /></button>)}
          </div>
          <span className="wife-lightbox-counter">{Math.max(1, gallery.indexOf(detailImage) + 1)} / {gallery.length}</span>
        </div>
      , document.body)}

      <div className="info-list">
        <Info label="年份" value={item.year} />
        <Info label="状态" value={item.status} pill />
        <Info label="评分" value={item.rating} />
        {detailFields.map((field) => field.type === "game_flags" ? (
          <Fragment key={field.key}>
            <Info label="云过" value={item.details?.cloud} />
            <Info label="通关" value={item.details?.cleared} />
            <Info label="试玩版" value={item.details?.demo} />
          </Fragment>
        ) : <Info key={field.key} label={field.label} value={field.type === "source" ? item.details?.source_title : field.key.includes("progress") && Number(item.details?.[field.key]) === 0 ? "" : item.details?.[field.key]} multiline={field.type === "textarea"} />)}
        <Info label={item.item_type === "wife" ? "Bangumi人物链接" : "资料/Bangumi链接"} value={item.bangumi_url} link />
        <Info label="备注" value={item.notes} multiline />
      </div>
    </aside>
  );
}

function Info({ label, value, link, pill, multiline }) {
  if (!value) return null;
  return (
    <div className={`info-row ${multiline ? "multiline" : ""}`}>
      <span>{label}</span>
      {link ? (
        <a href={value} target="_blank" rel="noreferrer">{value}<ExternalLink size={13} /></a>
      ) : pill ? (
        <strong className="status-pill">{value}</strong>
      ) : (
        <strong>{value}</strong>
      )}
    </div>
  );
}

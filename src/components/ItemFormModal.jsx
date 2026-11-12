import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Cloud, Flag, FlaskConical, HeartCrack, ImagePlus, RefreshCw, Search, Sparkles, Star, Trash2, X } from "lucide-react";
import { DEFAULT_STATUS, emptyItem, ITEM_SCHEMAS, itemToForm, STATUS_OPTIONS, TYPE_MAP, WIFE_SUPER_RATING, YEAR_ITEM_TYPES } from "../itemSchemas";
import { CoverImage } from "./CoverImage";

export function ItemFormModal({
  open,
  mode,
  item,
  initialForm,
  categories,
  yearOptions,
  sourceItems = [],
  saving,
  bangumiUpdating,
  onClose,
  onSave,
  onChooseCover,
  onAddYear,
  onBangumiUpdate,
}) {
  const [galleryMenu, setGalleryMenu] = useState(null);
  const [releaseDateFocusKey, setReleaseDateFocusKey] = useState(0);
  const baselineRef = useRef(null);
  const form = initialForm || (item ? itemToForm(item) : emptyItem("anime"));
  const dirty = open && baselineRef.current !== null && JSON.stringify(form) !== baselineRef.current;
  const savedGalleryPaths = Array.from(new Set([form.cover_path, ...(form.details?.gallery_paths || [])].filter(Boolean)));
  const allGalleryPaths = Array.from(new Set([...savedGalleryPaths, ...(form.gallerySourcePaths || [])]));
  const orderedGalleryPaths = Array.from(new Set([...(form.galleryOrder || []).filter((path) => allGalleryPaths.includes(path)), ...allGalleryPaths]));

  useEffect(() => {
    if (open) baselineRef.current = JSON.stringify(initialForm || (item ? itemToForm(item) : emptyItem("anime")));
    else baselineRef.current = null;
  }, [open, item?.id, mode]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || galleryMenu) return;
      event.preventDefault();
      requestClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dirty, galleryMenu, onClose]);

  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!galleryMenu) return;
    const close = () => setGalleryMenu(null);
    window.addEventListener("click", close);
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", close);
    };
  }, [galleryMenu]);

  if (!open) return null;

  function requestClose() {
    if (dirty && !window.confirm("有未保存的修改，确定放弃吗？")) return;
    onClose();
  }
  const schema = ITEM_SCHEMAS[form.item_type] || ITEM_SCHEMAS.anime;
  const visibleTypes = categories.filter((type) => type.key !== "all");
  const allowedTypes = form.bangumi_subject_id
    ? visibleTypes.filter((type) => type.key !== "wishlist")
    : visibleTypes;
  const canUpdateBangumi = mode === "edit" && Boolean(form.bangumi_subject_id || /^(https?:\/\/)?(bgm\.tv|bangumi\.tv)\/subject\/\d+/i.test(form.bangumi_url || ""));
  const disabled = saving || bangumiUpdating;

  function patchRoot(key, value) {
    if (key === "year") {
      const currentDate = String(form.details?.release_date || "");
      const dateMatch = currentDate.match(/^\d{4}-(\d{2})-(\d{2})$/);
      const nextDate = /^\d{4}$/.test(String(value)) && dateMatch
        ? `${value}-${dateMatch[1]}-${dateMatch[2]}`
        : currentDate;
      onSave({ ...form, year: value, details: { ...form.details, release_date: nextDate } }, false);
      if (/^\d{4}$/.test(String(value))) setReleaseDateFocusKey((current) => current + 1);
      return;
    }
    onSave({ ...form, [key]: value }, false);
  }

  function changeItemType(typeKey) {
    onSave({
      ...form,
      item_type: typeKey,
      status: DEFAULT_STATUS[typeKey] || form.status || "",
      year: YEAR_ITEM_TYPES.has(typeKey) ? (form.year || String(new Date().getFullYear())) : ""
    }, false);
  }

  function patchSource(sourceId) {
    const source = sourceItems.find((candidate) => String(candidate.id) === String(sourceId));
    const sourceDate = source
      ? (source.details?.release_date || source.details?.air_date || source.details?.public_test_date || source.year || "")
      : "";
    onSave({
      ...form,
      details: {
        ...form.details,
        source_item_id: sourceId || "",
        source_title: source ? (source.title_cn || source.title) : "",
        source_date: sourceDate,
        real_person_type: sourceId ? "" : (form.details?.real_person_type || "")
      }
    }, false);
  }
  function patchRealPersonType(value) {
    onSave({
      ...form,
      details: {
        ...form.details,
        real_person_type: value,
        ...(value ? { source_item_id: "", source_title: "", source_date: "" } : {})
      }
    }, false);
  }
  function patchDetail(key, value) {
    onSave({ ...form, details: { ...form.details, [key]: value } }, false);
  }

  async function handleCoverPick() {
    const picked = await onChooseCover();
    if (picked) patchRoot("coverSourcePath", picked);
  }

  async function addGalleryImages() {
    const picked = await window.lifegumi.selectCovers();
    if (!picked?.length) return;
    const gallerySourcePaths = Array.from(new Set([...(form.gallerySourcePaths || []), ...picked]));
    onSave({
      ...form,
      gallerySourcePaths,
      ...(!form.cover_path && !form.coverSourcePath ? { coverSourcePath: picked[0] } : {})
    }, false);
  }

  function showGalleryMenu(event) {
    if (disabled || form.item_type !== "wife") return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    setGalleryMenu({ x: Math.max(0, Math.min(event.clientX - bounds.left, bounds.width - 190)), y: event.clientY - bounds.top });
  }

  async function pasteGalleryImage() {
    setGalleryMenu(null);
    try {
      const imagePath = await window.lifegumi.pasteClipboardCover();
      const gallerySourcePaths = Array.from(new Set([...(form.gallerySourcePaths || []), imagePath]));
      onSave({
        ...form,
        gallerySourcePaths,
        ...(!form.cover_path && !form.coverSourcePath ? { coverSourcePath: imagePath } : {})
      }, false);
    } catch (error) {
      alert(error.message || "无法从剪贴板添加图片");
    }
  }

  function selectGalleryCover(imagePath, isNew) {
    onSave({ ...form, cover_path: isNew ? form.cover_path : imagePath, coverSourcePath: isNew ? imagePath : "" }, false);
  }

  function moveGalleryImage(fromPath, toPath) {
    if (!fromPath || fromPath === toPath) return;
    const nextOrder = [...orderedGalleryPaths];
    const from = nextOrder.indexOf(fromPath);
    const to = nextOrder.indexOf(toPath);
    if (from < 0 || to < 0) return;
    nextOrder.splice(from, 1);
    nextOrder.splice(to, 0, fromPath);
    onSave({ ...form, galleryOrder: nextOrder }, false);
  }

  async function removeGalleryImage(imagePath, isNew) {
    const usage = await window.lifegumi.getImageUsage(imagePath, item?.id);
    const message = usage.otherReferences > 0
      ? `还有 ${usage.otherReferences} 处其他引用使用这张图片。只从当前人物图库移除，其他记录不会受影响。继续吗？`
      : "只从当前人物图库移除。若保存后没有其他记录引用，这张图片可能在以后清理未使用图片时被删除。继续吗？";
    if (!window.confirm(message)) return;
    const galleryPaths = Array.isArray(form.details?.gallery_paths) ? form.details.gallery_paths : [];
    const next = isNew
      ? { ...form, gallerySourcePaths: (form.gallerySourcePaths || []).filter((entry) => entry !== imagePath) }
      : { ...form, details: { ...form.details, gallery_paths: galleryPaths.filter((entry) => entry !== imagePath) } };
    next.galleryOrder = orderedGalleryPaths.filter((path) => path !== imagePath);
    if ((isNew && form.coverSourcePath === imagePath) || (!isNew && !form.coverSourcePath && form.cover_path === imagePath)) {
      const fallback = next.galleryOrder[0];
      const fallbackIsNew = (form.gallerySourcePaths || []).includes(fallback) && !savedGalleryPaths.includes(fallback);
      next.cover_path = fallback && !fallbackIsNew ? fallback : "";
      next.coverSourcePath = fallbackIsNew ? fallback : "";
    }
    onSave(next, false);
  }

  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    await onSave(form, true);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal form-modal" role="dialog" aria-modal="true">
        <div className="modal-header">
          <div>
            <span>{mode === "edit" ? "编辑记录" : "新增记录"}</span>
            <h2>{form.title || form.title_cn || form.original_title || "未命名条目"}</h2>
          </div>
          <button className="icon-button" onClick={requestClose} disabled={disabled} title="关闭" aria-label="关闭"><X size={18} /></button>
        </div>

        <form onSubmit={submit} className="form-layout">
          <div className="form-cover">
            <CoverImage path={form.coverSourcePath || form.cover_path} title={form.title || form.title_cn || form.original_title} />
            <button type="button" onClick={handleCoverPick} disabled={disabled}>选择本地封面</button>
            {form.item_type === "wife" && (
              <div className="wife-gallery-editor" onContextMenu={showGalleryMenu}>
                <button type="button" onClick={addGalleryImages} disabled={disabled}><ImagePlus size={15} />添加更多图片</button>
                {galleryMenu && <div className="wife-gallery-context-menu" style={{ left: galleryMenu.x, top: galleryMenu.y }}><button type="button" onClick={pasteGalleryImage}><ImagePlus size={15} />从剪贴板添加图片</button></div>}
                <div className="wife-gallery-grid">
                  {orderedGalleryPaths.map((imagePath) => {
                    const isNew = (form.gallerySourcePaths || []).includes(imagePath) && !savedGalleryPaths.includes(imagePath);
                    return <GalleryImage key={imagePath} path={imagePath} active={isNew ? form.coverSourcePath === imagePath : !form.coverSourcePath && form.cover_path === imagePath} onCover={() => selectGalleryCover(imagePath, isNew)} onRemove={() => removeGalleryImage(imagePath, isNew)} onMove={moveGalleryImage} />;
                  })}
                </div>
              </div>
            )}
            <button
              type="button"
              className="bangumi-update-button"
              onClick={() => onBangumiUpdate(form)}
              disabled={!canUpdateBangumi || disabled}
              title={canUpdateBangumi ? "用 Bangumi 最新资料更新当前表单" : "需要 Bangumi Subject ID 或链接"}
            >
              <RefreshCw size={16} />
              {bangumiUpdating ? "更新中..." : "从 Bangumi 更新"}
            </button>
          </div>

          <div className={`form-fields ${form.item_type === "game" ? "game-form-fields" : ""}`}>
            <Field label="保存为" className={form.item_type === "game" ? "game-save-as-field" : ""}>
              <select value={form.item_type} onChange={(event) => changeItemType(event.target.value)} disabled={disabled}>
                {allowedTypes.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
              </select>
            </Field>

            <Field label={schema.titleLabel} className={form.item_type === "game" ? "game-title-field" : ""}>
              <input value={form.title} onChange={(event) => patchRoot("title", event.target.value)} required disabled={disabled} />
            </Field>

            {schema.fields.map((field) => (
              <SchemaField
                key={`${field.scope}-${field.key}`}
                field={field}
                value={field.type === "game_flags" ? form.details : field.scope === "details" ? form.details?.[field.key] : form[field.key]}
                itemType={form.item_type}
                linkedYear={form.year}
                releaseDateFocusKey={releaseDateFocusKey}
                yearOptions={yearOptions}
                sourceItems={sourceItems}
                disabled={disabled}
                onAddYear={onAddYear}
                onChange={(value) => field.type === "game_flags" ? onSave({ ...form, details: { ...form.details, ...value } }, false) : field.type === "source" ? patchSource(value) : field.key === "real_person_type" ? patchRealPersonType(value) : field.scope === "details" ? patchDetail(field.key, value) : patchRoot(field.key, value)}
              />
            ))}

            <div className="modal-actions">
              {dirty && <span className="form-unsaved-indicator">有未保存的修改</span>}
              <button type="button" className="secondary-action" onClick={requestClose} disabled={disabled}>取消</button>
              <button type="submit" className="primary-action" disabled={disabled}>{saving ? "保存中..." : mode === "edit" ? "保存修改" : "保存记录"}</button>
            </div>
          </div>
        </form>
      </section>
    </div>
  );
}

function GalleryImage({ path, active, onCover, onRemove, onMove }) {
  return (
    <div className={`wife-gallery-image ${active ? "active" : ""}`} draggable onDragStart={(event) => event.dataTransfer.setData("text/plain", path)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); onMove(event.dataTransfer.getData("text/plain"), path); }} title="拖动调整图片顺序">
      <CoverImage path={path} title="人物图片" />
      <button type="button" className="gallery-cover-button" onClick={onCover} title="设为封面" aria-label="设为封面"><Check size={13} /></button>
      <button type="button" className="gallery-remove-button" onClick={onRemove} title="移除图片" aria-label="移除图片"><Trash2 size={13} /></button>
    </div>
  );
}

function SchemaField({ field, value, itemType, linkedYear, releaseDateFocusKey, yearOptions, sourceItems, disabled, onAddYear, onChange }) {
  const [ratingPreview, setRatingPreview] = useState(null);
  if (field.type === "cover") return null;
  const options = field.optionsFromStatus ? STATUS_OPTIONS[itemType] || [] : field.options;

  if (field.type === "source") {
    return (
      <div className="field">
        <span>{field.label}</span>
        <SourcePicker key={value || "unbound"} value={value} sourceItems={sourceItems} disabled={disabled} onChange={onChange} />
      </div>
    );
  }
  if (field.type === "year") {
    function addAndSelectYear() {
      const currentYear = Number(value) || new Date().getFullYear();
      const nextYear = currentYear + 1;
      onAddYear(nextYear);
      onChange(String(nextYear));
    }

    return (
      <Field label={field.label}>
        <div className="year-control">
          <select value={value || ""} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
            <option value="">请选择</option>
            {yearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
          <button type="button" onClick={addAndSelectYear} disabled={disabled}>+1 年</button>
        </div>
      </Field>
    );
  }

  if (field.type === "game_flags") {
    const cloudActive = /^(是|云过|true|1)/i.test(String(value?.cloud || "").trim());
    const clearedActive = /^(是|已通关|通关|true|1)/i.test(String(value?.cleared || "").trim());
    const demoActive = /^(是|试玩版|试玩|true|1)/i.test(String(value?.demo || "").trim());
    return (
      <Field label={field.label} className="game-flags-field">
        <div className="game-flag-toggles">
          <button type="button" className={`field-toggle cloud-toggle ${cloudActive ? "active" : ""}`} aria-pressed={cloudActive} onClick={() => onChange({ cloud: cloudActive ? "" : "云过 ☁️" })} disabled={disabled} title={cloudActive ? "取消云过" : "标记云过"}>
            <Cloud size={17} /><span>云过</span>
          </button>
          <button type="button" className={`field-toggle cleared-toggle ${clearedActive ? "active" : ""}`} aria-label={clearedActive ? "取消通关" : "标记通关"} aria-pressed={clearedActive} onClick={() => onChange({ cleared: clearedActive ? "" : "已通关 ✅" })} disabled={disabled} title={clearedActive ? "取消通关" : "标记通关"}>
            <Flag size={18} /><span>通关</span>
          </button>
          <button type="button" className={`field-toggle demo-toggle ${demoActive ? "active" : ""}`} aria-label={demoActive ? "取消试玩版" : "标记试玩版"} aria-pressed={demoActive} onClick={() => onChange({ demo: demoActive ? "" : "试玩版 🧪" })} disabled={disabled} title={demoActive ? "取消试玩版" : "标记试玩版"}>
            <FlaskConical size={18} /><span>试玩版</span>
          </button>
        </div>
      </Field>
    );
  }

  if (field.type === "rating") {
    const current = String(value || "");
    const wifeRating = itemType === "wife";
    const superRated = wifeRating && current === WIFE_SUPER_RATING;
    const starCount = Array.from(current).filter((symbol) => symbol === "⭐").length;
    const disliked = current === "💔";
    const highlightedRating = ratingPreview === null ? (disliked ? 0 : (superRated ? 5 : starCount)) : Math.min(5, Math.max(0, ratingPreview));
    const highlightedDislike = ratingPreview === -1 || (ratingPreview === null && disliked);
    const highlightedSuper = ratingPreview === 6 || (ratingPreview === null && superRated);
    return (
      <Field label={field.label} className={wifeRating ? "wife-rating-field" : ""}>
        <div className={`rating-picker ${wifeRating ? "wife-rating-picker" : ""} ${ratingPreview === -1 ? "preview-dislike" : ""}`} role="group" aria-label="评分" onPointerLeave={() => setRatingPreview(null)}>
          {[1, 2, 3, 4, 5].map((count) => {
            const rating = "⭐".repeat(count);
            return <button type="button" key={count} className={highlightedRating >= count ? "active" : ""} aria-label={`${count} 星`} aria-pressed={current === rating} title={`${count} 星`} onPointerEnter={() => setRatingPreview(count)} onFocus={() => setRatingPreview(count)} onBlur={() => setRatingPreview(null)} onClick={() => onChange(current === rating ? "" : rating)} disabled={disabled}><Star size={19} fill="currentColor" /></button>;
          })}
          {wifeRating ? (
            <button type="button" className={`super-rating ${highlightedSuper ? "active" : ""}`} aria-label="超五星" aria-pressed={superRated} title="超五星" onPointerEnter={() => setRatingPreview(6)} onFocus={() => setRatingPreview(6)} onBlur={() => setRatingPreview(null)} onClick={() => onChange(superRated ? "" : WIFE_SUPER_RATING)} disabled={disabled}><Sparkles size={21} fill="currentColor" /></button>
          ) : (
            <button type="button" className={`dislike ${highlightedDislike ? "active" : ""}`} aria-label="不喜欢（碎心）" aria-pressed={disliked} title="不喜欢（碎心）" onPointerEnter={() => setRatingPreview(-1)} onFocus={() => setRatingPreview(-1)} onBlur={() => setRatingPreview(null)} onClick={() => onChange(disliked ? "" : "💔")} disabled={disabled}><HeartCrack size={20} strokeWidth={2.3} /></button>
          )}
        </div>
      </Field>
    );
  }

  if (field.type === "select") {
    return (
      <Field label={field.label}>
        <select value={value || ""} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          <option value="">请选择</option>
          {value && !options.includes(value) && <option value={value}>{value}（旧分类）</option>}
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </Field>
    );
  }

  if (field.type === "textarea") {
    return (
      <Field label={field.label}>
        <textarea value={value || ""} onChange={(event) => onChange(event.target.value)} rows="4" disabled={disabled} />
      </Field>
    );
  }

  if (field.type === "date" && field.key === "release_date") {
    return (
      <Field label={field.label}>
        <ReleaseDateInput value={value} linkedYear={linkedYear} focusKey={releaseDateFocusKey} disabled={disabled} onChange={onChange} />
      </Field>
    );
  }

  return (
    <Field label={field.label}>
      <input
        type={field.type === "date" ? "date" : "text"}
        min={field.type === "date" ? "0001-01-01" : undefined}
        max={field.type === "date" ? "9999-12-31" : undefined}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </Field>
  );
}

function ReleaseDateInput({ value, linkedYear, focusKey, disabled, onChange }) {
  const parsed = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const fixedYear = /^\d{4}$/.test(String(linkedYear || "")) ? String(linkedYear) : (parsed?.[1] || "");
  const [month, setMonth] = useState(parsed?.[2] || "");
  const [day, setDay] = useState(parsed?.[3] || "");
  const monthRef = useRef(null);
  const dayRef = useRef(null);

  useEffect(() => {
    const next = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    setMonth(next?.[2] || "");
    setDay(next?.[3] || "");
  }, [value]);

  useEffect(() => {
    if (!focusKey || !fixedYear) return;
    requestAnimationFrame(() => {
      monthRef.current?.focus();
      monthRef.current?.select();
    });
  }, [focusKey, fixedYear]);

  function commit(nextMonth, nextDay) {
    if (!fixedYear || !/^\d{1,2}$/.test(nextMonth) || !/^\d{1,2}$/.test(nextDay)) return;
    const numericMonth = Number(nextMonth);
    const numericDay = Number(nextDay);
    const maxDay = new Date(Number(fixedYear), numericMonth, 0).getDate();
    if (numericMonth < 1 || numericMonth > 12 || numericDay < 1 || numericDay > maxDay) return;
    onChange(`${fixedYear}-${String(numericMonth).padStart(2, "0")}-${String(numericDay).padStart(2, "0")}`);
  }

  function changeMonth(raw) {
    const next = raw.replace(/\D/g, "").slice(0, 2);
    setMonth(next);
    if (!next) {
      onChange("");
      return;
    }
    commit(next, day);
    if (next.length === 2 && Number(next) >= 1 && Number(next) <= 12) {
      requestAnimationFrame(() => {
        dayRef.current?.focus();
        dayRef.current?.select();
      });
    }
  }

  function changeDay(raw) {
    const next = raw.replace(/\D/g, "").slice(0, 2);
    setDay(next);
    if (!next) {
      onChange("");
      return;
    }
    commit(month, next);
  }

  if (!fixedYear) {
    return <input type="date" min="0001-01-01" max="9999-12-31" value={value || ""} onChange={(event) => onChange(event.target.value)} disabled={disabled} />;
  }

  return (
    <div className="linked-release-date">
      <span>{fixedYear}</span><i>/</i>
      <input ref={monthRef} inputMode="numeric" value={month} onChange={(event) => changeMonth(event.target.value)} onBlur={() => commit(month, day)} placeholder="月" aria-label="发售月份" disabled={disabled} /><i>/</i>
      <input ref={dayRef} inputMode="numeric" value={day} onChange={(event) => changeDay(event.target.value)} onBlur={() => commit(month, day)} placeholder="日" aria-label="发售日期" disabled={disabled} />
    </div>
  );
}

function SourcePicker({ value, sourceItems, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = sourceItems.find((source) => String(source.id) === String(value));
  const matches = useMemo(() => {
    const search = query.trim().toLowerCase();
    return sourceItems.filter((source) => {
      if (!search) return true;
      return [
        source.title,
        source.title_cn,
        source.original_title,
        source.year,
        TYPE_MAP[source.item_type]?.label,
        ...Object.values(source.details || {})
      ].some((part) => String(part || "").toLowerCase().includes(search));
    }).slice(0, 50);
  }, [query, sourceItems]);

  function choose(sourceId) {
    onChange(sourceId);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="source-picker">
      <button type="button" className="source-picker-trigger" onClick={() => setOpen((current) => !current)} disabled={disabled}>
        <span>{selected ? (selected.title_cn || selected.title) : "搜索并选择出处"}</span>
        <ChevronDown size={16} />
      </button>
      {open && (
        <div className="source-picker-popover">
          <label className="source-picker-search">
            <Search size={16} />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题、原文名、作者、分类或年份" />
            {query && <button type="button" onClick={() => setQuery("")} title="清空搜索"><X size={14} /></button>}
          </label>
          <div className="source-picker-results">
            {value && <button type="button" className="source-picker-clear" onClick={() => choose("")}>清除出处绑定</button>}
            {matches.map((source) => (
              <button type="button" key={source.id} className={String(source.id) === String(value) ? "selected" : ""} onClick={() => choose(String(source.id))}>
                <span>{source.title_cn || source.title}</span>
                <small>{TYPE_MAP[source.item_type]?.label || source.item_type}{source.year ? ` · ${source.year}` : ""}</small>
              </button>
            ))}
            {matches.length === 0 && <div className="source-picker-empty">没有匹配的记录</div>}
          </div>
        </div>
      )}
    </div>
  );
}
function Field({ label, children, className = "" }) {
  return (
    <label className={`field ${className}`}>
      <span>{label}</span>
      {children}
    </label>
  );
}

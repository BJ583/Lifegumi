import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronLeft, ChevronRight, Copy, FilePlus2, FolderPlus, Pencil, Trash2, X } from "lucide-react";

function formatUpdated(value) {
  const date = new Date(String(value || "").replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function LightNotebook({ showToast }) {
  const [categories, setCategories] = useState([]);
  const [activeCategoryId, setActiveCategoryId] = useState(0);
  const [notes, setNotes] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ title: "", content: "", category_id: 0 });
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [categoryEditor, setCategoryEditor] = useState(null);
  const [previewIndex, setPreviewIndex] = useState(null);

  async function load(categoryId = activeCategoryId, preferredNoteId = 0) {
    setLoading(true);
    const result = await window.lifegumi.listNotebook({ categoryId });
    const nextCategories = result.categories || [];
    const nextNotes = result.notes || [];
    setCategories(nextCategories);
    setActiveCategoryId(Number(result.categoryId || 0));
    setNotes(nextNotes);
    const nextSelected = nextNotes.find((note) => Number(note.id) === Number(preferredNoteId)) || nextNotes[0] || null;
    setSelected(nextSelected);
    setDraft(nextSelected ? { title: nextSelected.title || "", content: nextSelected.content || "", category_id: Number(nextSelected.category_id) } : { title: "", content: "", category_id: Number(result.categoryId || 0) });
    setDirty(false);
    setLoading(false);
  }

  useEffect(() => { load(0); }, []);

  useEffect(() => {
    setPreviewIndex(null);
  }, [selected?.id]);

  useEffect(() => {
    if (previewIndex === null) return undefined;
    const imageCount = selected?.images?.length || 0;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") setPreviewIndex(null);
      if (event.key === "ArrowLeft" && imageCount > 1) setPreviewIndex((current) => (current - 1 + imageCount) % imageCount);
      if (event.key === "ArrowRight" && imageCount > 1) setPreviewIndex((current) => (current + 1) % imageCount);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewIndex, selected?.images?.length]);

  function chooseNote(note) {
    if (dirty && !confirm("当前修改尚未保存，确定切换笔记吗？")) return;
    setSelected(note);
    setDraft({ title: note.title || "", content: note.content || "", category_id: Number(note.category_id) });
    setDirty(false);
  }

  async function chooseCategory(id) {
    if (Number(id) === activeCategoryId) return;
    if (dirty && !confirm("当前修改尚未保存，确定切换分类吗？")) return;
    await load(Number(id));
  }

  function startCreateCategory() {
    setCategoryEditor({ id: null, name: "" });
  }

  function startRenameCategory(category) {
    setCategoryEditor({ id: Number(category.id), name: category.name || "" });
  }

  async function saveCategory(event) {
    event.preventDefault();
    const name = String(categoryEditor?.name || "").trim();
    if (!name) return;
    try {
      if (categoryEditor.id) {
        await window.lifegumi.renameNotebookCategory(categoryEditor.id, name);
        setCategoryEditor(null);
        await load(activeCategoryId, selected?.id);
        showToast("分类已重命名");
      } else {
        const created = await window.lifegumi.createNotebookCategory(name);
        setCategoryEditor(null);
        await load(Number(created.id));
        showToast("分类已创建");
      }
    } catch (error) {
      showToast(error.message || "保存分类失败", "error");
    }
  }

  async function deleteCategory(category) {
    if (!confirm(`删除分类「${category.name}」吗？其中的笔记会移动到其他分类。`)) return;
    try {
      const result = await window.lifegumi.deleteNotebookCategory(category.id);
      await load(result.categoryId);
      showToast("分类已删除，笔记已保留");
    } catch (error) {
      showToast(error.message || "删除失败", "error");
    }
  }

  async function createNote() {
    if (!activeCategoryId) return;
    const created = await window.lifegumi.createNotebookNote(activeCategoryId);
    await load(activeCategoryId, created.id);
  }

  async function saveNote() {
    if (!selected) return;
    try {
      const updated = await window.lifegumi.updateNotebookNote(selected.id, draft);
      showToast("笔记已保存");
      await load(Number(updated.category_id), updated.id);
    } catch (error) {
      showToast(error.message || "保存失败", "error");
    }
  }

  async function deleteNote() {
    if (!selected || !confirm(`确定删除「${selected.title || "未命名笔记"}」吗？`)) return;
    await window.lifegumi.deleteNotebookNote(selected.id);
    showToast("笔记已删除");
    await load(activeCategoryId);
  }

  async function copyNote() {
    if (!selected) return;
    const text = [draft.title.trim(), draft.content].filter(Boolean).join("\n\n");
    await window.lifegumi.writeClipboardText(text);
    showToast("已复制整篇笔记");
  }

  function fileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(new Error("读取剪贴板图片失败"));
      reader.readAsDataURL(file);
    });
  }

  async function pasteImages(event) {
    const files = Array.from(event.clipboardData?.items || [])
      .filter((item) => item.kind === "file" && /^image\/(png|jpeg|webp|gif)$/.test(item.type))
      .map((item) => item.getAsFile())
      .filter(Boolean);
    if (!files.length) return;
    event.preventDefault();
    try {
      if (dirty) await window.lifegumi.updateNotebookNote(selected.id, draft);
      for (const file of files) {
        if (file.size > 12 * 1024 * 1024) throw new Error("单张图片不能超过 12 MB");
        await window.lifegumi.addNotebookImage(selected.id, await fileAsDataUrl(file));
      }
      await load(activeCategoryId, selected.id);
      showToast(files.length > 1 ? `已粘贴 ${files.length} 张图片` : "图片已粘贴");
    } catch (error) {
      showToast(error.message || "粘贴图片失败", "error");
    }
  }

  async function deleteImage(image) {
    if (!confirm("确定删除这张图片吗？")) return;
    try {
      if (dirty) await window.lifegumi.updateNotebookNote(selected.id, draft);
      await window.lifegumi.deleteNotebookImage(image.id);
      await load(activeCategoryId, selected.id);
      showToast("图片已删除");
    } catch (error) {
      showToast(error.message || "删除图片失败", "error");
    }
  }
  function changeDraft(patch) {
    setDraft((current) => ({ ...current, ...patch }));
    setDirty(true);
  }

  return (
    <section className="light-notebook-page" onKeyDown={(event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveNote();
      }
    }}>
      <aside className="notebook-categories">
        <header><div><h1>记事本</h1><span>{categories.reduce((sum, item) => sum + Number(item.note_count || 0), 0)} 篇</span></div><button onClick={startCreateCategory} title="新增分类"><FolderPlus size={17} /></button></header>
        {categoryEditor && (
          <form className="notebook-category-editor" onSubmit={saveCategory}>
            <input
              value={categoryEditor.name}
              onChange={(event) => setCategoryEditor((current) => ({ ...current, name: event.target.value }))}
              onKeyDown={(event) => { if (event.key === "Escape") setCategoryEditor(null); }}
              placeholder={categoryEditor.id ? "修改分类名称" : "新分类名称"}
              maxLength="40"
              autoFocus
            />
            <button type="submit" title="确认"><Check size={14} /></button>
            <button type="button" onClick={() => setCategoryEditor(null)} title="取消"><X size={14} /></button>
          </form>
        )}
        <div className="notebook-category-list">
          {categories.map((category) => (
            <div className={Number(category.id) === activeCategoryId ? "active" : ""} key={category.id}>
              <button className="notebook-category-name" onClick={() => chooseCategory(category.id)}><span>{category.name}</span><small>{category.note_count}</small></button>
              <button className="notebook-category-tool" onClick={() => startRenameCategory(category)} title="重命名"><Pencil size={13} /></button>
              <button className="notebook-category-tool" onClick={() => deleteCategory(category)} title="删除分类"><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      </aside>

      <section className="notebook-note-list">
        <header><strong>{categories.find((item) => Number(item.id) === activeCategoryId)?.name || "笔记"}</strong><button onClick={createNote} title="新增笔记"><FilePlus2 size={17} /></button></header>
        <div>
          {!loading && notes.length === 0 && <p className="notebook-empty">这个分类还没有笔记。</p>}
          {notes.map((note) => (
            <button className={selected?.id === note.id ? "active" : ""} key={note.id} onClick={() => chooseNote(note)}>
              <strong>{note.title || "未命名笔记"}</strong>
              <span>{String(note.content || "").replace(/\s+/g, " ").slice(0, 55) || "空白笔记"}</span>
              <small>{formatUpdated(note.updated_at)}</small>
            </button>
          ))}
        </div>
      </section>

      <main className="notebook-editor">
        {!selected ? <div className="notebook-editor-empty">选择或新建一篇笔记</div> : <>
          <header>
            <select value={draft.category_id} onChange={(event) => changeDraft({ category_id: Number(event.target.value) })} aria-label="笔记分类">
              {categories.map((category) => <option value={category.id} key={category.id}>{category.name}</option>)}
            </select>
            <span className={dirty ? "dirty" : ""}>{dirty ? "尚未保存" : "已保存"}</span>
            <button onClick={copyNote} title="复制整篇"><Copy size={16} /></button>
            <button onClick={deleteNote} title="删除笔记"><Trash2 size={16} /></button>
            <button className="notebook-save" onClick={saveNote} disabled={!dirty}><Check size={16} />保存</button>
          </header>
          <input className="notebook-title-input" value={draft.title} onChange={(event) => changeDraft({ title: event.target.value })} placeholder="笔记标题" />
          <div className="notebook-editor-body">
            <textarea className="notebook-content-input" value={draft.content} onChange={(event) => changeDraft({ content: event.target.value })} onPaste={pasteImages} placeholder="写点什么... 可直接粘贴图片" spellCheck="false" />
            {selected.images?.length > 0 && (
              <div className="notebook-images">
                {selected.images.map((image, index) => (
                  <figure key={image.id} onDoubleClick={() => setPreviewIndex(index)} title="双击查看原图">
                    <img src={window.lifegumi.toFileUrl(image.image_path)} alt="笔记图片" draggable="false" />
                    <button onClick={(event) => { event.stopPropagation(); deleteImage(image); }} title="删除图片"><X size={15} /></button>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </>}
      </main>
      {previewIndex !== null && selected?.images?.[previewIndex] && createPortal(
        <div className="notebook-image-lightbox" role="dialog" aria-modal="true" aria-label="笔记图片预览" onClick={() => setPreviewIndex(null)}>
          <button className="notebook-lightbox-close" onClick={() => setPreviewIndex(null)} title="关闭" aria-label="关闭"><X size={22} /></button>
          <div className="notebook-lightbox-main" onClick={(event) => event.stopPropagation()}>
            {selected.images.length > 1 && <button onClick={() => setPreviewIndex((previewIndex - 1 + selected.images.length) % selected.images.length)} title="上一张" aria-label="上一张"><ChevronLeft size={25} /></button>}
            <img src={window.lifegumi.toFileUrl(selected.images[previewIndex].image_path)} alt="笔记图片原图" />
            {selected.images.length > 1 && <button onClick={() => setPreviewIndex((previewIndex + 1) % selected.images.length)} title="下一张" aria-label="下一张"><ChevronRight size={25} /></button>}
          </div>
          <span className="notebook-lightbox-counter">{previewIndex + 1} / {selected.images.length}</span>
        </div>,
        document.body
      )}
    </section>
  );
}



import { useEffect, useMemo, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { CoverImage } from "./CoverImage";

function toNumber(value, fallback = 0) {
  const match = String(value || "").match(/\d+/);
  return match ? Number(match[0]) : fallback;
}

function displayTitle(item) {
  return item.title_cn || item.title;
}

export function ProgressTracker({ refreshKey, getTypeLabel, onEdit, showToast }) {
  const [animeItems, setAnimeItems] = useState([]);
  const [mangaItems, setMangaItems] = useState([]);
  const [lightNovelItems, setLightNovelItems] = useState([]);
  const [loading, setLoading] = useState(true);

  async function loadProgressItems() {
    setLoading(true);
    const [anime, manga, lightNovel] = await Promise.all([
      window.lifegumi.listItems({ item_type: "anime" }),
      window.lifegumi.listItems({ item_type: "manga" }),
      window.lifegumi.listItems({ item_type: "light_novel" })
    ]);
    setAnimeItems(anime.filter((item) => String(item.status || "").includes("追")));
    setMangaItems(manga.filter((item) => String(item.status || "").includes("追")));
    setLightNovelItems(lightNovel.filter((item) => String(item.status || "").includes("在看")));
    setLoading(false);
  }

  useEffect(() => {
    loadProgressItems();
  }, [refreshKey]);

  async function updateItem(item, detailsPatch) {
    const next = {
      ...item,
      details: {
        ...(item.details || {}),
        ...detailsPatch
      }
    };
    await window.lifegumi.updateItem(item.id, next);
    await loadProgressItems();
    showToast("进度已更新");
  }

  const totalCount = useMemo(
    () => animeItems.length + mangaItems.length + lightNovelItems.length,
    [animeItems, mangaItems, lightNovelItems]
  );

  return (
    <section className="progress-page">
      <header className="progress-header">
        <div>
          <h1>追更进度</h1>
          <p>{loading ? "正在读取..." : `${totalCount} 个在追条目`}</p>
        </div>
      </header>

      <div className="progress-sections">
        <ProgressSection title="动画" count={animeItems.length}>
          {animeItems.map((item) => (
            <AnimeProgressRow key={item.id} item={item} typeLabel={getTypeLabel(item.item_type)} onEdit={onEdit} onUpdate={updateItem} />
          ))}
        </ProgressSection>

        <ProgressSection title="漫画" count={mangaItems.length}>
          {mangaItems.map((item) => (
            <MangaProgressRow key={item.id} item={item} typeLabel={getTypeLabel(item.item_type)} onEdit={onEdit} onUpdate={updateItem} />
          ))}
        </ProgressSection>

        <ProgressSection title="轻小说" count={lightNovelItems.length}>
          {lightNovelItems.map((item) => (
            <LightNovelProgressRow key={item.id} item={item} typeLabel={getTypeLabel(item.item_type)} onEdit={onEdit} onUpdate={updateItem} />
          ))}
        </ProgressSection>
      </div>
    </section>
  );
}

function ProgressSection({ title, count, children }) {
  return (
    <section className="progress-section">
      <div className="progress-section-title">
        <h2>{title}</h2>
        <span>{count}</span>
      </div>
      <div className="progress-list">
        {count === 0 ? <div className="progress-empty">没有正在追的{title}</div> : children}
      </div>
    </section>
  );
}

function AnimeProgressRow({ item, typeLabel, onEdit, onUpdate }) {
  const details = item.details || {};
  const progressValue = Number(details.progress) === 0 ? "" : details.progress ?? "";
  const current = toNumber(progressValue, 0);
  const total = toNumber(details.total_episodes, 12) || 12;

  function setCurrent(value) {
    onUpdate(item, { progress: value === "" ? "" : String(Math.max(0, Number(value) || 0)), total_episodes: String(total) });
  }

  function setTotal(value) {
    onUpdate(item, { progress: progressValue === "" ? "" : String(current), total_episodes: String(Math.max(1, Number(value) || 12)) });
  }

  return (
    <article className="progress-row">
      <div className="progress-cover"><CoverImage path={item.cover_path} title={displayTitle(item)} /></div>
      <div className="progress-main">
        <div className="progress-title-line">
          <span className="type-chip type-anime">{typeLabel}</span>
          <strong>{displayTitle(item)}</strong>
          <button className="progress-edit" onClick={() => onEdit(item)}><Pencil size={14} />编辑</button>
        </div>
        <div className="progress-controls">
          <label>
            <span>当前集</span>
            <input value={progressValue} onChange={(event) => setCurrent(event.target.value)} />
          </label>
          <span className="progress-slash">/</span>
          <label>
            <span>总集数</span>
            <input value={total} onChange={(event) => setTotal(event.target.value)} />
          </label>
          <button className="quick-plus" onClick={() => onUpdate(item, { progress: String(current + 1), total_episodes: String(total) })}>
            <Plus size={15} />集数 +1
          </button>
        </div>
        <EpisodeButtons current={current} total={total} onJump={(episode) => onUpdate(item, { progress: String(episode), total_episodes: String(total) })} />
      </div>
    </article>
  );
}

function MangaProgressRow({ item, typeLabel, onEdit, onUpdate }) {
  const details = item.details || {};
  const currentVolume = toNumber(details.current_volume, 0);
  const totalVolumes = toNumber(details.total_volumes, 0);
  const currentChapter = toNumber(details.current_chapter || details.progress_chapters, 0);
  const totalChapters = toNumber(details.total_chapters, 0);

  function patch(nextPatch) {
    onUpdate(item, {
      current_volume: String(currentVolume),
      total_volumes: totalVolumes ? String(totalVolumes) : "",
      current_chapter: String(currentChapter),
      progress_chapters: String(currentChapter),
      total_chapters: totalChapters ? String(totalChapters) : "",
      ...nextPatch
    });
  }

  return (
    <article className="progress-row">
      <div className="progress-cover"><CoverImage path={item.cover_path} title={displayTitle(item)} /></div>
      <div className="progress-main">
        <div className="progress-title-line">
          <span className="type-chip type-manga">{typeLabel}</span>
          <strong>{displayTitle(item)}</strong>
          <button className="progress-edit" onClick={() => onEdit(item)}><Pencil size={14} />编辑</button>
        </div>
        <div className="manga-progress-grid">
          <ProgressNumber label="卷" current={Number(details.current_volume) === 0 ? "" : details.current_volume ?? ""} total={totalVolumes} onCurrent={(value) => patch({ current_volume: String(value) })} onTotal={(value) => patch({ total_volumes: String(value) })} onPlus={() => patch({ current_volume: String(currentVolume + 1) })} />
          <ProgressNumber label="话" current={Number(details.current_chapter ?? details.progress_chapters) === 0 ? "" : details.current_chapter ?? details.progress_chapters ?? ""} total={totalChapters} onCurrent={(value) => patch({ current_chapter: String(value), progress_chapters: String(value) })} onTotal={(value) => patch({ total_chapters: String(value) })} onPlus={() => patch({ current_chapter: String(currentChapter + 1), progress_chapters: String(currentChapter + 1) })} />
        </div>
      </div>
    </article>
  );
}

function LightNovelProgressRow({ item, typeLabel, onEdit, onUpdate }) {
  const details = item.details || {};
  const currentVolume = toNumber(details.current_volume || details.progress, 0);
  const totalVolumes = toNumber(details.total_volumes, 0);

  function patch(nextPatch) {
    onUpdate(item, {
      current_volume: String(currentVolume),
      progress: String(currentVolume),
      total_volumes: totalVolumes ? String(totalVolumes) : "",
      ...nextPatch
    });
  }

  return (
    <article className="progress-row">
      <div className="progress-cover"><CoverImage path={item.cover_path} title={displayTitle(item)} /></div>
      <div className="progress-main">
        <div className="progress-title-line">
          <span className="type-chip type-light_novel">{typeLabel}</span>
          <strong>{displayTitle(item)}</strong>
          <button className="progress-edit" onClick={() => onEdit(item)}><Pencil size={14} />编辑</button>
        </div>
        <div className="manga-progress-grid">
          <ProgressNumber
            label="卷"
            current={Number(details.current_volume ?? details.progress) === 0 ? "" : details.current_volume ?? details.progress ?? ""}
            total={totalVolumes}
            onCurrent={(value) => patch({ current_volume: String(value), progress: String(value) })}
            onTotal={(value) => patch({ total_volumes: String(value) })}
            onPlus={() => patch({ current_volume: String(currentVolume + 1), progress: String(currentVolume + 1) })}
          />
        </div>
      </div>
    </article>
  );
}

function ProgressNumber({ label, current, total, onCurrent, onTotal, onPlus }) {
  return (
    <div className="progress-number">
      <span>{label}</span>
      <input value={current} onChange={(event) => onCurrent(event.target.value === "" ? "" : Number(event.target.value) || 0)} />
      <em>/</em>
      <input value={total || ""} placeholder="??" onChange={(event) => onTotal(Number(event.target.value) || 0)} />
      <button onClick={onPlus}><Plus size={14} /></button>
    </div>
  );
}

function EpisodeButtons({ current, total, onJump }) {
  return (
    <div className="episode-buttons">
      {Array.from({ length: Math.max(0, total) }, (_, index) => {
        const episode = index + 1;
        return (
          <button key={episode} className={episode <= current ? "watched" : ""} onClick={() => onJump(episode)}>
            {String(episode).padStart(2, "0")}
          </button>
        );
      })}
    </div>
  );
}

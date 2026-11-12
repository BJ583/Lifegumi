import { useEffect, useMemo, useState } from "react";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { CoverImage } from "./CoverImage";
import { Pagination } from "./Pagination";

function titleFor(item) {
  return item?.title_cn || item?.title || item?.original_title || "未命名";
}

function parseTime(value) {
  if (!value) return new Date();
  return new Date(String(value).replace(" ", "T") + "Z");
}

function dateKey(value) {
  return String(value || "").slice(0, 10) || "未知日期";
}

function dateLabel(key) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().slice(0, 10);
  if (key === todayKey) return "今天";
  if (key === yesterdayKey) return "昨天";
  return key;
}

function relativeTime(value) {
  const diff = Date.now() - parseTime(value).getTime();
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

function groupActivities(activities) {
  return activities.reduce((groups, activity) => {
    const key = dateKey(activity.created_at);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(activity);
    return groups;
  }, new Map());
}

export function TimeMachine({ getTypeLabel, onEdit, showToast }) {
  const [activities, setActivities] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [activeId, setActiveId] = useState(null);

  async function loadActivities(nextPage = page) {
    setLoading(true);
    const result = await window.lifegumi.listActivities({ page: nextPage });
    setActivities(result.activities || []);
    setPagination(result.pagination || { page: 1, pageSize: 20, total: 0, totalPages: 1 });
    if (result.pagination?.page && result.pagination.page !== nextPage) setPage(result.pagination.page);
    setLoading(false);
  }

  useEffect(() => {
    loadActivities(page);
  }, [page]);

  const grouped = useMemo(() => Array.from(groupActivities(activities).entries()), [activities]);

  async function saveEdit(activity, nextNote) {
    const updated = await window.lifegumi.updateActivity(activity.id, { ...activity, note: nextNote });
    setActivities((current) => current.map((item) => item.id === updated.id ? updated : item));
    setEditing(null);
    setActiveId(updated.id);
    showToast("备注已保存");
  }

  async function deleteActivity(activity) {
    if (!confirm("确定删除这条时光机记录吗？")) return;
    await window.lifegumi.deleteActivity(activity.id);
    setActivities((current) => current.filter((item) => item.id !== activity.id));
    if (activeId === activity.id) setActiveId(null);
    showToast("记录已删除");
  }

  return (
    <section className="time-page">
      <header className="time-header">
        <div>
          <h1>时光机</h1>
          <p>{loading ? "正在读取..." : `${pagination.total} 条自动活动记录`}</p>
        </div>
      </header>

      <section className="time-feed">
        {grouped.length === 0 && !loading ? (
          <div className="time-empty">还没有记录。去添加条目、改状态，或者在追更进度里 +1 集，这里会自动出现。</div>
        ) : grouped.map(([key, group]) => (
          <section className="time-day" key={key}>
            <h2>{dateLabel(key)}</h2>
            <div className="time-day-list">
              {group.map((activity) => (
                <ActivityCard
                  key={activity.id}
                  activity={activity}
                  active={activeId === activity.id}
                  editing={editing}
                  setEditing={setEditing}
                  onActivate={() => setActiveId(activity.id)}
                  getTypeLabel={getTypeLabel}
                  onEditItem={onEdit}
                  onSave={saveEdit}
                  onDelete={deleteActivity}
                />
              ))}
            </div>
          </section>
        ))}
      </section>
      <Pagination page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} onChange={setPage} />
    </section>
  );
}

function ActivityCard({ activity, active, editing, setEditing, onActivate, getTypeLabel, onEditItem, onSave, onDelete }) {
  const item = activity.item;
  const title = item ? titleFor(item) : activity.subject_title;
  const [draft, setDraft] = useState(activity.note || "");
  const isEditing = editing === activity.id;

  useEffect(() => {
    if (isEditing) setDraft(activity.note || "");
  }, [activity.note, isEditing]);

  return (
    <article className={`time-card ${active ? "active" : ""}`} onClick={onActivate}>
      <div className="time-avatar">L</div>
      <div className="time-card-main">
        <div className="time-line-text">
          <strong>我</strong>
          <span className={`time-action action-${activity.action}`}>{activity.action}</span>
          {title && (
            item ? <button className="time-title-button" onClick={(event) => { event.stopPropagation(); onEditItem(item); }}>{title}</button> : <em>{title}</em>
          )}
          {activity.progress_text && <span className="time-progress-text">{activity.progress_text}</span>}
        </div>

        {(item || activity.note || isEditing) && (
          <div className="time-note-card">
            {item && <div className="time-note-cover"><CoverImage path={item.cover_path} title={title} /></div>}
            <div className="time-note-body">
              {item && (
                <div className="time-note-meta">
                  <span>{getTypeLabel(item.item_type)}</span>
                  {item.year && <span>{item.year}</span>}
                  {item.rating && <span>{item.rating}</span>}
                </div>
              )}
              {isEditing ? (
                <div className="time-edit-box" onClick={(event) => event.stopPropagation()}>
                  <textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="补几句感想..." />
                  <div>
                    <button onClick={() => onSave(activity, draft)}><Check size={15} />保存</button>
                    <button onClick={() => setEditing(null)}><X size={15} />取消</button>
                  </div>
                </div>
              ) : activity.note ? <p>{activity.note}</p> : active ? <p className="time-muted">点击“备注”补几句感想</p> : null}
            </div>
          </div>
        )}

        <div className="time-card-footer">
          <span>{relativeTime(activity.created_at)}</span>
          {active && !isEditing && (
            <>
              <button onClick={(event) => { event.stopPropagation(); setEditing(activity.id); }}><Pencil size={14} />备注</button>
              <button onClick={(event) => { event.stopPropagation(); onDelete(activity); }}><Trash2 size={14} />删除</button>
            </>
          )}
        </div>
      </div>
    </article>
  );
}

import { Settings2 } from "lucide-react";
import { TYPE_MAP } from "../itemSchemas";

export function Sidebar({ activeType, categories, onTypeChange, onManageCategories, storageInfo }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">L</div>
        <div>
          <strong>Lifegumi</strong>
          <span>Local Library</span>
        </div>
      </div>

      <nav className="type-list">
        {categories.map((category) => {
          const Icon = TYPE_MAP[category.key]?.icon;
          return (
            <button key={category.key} className={activeType === category.key ? "active" : ""} onClick={() => onTypeChange(category.key)}>
              {Icon && <Icon size={18} />}
              <span>{category.label}</span>
            </button>
          );
        })}

      </nav>

      <button className="manage-category-button" onClick={onManageCategories}>
        <Settings2 size={17} />
        <span>管理大类</span>
      </button>

      {storageInfo && (
        <div className="storage-card">
          <span>数据保存在本机</span>
          <button onClick={() => window.lifegumi.showPath(storageInfo.databasePath)}>打开数据库位置</button>
        </div>
      )}
    </aside>
  );
}



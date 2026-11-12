// Run before and after seed loading: a seed may have an older schema.
function ensureDatabaseSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_type TEXT NOT NULL,
      title TEXT NOT NULL,
      title_cn TEXT,
      original_title TEXT,
      year TEXT,
      status TEXT,
      rating TEXT,
      bangumi_subject_id TEXT,
      bangumi_url TEXT,
      cover_path TEXT,
      notes TEXT,
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_items_type ON items(item_type);
    CREATE INDEX IF NOT EXISTS idx_items_status ON items(status);
    CREATE INDEX IF NOT EXISTS idx_items_year ON items(year);
    CREATE INDEX IF NOT EXISTS idx_items_rating ON items(rating);
    CREATE INDEX IF NOT EXISTS idx_items_bangumi_subject_id ON items(bangumi_subject_id);

    CREATE TABLE IF NOT EXISTS activity_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL DEFAULT '记录',
      item_id INTEGER,
      subject_title TEXT,
      progress_text TEXT,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_activity_logs_item_id ON activity_logs(item_id);

    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS bangumi_sync_state (
      item_id INTEGER PRIMARY KEY,
      collection_signature TEXT NOT NULL DEFAULT '',
      episode_progress TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
module.exports = { ensureDatabaseSchema };

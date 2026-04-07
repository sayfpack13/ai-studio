import Database from "better-sqlite3";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, "..", "data");

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = join(DATA_DIR, "assets.db");

// Create or open database
const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma("journal_mode = WAL");

// Create tables
db.exec(`
  -- Assets table for storing metadata
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL DEFAULT 'project',
    source TEXT NOT NULL DEFAULT 'pipeline',
    title TEXT,
    url TEXT,
    file_path TEXT,
    metadata TEXT DEFAULT '{}',
    tags TEXT DEFAULT '[]',
    folder_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  -- Index for faster queries
  CREATE INDEX IF NOT EXISTS idx_assets_type ON assets(type);
  CREATE INDEX IF NOT EXISTS idx_assets_created_at ON assets(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_assets_folder_id ON assets(folder_id);
  CREATE INDEX IF NOT EXISTS idx_assets_source ON assets(source);

  -- FTS5 full-text search index
  CREATE VIRTUAL TABLE IF NOT EXISTS assets_fts USING fts5(
    id UNINDEXED,
    title,
    source,
    content='assets',
    content_rowid='rowid'
  );

  -- Triggers to keep FTS in sync
  CREATE TRIGGER IF NOT EXISTS assets_ai AFTER INSERT ON assets BEGIN
    INSERT INTO assets_fts(rowid, id, title, source) 
    VALUES (new.rowid, new.id, new.title, new.source);
  END;

  CREATE TRIGGER IF NOT EXISTS assets_ad AFTER DELETE ON assets BEGIN
    INSERT INTO assets_fts(assets_fts, rowid, id, title, source) 
    VALUES('delete', old.rowid, old.id, old.title, old.source);
  END;

  CREATE TRIGGER IF NOT EXISTS assets_au AFTER UPDATE ON assets BEGIN
    INSERT INTO assets_fts(assets_fts, rowid, id, title, source) 
    VALUES('delete', old.rowid, old.id, old.title, old.source);
    INSERT INTO assets_fts(rowid, id, title, source) 
    VALUES (new.rowid, new.id, new.title, new.source);
  END;
`);

// Prepared statements for performance
const stmts = {
  insert: db.prepare(`
    INSERT INTO assets (id, type, source, title, url, file_path, metadata, tags, folder_id, created_at, updated_at)
    VALUES (@id, @type, @source, @title, @url, @file_path, @metadata, @tags, @folder_id, @created_at, @updated_at)
  `),

  update: db.prepare(`
    UPDATE assets SET
      type = @type,
      source = @source,
      title = @title,
      url = @url,
      file_path = @file_path,
      metadata = @metadata,
      tags = @tags,
      folder_id = @folder_id,
      updated_at = datetime('now')
    WHERE id = @id
  `),

  delete: db.prepare(`DELETE FROM assets WHERE id = ?`),

  getById: db.prepare(`SELECT * FROM assets WHERE id = ?`),

  listAll: db.prepare(`
    SELECT * FROM assets 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `),

  listByType: db.prepare(`
    SELECT * FROM assets 
    WHERE type = ? 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `),

  listByFolder: db.prepare(`
    SELECT * FROM assets 
    WHERE folder_id = ? 
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `),

  search: db.prepare(`
    SELECT a.* FROM assets a
    JOIN assets_fts fts ON a.rowid = fts.rowid
    WHERE assets_fts MATCH ?
    ORDER BY a.created_at DESC
    LIMIT ? OFFSET ?
  `),

  countAll: db.prepare(`SELECT COUNT(*) as count FROM assets`),

  countByType: db.prepare(`SELECT COUNT(*) as count FROM assets WHERE type = ?`),

  deleteOld: db.prepare(`
    DELETE FROM assets 
    WHERE created_at < datetime('now', ?)
    AND type IN ('image', 'video', 'audio')
  `),
};

// Transaction wrapper for batch operations
const insertMany = db.transaction((assets) => {
  for (const asset of assets) {
    stmts.insert.run(asset);
  }
});

export {
  db,
  stmts,
  insertMany,
  DATA_DIR,
};

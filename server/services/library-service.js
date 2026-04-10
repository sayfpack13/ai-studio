import crypto from "crypto";
import { existsSync } from "fs";
import { join } from "path";
import { stmts, insertMany, db, DATA_DIR } from "./db.js";
import {
  saveBase64,
  downloadAndSave,
  deleteFile,
  isDataUrl,
  isLocalUrl,
  getFilenameFromUrl,
} from "./file-storage.js";

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix = "asset") {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
}

// Parse JSON safely
function parseJson(str, fallback) {
  try {
    return JSON.parse(str || fallback);
  } catch {
    return fallback;
  }
}

function resolveLocalAssetPath(row) {
  if (!row) return null;
  if (row.file_path) return row.file_path;
  if (isLocalUrl(row.url)) {
    const relative = String(row.url).replace(/^\/+/, "");
    return join(DATA_DIR, relative);
  }
  return null;
}

function isMissingLocalAssetRow(row) {
  const localPath = resolveLocalAssetPath(row);
  if (!localPath) return false;
  return !existsSync(localPath);
}

// Convert database row to asset object
function rowToAsset(row) {
  if (!row) return null;
  return {
    id: row.id,
    type: row.type,
    source: row.source,
    title: row.title,
    url: row.url,
    filePath: row.file_path,
    metadata: parseJson(row.metadata, {}),
    tags: parseJson(row.tags, []),
    folderId: row.folder_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Convert asset object to database parameters
function assetToParams(asset) {
  return {
    id: asset.id || createId("asset"),
    type: asset.type || "project",
    source: asset.source || "pipeline",
    title: asset.title || `${asset.type}-${Date.now()}`,
    url: asset.url || null,
    file_path: asset.filePath || asset.file_path || null,
    metadata: JSON.stringify(asset.metadata || {}),
    tags: JSON.stringify(asset.tags || []),
    folder_id: asset.folderId || asset.folder_id || null,
    created_at: asset.createdAt || nowIso(),
    updated_at: nowIso(),
  };
}

class LibraryService {
  constructor() {
    // Initialize migration from old JSON if needed, then cleanup invalid assets
    this.ready = this.init();
  }

  async init() {
    await this.migrateFromJson();
    await this.cleanupInvalidAssets();
  }

  // Migrate from old JSON format to SQLite
  async migrateFromJson() {
    const { DATA_DIR } = await import("./db.js");
    const fs = await import("fs/promises");
    const { join } = await import("path");

    const JSON_PATH = join(DATA_DIR, "library-assets.json");
    const MIGRATED_FLAG = join(DATA_DIR, ".migrated-to-sqlite");

    // Check if already migrated
    try {
      await fs.access(MIGRATED_FLAG);
      return; // Already migrated
    } catch {
      // Not migrated yet
    }

    try {
      const raw = await fs.readFile(JSON_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      const assets = Array.isArray(parsed?.assets) ? parsed.assets : [];

      if (assets.length > 0) {
        console.log(
          `[Library] Migrating ${assets.length} assets from JSON to SQLite...`,
        );

        const params = assets.map((asset) => assetToParams(asset));
        insertMany(params);

        console.log(`[Library] Migration complete`);

        // Mark as migrated
        await fs.writeFile(MIGRATED_FLAG, new Date().toISOString());
      }
    } catch (err) {
      // No old JSON file, nothing to migrate
      if (err.code !== "ENOENT") {
        console.error("[Library] Migration error:", err.message);
      }
    }
  }

  // Create a new asset
  async createAsset(input = {}) {
    await this.ready;

    const asset = assetToParams(input);

    // If URL is a data URL, save to file
    if (isDataUrl(input.url)) {
      try {
        const result = await saveBase64(
          input.url,
          input.metadata?.mimeType,
          "asset",
        );
        asset.url = result.url;
        asset.file_path = result.filepath;
        asset.metadata = JSON.stringify({
          ...input.metadata,
          sizeBytes: result.size,
          storage: "local",
        });
      } catch (err) {
        console.error("[Library] Failed to save file:", err.message);
        // Keep the data URL if saving fails
      }
    }

    stmts.insert.run(asset);
    return rowToAsset(stmts.getById.get(asset.id));
  }

  // List assets with pagination and filtering
  listAssets({ type, folderId, tag, query, limit = 100, offset = 0 } = {}) {
    let rows;
    let countResult;

    if (query) {
      // Full-text search
      rows = stmts.search.all(query, limit, offset);
      countResult = { count: rows.length }; // Approximate for search
    } else if (folderId) {
      rows = stmts.listByFolder.all(folderId, limit, offset);
      countResult = stmts.countByFolder.get(folderId);
    } else if (type) {
      rows = stmts.listByType.all(type, limit, offset);
      countResult = stmts.countByType.get(type);
    } else {
      rows = stmts.listAll.all(limit, offset);
      countResult = stmts.countAll.get();
    }

    const assets = [];
    let missingCount = 0;

    for (const row of rows) {
      if (isMissingLocalAssetRow(row)) {
        stmts.delete.run(row.id);
        missingCount++;
        continue;
      }
      assets.push(rowToAsset(row));
    }

    let filteredAssets = assets;
    if (tag) {
      filteredAssets = assets.filter((a) => a.tags && a.tags.includes(tag));
    }

    const baseTotal =
      typeof countResult?.count === "number"
        ? countResult.count
        : assets.length;
    let total = Math.max(0, baseTotal - missingCount);
    if (tag || query) {
      total = filteredAssets.length;
    }

    return {
      items: filteredAssets,
      total,
      limit,
      offset,
    };
  }

  // Get single asset by ID
  getAsset(id) {
    const row = stmts.getById.get(id);
    return rowToAsset(row);
  }

  // Update asset
  async updateAsset(id, patch = {}) {
    await this.ready;

    const existing = this.getAsset(id);
    if (!existing) return null;

    const updated = {
      ...existing,
      ...patch,
      metadata: {
        ...(existing.metadata || {}),
        ...(patch.metadata || {}),
      },
      updatedAt: nowIso(),
    };

    stmts.update.run(assetToParams(updated));
    return this.getAsset(id);
  }

  // Delete asset
  async deleteAsset(id) {
    await this.ready;

    const asset = this.getAsset(id);
    if (!asset) return false;

    // Delete associated file if local
    if (asset.filePath || (asset.url && isLocalUrl(asset.url))) {
      const filename = asset.filePath
        ? asset.filePath.split("/").pop()
        : getFilenameFromUrl(asset.url);
      if (filename) {
        await deleteFile(filename);
      }
    }

    stmts.delete.run(id);
    return true;
  }

  // Delete multiple assets
  async deleteAssets(ids) {
    await this.ready;
    let deleted = 0;

    for (const id of ids) {
      if (await this.deleteAsset(id)) {
        deleted++;
      }
    }

    return deleted;
  }

  // Clear all completed/terminal assets
  async clearCompleted() {
    await this.ready;

    const toDelete = db
      .prepare(
        `SELECT id, url, file_path FROM assets
         WHERE type IN ('image', 'video', 'audio')
         AND source IN ('image', 'video', 'music', 'pipeline')`,
      )
      .all();

    let deleted = 0;
    for (const row of toDelete) {
      if (row.file_path || (row.url && isLocalUrl(row.url))) {
        const filename = row.file_path
          ? row.file_path.split("/").pop()
          : getFilenameFromUrl(row.url);
        if (filename) {
          await deleteFile(filename);
        }
      }
      stmts.delete.run(row.id);
      deleted++;
    }

    return deleted;
  }

  // Cleanup old assets
  async cleanupOldAssets(maxAgeDays = 30) {
    await this.ready;

    const toDelete = stmts.deleteOld.all(`-${maxAgeDays} days`);

    for (const row of toDelete) {
      if (row.file_path || (row.url && isLocalUrl(row.url))) {
        const filename = row.file_path
          ? row.file_path.split("/").pop()
          : getFilenameFromUrl(row.url);
        if (filename) {
          await deleteFile(filename);
        }
      }
    }

    return toDelete.length;
  }

  // Cleanup invalid assets (videolan.org, data URLs, etc.) — runs once
  async cleanupInvalidAssets() {
    const fs = await import("fs/promises");
    const { join } = await import("path");
    const { DATA_DIR } = await import("./db.js");
    const FLAG = join(DATA_DIR, ".cleaned-invalid-assets");

    try {
      await fs.access(FLAG);
      return 0; // Already cleaned
    } catch {
      // Not cleaned yet
    }

    // Delete assets with videolan.org URLs
    const videolanResult = db
      .prepare(`DELETE FROM assets WHERE url LIKE ?`)
      .run("%videolan.org%");
    if (videolanResult.changes > 0) {
      console.log(
        `[Library] Deleted ${videolanResult.changes} assets with videolan.org URLs`,
      );
    }

    // Delete assets with data URLs (base64)
    const dataUrlResult = db
      .prepare(`DELETE FROM assets WHERE url LIKE ?`)
      .run("data:%");
    if (dataUrlResult.changes > 0) {
      console.log(
        `[Library] Deleted ${dataUrlResult.changes} assets with data URLs`,
      );
    }

    await fs.writeFile(FLAG, new Date().toISOString());
    return videolanResult.changes + dataUrlResult.changes;
  }

  // Download external URL and save locally
  async cacheExternalAsset(id) {
    const asset = this.getAsset(id);
    if (!asset) return null;

    if (isLocalUrl(asset.url)) {
      return asset; // Already cached
    }

    if (!asset.url || isDataUrl(asset.url)) {
      return asset; // Nothing to cache
    }

    try {
      const result = await downloadAndSave(
        asset.url,
        asset.metadata?.mimeType,
        "cached",
      );

      await this.updateAsset(id, {
        url: result.url,
        filePath: result.filepath,
        metadata: {
          ...asset.metadata,
          originalUrl: asset.url,
          sizeBytes: result.size,
          storage: "cached",
        },
      });

      return this.getAsset(id);
    } catch (err) {
      console.error("[Library] Failed to cache asset:", err.message);
      return asset;
    }
  }
}

const libraryService = new LibraryService();
export default libraryService;

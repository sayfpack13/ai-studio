import fs from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, "..", "data");
const LIBRARY_PATH = join(DATA_DIR, "library-assets.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix = "asset") {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(5).toString("hex")}`;
}

class LibraryService {
  constructor() {
    this.assets = new Map();
    this.order = [];
    this.ready = this.load();
  }

  async ensureDataDir() {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }

  async load() {
    await this.ensureDataDir();
    try {
      const raw = await fs.readFile(LIBRARY_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      const assets = Array.isArray(parsed?.assets) ? parsed.assets : [];
      this.assets.clear();
      this.order = [];
      for (const asset of assets) {
        if (!asset?.id) continue;
        this.assets.set(asset.id, asset);
        this.order.push(asset.id);
      }
    } catch {
      await this.persist();
    }
  }

  async persist() {
    await this.ensureDataDir();
    const payload = {
      updatedAt: nowIso(),
      assets: this.order.map((id) => this.assets.get(id)).filter(Boolean),
    };
    await fs.writeFile(LIBRARY_PATH, JSON.stringify(payload, null, 2), "utf-8");
  }

  normalizeAsset(input = {}) {
    const type = ["image", "video", "audio", "project"].includes(input.type)
      ? input.type
      : "project";
    const source = input.source || "pipeline";
    return {
      id: input.id || createId("asset"),
      type,
      source,
      title: input.title || `${type}-${Date.now()}`,
      url: input.url || null,
      blobRef: input.blobRef || null,
      metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
      tags: Array.isArray(input.tags) ? input.tags.slice(0, 20) : [],
      folderId: input.folderId || null,
      projectIds: Array.isArray(input.projectIds) ? input.projectIds : [],
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
    };
  }

  async createAsset(assetInput) {
    await this.ready;
    const asset = this.normalizeAsset(assetInput);
    this.assets.set(asset.id, asset);
    this.order.unshift(asset.id);
    await this.persist();
    return clone(asset);
  }

  listAssets({ type, folderId, tag, query } = {}) {
    let assets = this.order.map((id) => this.assets.get(id)).filter(Boolean);
    if (type) assets = assets.filter((asset) => asset.type === type);
    if (folderId) assets = assets.filter((asset) => asset.folderId === folderId);
    if (tag) assets = assets.filter((asset) => asset.tags.includes(tag));
    if (query) {
      const q = String(query).toLowerCase();
      assets = assets.filter((asset) =>
        [asset.title, asset.source, asset.url, ...(asset.tags || [])]
          .filter(Boolean)
          .some((part) => String(part).toLowerCase().includes(q)),
      );
    }
    return clone(assets);
  }

  getAsset(id) {
    const asset = this.assets.get(id);
    return asset ? clone(asset) : null;
  }

  async updateAsset(id, patch = {}) {
    await this.ready;
    const current = this.assets.get(id);
    if (!current) return null;
    const next = {
      ...current,
      ...patch,
      metadata: {
        ...(current.metadata || {}),
        ...(patch.metadata && typeof patch.metadata === "object" ? patch.metadata : {}),
      },
      updatedAt: nowIso(),
    };
    this.assets.set(id, next);
    await this.persist();
    return clone(next);
  }

  async deleteAsset(id) {
    await this.ready;
    const existed = this.assets.has(id);
    if (!existed) return false;
    this.assets.delete(id);
    this.order = this.order.filter((item) => item !== id);
    await this.persist();
    return true;
  }
}

const libraryService = new LibraryService();
export default libraryService;

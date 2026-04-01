import fs from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DATA_DIR = join(__dirname, "..", "data");
const TEMPLATES_PATH = join(DATA_DIR, "editor-templates.json");

class EditorService {
  constructor() {
    this.templates = [];
    this.ready = this.load();
  }

  async load() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(TEMPLATES_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      this.templates = Array.isArray(parsed?.templates) ? parsed.templates : [];
    } catch {
      await this.persist();
    }
  }

  async persist() {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      TEMPLATES_PATH,
      JSON.stringify({ updatedAt: new Date().toISOString(), templates: this.templates }, null, 2),
      "utf-8",
    );
  }

  async listTemplates() {
    await this.ready;
    return JSON.parse(JSON.stringify(this.templates));
  }

  async createTemplate(template) {
    await this.ready;
    const next = {
      id: template?.id || `tmpl_${Date.now()}`,
      name: template?.name || `Template ${this.templates.length + 1}`,
      scene: template?.scene || {},
      createdAt: new Date().toISOString(),
    };
    this.templates.unshift(next);
    await this.persist();
    return JSON.parse(JSON.stringify(next));
  }
}

const editorService = new EditorService();
export default editorService;

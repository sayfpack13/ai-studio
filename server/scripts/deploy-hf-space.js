/**
 * Deploy the HuggingFace Space files to a HuggingFace repo.
 *
 * Usage:
 *   node scripts/deploy-hf-space.js --name <space-name> --token <hf_token>
 *
 * If --token is omitted, reads from config.json (providers.huggingface.apiKey)
 * or the HF_TOKEN environment variable.
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import axios from "axios";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HF_API = "https://huggingface.co/api";
const ROOT_DIR = path.resolve(__dirname, "..", "..");
const DEFAULT_TEMPLATE_DIR_NAME = "huggingface-space";
const SPACE_FILES = ["app.py", "requirements.txt", "README.md", "pe.py", "prompt_check.py"];
const DEFAULT_SPACE_HARDWARE = process.env.HF_SPACE_HARDWARE || "zero-a10g";
const ZERO_HARDWARE_FLAVORS = new Set(["zerogpu", "zero-a10g"]);

/**
 * Metadata overrides per known space slug.
 * Keys match the slug portion of the Space name (e.g. "z-image-turbo" from "Tongyi-MAI/Z-Image-Turbo").
 * Falls back to deriving a clean title from the slug itself.
 */
const SPACE_META = {
  "z-image-turbo": {
    title: "Z-Image-Turbo",
    emoji: "🖼️",
    description: "# Z-Image-Turbo\n\nHigh-speed image generation powered by Tongyi MAI.",
  },
};

function getSpaceMeta(spaceSlug) {
  const key = spaceSlug.toLowerCase();
  if (SPACE_META[key]) return SPACE_META[key];
  // Fallback: derive title from slug
  const title = key
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  return { title, emoji: "🚀", description: `# ${title}` };
}

function toSlug(value = "") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "z-image-turbo";
}

function resolveTemplateDir(templateName = DEFAULT_TEMPLATE_DIR_NAME) {
  const safeTemplateName = String(templateName || DEFAULT_TEMPLATE_DIR_NAME).trim();
  return path.resolve(ROOT_DIR, safeTemplateName);
}

function patchReadmeFrontmatter(readmeContent, meta) {
  // Replace title, emoji in YAML frontmatter; replace body description
  let patched = readmeContent;

  patched = patched.replace(/^(\s*title:\s*).*$/m, `$1${meta.title}`);
  patched = patched.replace(/^(\s*emoji:\s*).*$/m, `$1${meta.emoji}`);

  // Replace body content after frontmatter (after closing ---)
  const fmEnd = patched.indexOf("---", patched.indexOf("---") + 3);
  if (fmEnd !== -1) {
    const afterFm = patched.indexOf("---", fmEnd + 3);
    if (afterFm !== -1) {
      const frontmatter = patched.substring(0, afterFm + 3);
      patched = frontmatter + "\n\n" + meta.description + "\n";
    }
  }

  return patched;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--name" && args[i + 1]) parsed.name = args[++i];
    else if (args[i] === "--token" && args[i + 1]) parsed.token = args[++i];
  }
  return parsed;
}

async function getTokenFromConfig() {
  try {
    const configPath = path.resolve(__dirname, "..", "config.json");
    const raw = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(raw);
    return config.providers?.huggingface?.apiKey || null;
  } catch {
    return null;
  }
}

async function getHFUsername(token) {
  const res = await axios.get(`${HF_API}/whoami-v2`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const username = res.data?.name || res.data?.user?.name;
  if (!username) {
    throw new Error("Failed to determine HuggingFace username from token");
  }

  return username;
}

async function setSpaceSecrets(token, repoId, secrets) {
  if (!secrets || Object.keys(secrets).length === 0) return;
  try {
    // HF API expects one secret object per request: { key, value, description? }
    let count = 0;
    for (const [key, value] of Object.entries(secrets)) {
      await axios.post(
        `${HF_API}/spaces/${repoId}/secrets`,
        { key, value: String(value ?? "") },
        {
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          timeout: 15000,
        },
      );
      count += 1;
    }
    console.log(`Set ${count} Space secret(s) on ${repoId}`);
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    console.warn(
      `Warning: Failed to set Space secrets (${status}):`,
      (body?.error || body?.message || "").toString().slice(0, 200),
    );
  }
}

function normalizeRepoId(candidate, username) {
  const raw = String(candidate || "").trim();
  if (!raw) throw new Error("Space name or repoId is required");
  return raw.includes("/") ? raw : `${username}/${raw}`;
}

async function createSpaceRepo(token, repoId) {
  try {
    await axios.post(
      `${HF_API}/repos/create`,
      {
        type: "space",
        name: repoId.split("/")[1],
        sdk: "gradio",
        private: false,
        hardware: DEFAULT_SPACE_HARDWARE,
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    console.log(`Created Space: ${repoId} (hardware: ${DEFAULT_SPACE_HARDWARE})`);
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`Space ${repoId} already exists, updating files...`);
      console.log("Note: Existing Space hardware is unchanged. Set hardware in Space Settings if needed.");
    } else {
      throw err;
    }
  }
}

async function getSpaceRuntimeInfo(token, repoId) {
  try {
    const res = await axios.get(`${HF_API}/spaces/${repoId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 20000,
    });
    const data = res.data || {};
    return {
      stage: data.runtime?.stage || data.stage || null,
      currentHardware: data.runtime?.hardware?.current || data.hardware || null,
      requestedHardware: data.runtime?.hardware?.requested || null,
    };
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    console.warn(
      `Warning: Could not read Space runtime info (${status}):`,
      (body?.error || body?.message || err.message || "unknown error").toString().slice(0, 200),
    );
    return null;
  }
}

function warnIfHardwareMismatch(repoId, runtimeInfo) {
  if (!runtimeInfo?.currentHardware) return;
  if (runtimeInfo.currentHardware === DEFAULT_SPACE_HARDWARE) return;

  // Treat Zero hardware flavors as compatible for existing Spaces.
  if (
    ZERO_HARDWARE_FLAVORS.has(runtimeInfo.currentHardware) &&
    ZERO_HARDWARE_FLAVORS.has(DEFAULT_SPACE_HARDWARE)
  ) {
    console.log(
      `Info: ${repoId} is on '${runtimeInfo.currentHardware}' and deploy default is '${DEFAULT_SPACE_HARDWARE}'. Treating as compatible zero hardware.`,
    );
    return;
  }

  console.warn(
    `Warning: ${repoId} is currently using hardware '${runtimeInfo.currentHardware}' (requested: '${runtimeInfo.requestedHardware || "unknown"}').`,
  );
  console.warn(
    `Expected hardware for this deploy script is '${DEFAULT_SPACE_HARDWARE}'. Existing Space hardware is not auto-changed on redeploy.`,
  );
  console.warn("Set hardware manually in Space Settings, or recreate the Space to apply creation-time hardware.");
}

async function uploadFiles(token, repoId, templateName = DEFAULT_TEMPLATE_DIR_NAME) {
  const templateDir = resolveTemplateDir(templateName);
  const files = [];
  const spaceSlug = repoId.includes("/") ? repoId.split("/")[1] : repoId;
  const meta = getSpaceMeta(spaceSlug);

  for (const filename of SPACE_FILES) {
    const filePath = path.join(templateDir, filename);
    let content;
    try {
      content = await fs.readFile(filePath, "utf-8");
    } catch {
      throw new Error(
        `Missing Space template file: ${filePath}. Ensure ${templateName} has app.py, requirements.txt, and README.md.`,
      );
    }

    // Patch README.md frontmatter to match the actual space identity
    if (filename === "README.md") {
      content = patchReadmeFrontmatter(content, meta);
    }

    const b64 = Buffer.from(content, "utf-8").toString("base64");
    files.push({
      path: filename,
      content: b64,
      encoding: "base64",
    });
  }

  // Retry up to 3 times with delay (Space repo may need a moment to be ready)
  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await axios.post(
        `${HF_API}/spaces/${repoId}/commit/main`,
        {
          summary: `Deploy ${spaceSlug}`,
          files,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          timeout: 30000,
        },
      );
      console.log("Files uploaded successfully.");
      return;
    } catch (err) {
      const status = err.response?.status;
      const body = err.response?.data;
      console.error(
        `Upload attempt ${attempt}/${MAX_RETRIES} failed:`,
        status,
        JSON.stringify(body || {}).slice(0, 300),
      );
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 3000;
        console.log(`Retrying in ${delay / 1000}s...`);
        await new Promise((r) => setTimeout(r, delay));
      } else {
        const msg =
          typeof body === "string"
            ? body
            : body?.error || body?.message || JSON.stringify(body);
        throw new Error(`Upload failed after ${MAX_RETRIES} attempts: ${status} - ${msg}`);
      }
    }
  }
}

export async function deployHFSpace({ spaceName, token, templateName = DEFAULT_TEMPLATE_DIR_NAME }) {
  if (!token) throw new Error("HuggingFace token is required");
  if (!spaceName) throw new Error("Space name is required");

  const username = await getHFUsername(token);
  const repoId = normalizeRepoId(spaceName, username);

  await createSpaceRepo(token, repoId);

  // Brief pause to let the repo initialize on HuggingFace side
  await new Promise((r) => setTimeout(r, 2000));

  await uploadFiles(token, repoId, templateName);

  // Set HF_TOKEN as Space secret so the Space can download models without rate limits
  await setSpaceSecrets(token, repoId, { HF_TOKEN: token });
  try {
    await axios.post(
      `${HF_API}/spaces/${repoId}/variables`,
      { key: "SPACE_DATA_DIR", value: "/data" },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15000 },
    );
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    console.warn(
      `Warning: Failed to set SPACE_DATA_DIR variable (${status}):`,
      (body?.error || body?.message || err.message || "unknown error").toString().slice(0, 200),
    );
  }

  const runtimeInfo = await getSpaceRuntimeInfo(token, repoId);
  warnIfHardwareMismatch(repoId, runtimeInfo);

  const spaceSlug = repoId.replace(/\//g, "-");
  const spaceUrl = `https://${spaceSlug}.hf.space`;
  return { repoId, spaceUrl, username };
}

export async function redeployHFSpace({ repoId, token, templateName = DEFAULT_TEMPLATE_DIR_NAME }) {
  if (!token) throw new Error("HuggingFace token is required");
  if (!repoId) throw new Error("repoId is required");

  const username = await getHFUsername(token);
  const normalizedRepoId = normalizeRepoId(repoId, username);
  await uploadFiles(token, normalizedRepoId, templateName);

  // Set HF_TOKEN as Space secret so the Space can download models without rate limits
  await setSpaceSecrets(token, normalizedRepoId, { HF_TOKEN: token });
  try {
    await axios.post(
      `${HF_API}/spaces/${normalizedRepoId}/variables`,
      { key: "SPACE_DATA_DIR", value: "/data" },
      { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, timeout: 15000 },
    );
  } catch (err) {
    const status = err.response?.status;
    const body = err.response?.data;
    console.warn(
      `Warning: Failed to set SPACE_DATA_DIR variable (${status}):`,
      (body?.error || body?.message || err.message || "unknown error").toString().slice(0, 200),
    );
  }

  const runtimeInfo = await getSpaceRuntimeInfo(token, normalizedRepoId);
  warnIfHardwareMismatch(normalizedRepoId, runtimeInfo);

  const spaceSlug = normalizedRepoId.replace(/\//g, "-");
  const spaceUrl = `https://${spaceSlug}.hf.space`;
  return { repoId: normalizedRepoId, spaceUrl, username };
}

export async function listHFSpaces({ token }) {
  if (!token) throw new Error("HuggingFace token is required");

  const username = await getHFUsername(token);
  const res = await axios.get(`${HF_API}/spaces`, {
    params: { author: username },
    headers: { Authorization: `Bearer ${token}` },
    timeout: 20000,
  });

  const rows = Array.isArray(res.data)
    ? res.data
    : Array.isArray(res.data?.spaces)
      ? res.data.spaces
      : [];

  const spaces = rows
    .map((item) => {
      const id = item?.id || `${item?.author || username}/${item?.name || ""}`;
      if (!id || !id.includes("/")) return null;
      const slug = id.replace(/\//g, "-");
      return {
        repoId: id,
        name: item?.name || id.split("/")[1],
        private: Boolean(item?.private),
        sdk: item?.sdk || "unknown",
        likes: Number(item?.likes || 0),
        updatedAt: item?.lastModified || item?.updatedAt || null,
        spaceUrl: `https://${slug}.hf.space`,
        pageUrl: `https://huggingface.co/spaces/${id}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const aTime = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const bTime = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return bTime - aTime;
    });

  return { username, spaces };
}

async function listBackendTemplateDirs() {
  const entries = await fs.readdir(ROOT_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name === DEFAULT_TEMPLATE_DIR_NAME || name.startsWith(`${DEFAULT_TEMPLATE_DIR_NAME}-`));
}

async function checkTemplateReadiness(templateName) {
  const templateDir = resolveTemplateDir(templateName);
  const checks = await Promise.all(
    SPACE_FILES.map(async (file) => {
      try {
        await fs.access(path.join(templateDir, file));
        return { file, exists: true };
      } catch {
        return { file, exists: false };
      }
    }),
  );
  const missingFiles = checks.filter((x) => !x.exists).map((x) => x.file);
  return {
    templateName,
    templateDir,
    ready: missingFiles.length === 0,
    missingFiles,
  };
}

function suggestedSpaceNameForTemplate(templateName) {
  if (templateName === DEFAULT_TEMPLATE_DIR_NAME) {
    return "Z-Image-Turbo";
  }
  const suffix = templateName.slice(`${DEFAULT_TEMPLATE_DIR_NAME}-`.length);
  return toSlug(suffix || "Z-Image-Turbo");
}

export async function listBackendDeployTargets({ token }) {
  if (!token) throw new Error("HuggingFace token is required");

  const [spacesResult, templateDirs] = await Promise.all([
    listHFSpaces({ token }),
    listBackendTemplateDirs(),
  ]);

  const readiness = await Promise.all(templateDirs.map(checkTemplateReadiness));
  const deployedByRepoId = new Map(
    spacesResult.spaces.map((space) => [space.repoId, space]),
  );

  const targets = readiness.map((item) => {
    const suggestedSpaceName = suggestedSpaceNameForTemplate(item.templateName);
    const suggestedRepoId = `${spacesResult.username}/${suggestedSpaceName}`;
    const deployedSpace = deployedByRepoId.get(suggestedRepoId) || null;
    const meta = getSpaceMeta(suggestedSpaceName);

    return {
      ...item,
      suggestedSpaceName,
      suggestedRepoId,
      deployed: Boolean(deployedSpace),
      deployedSpace,
      title: meta.title,
      emoji: meta.emoji,
    };
  });

  return {
    username: spacesResult.username,
    targets,
  };
}

async function main() {
  const args = parseArgs();
  const token = args.token || process.env.HF_TOKEN || (await getTokenFromConfig());

  if (!token) {
    console.error(
      "Error: No HuggingFace token found.\n" +
        "Provide via --token, HF_TOKEN env var, or set it in config.json (providers.huggingface.apiKey)",
    );
    process.exit(1);
  }

  const spaceName = args.name || "ai-studio-gpu";
  const templateName = DEFAULT_TEMPLATE_DIR_NAME;

  console.log(`Deploying Space \"${spaceName}\"...`);
  try {
    const result = await deployHFSpace({ spaceName, token, templateName });
    console.log("\nDeployment successful!");
    console.log(`  Repo:  https://huggingface.co/spaces/${result.repoId}`);
    console.log(`  URL:   ${result.spaceUrl}`);
    console.log("\nNext steps:");
    console.log(`  1. Ensure Space Settings hardware is '${DEFAULT_SPACE_HARDWARE}' (or set HF_SPACE_HARDWARE)`);
    console.log("  2. Set the Space URL in Admin -> Providers -> HuggingFace -> API Base URL");
  } catch (err) {
    console.error("Deployment failed:", err.response?.data || err.message);
    process.exit(1);
  }
}

// Run as CLI script
const isMainModule = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isMainModule) {
  main();
}

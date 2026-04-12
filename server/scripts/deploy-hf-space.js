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
const SPACE_DIR = path.resolve(__dirname, "..", "..", "huggingface-space");

const SPACE_FILES = ["app.py", "requirements.txt", "README.md"];

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
  return res.data.name;
}

async function createSpaceRepo(token, repoId) {
  try {
    await axios.post(
      `${HF_API}/repos/create`,
      { type: "space", name: repoId.split("/")[1], sdk: "gradio", private: false },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    console.log(`Created Space: ${repoId}`);
  } catch (err) {
    if (err.response?.status === 409) {
      console.log(`Space ${repoId} already exists, updating files...`);
    } else {
      throw err;
    }
  }
}

async function uploadFiles(token, repoId) {
  const operations = [];

  for (const filename of SPACE_FILES) {
    const filePath = path.join(SPACE_DIR, filename);
    const content = await fs.readFile(filePath, "utf-8");
    const b64 = Buffer.from(content, "utf-8").toString("base64");
    operations.push({
      key: "file",
      value: { path: filename, content: b64, encoding: "base64" },
    });
  }

  await axios.post(
    `${HF_API}/spaces/${repoId}/commit/main`,
    {
      summary: "Deploy AI Studio Space (FLUX + Wan I2V)",
      operations: operations.map((op) => ({
        key: op.key,
        value: op.value,
      })),
    },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );
}

export async function deployHFSpace({ spaceName, token }) {
  if (!token) throw new Error("HuggingFace token is required");
  if (!spaceName) throw new Error("Space name is required");

  const username = await getHFUsername(token);
  const repoId = spaceName.includes("/") ? spaceName : `${username}/${spaceName}`;

  await createSpaceRepo(token, repoId);
  await uploadFiles(token, repoId);

  const spaceUrl = `https://${username}-${spaceName.replace(/\//g, "-")}.hf.space`;
  return { repoId, spaceUrl, username };
}

async function main() {
  const args = parseArgs();
  const token =
    args.token || process.env.HF_TOKEN || (await getTokenFromConfig());

  if (!token) {
    console.error(
      "Error: No HuggingFace token found.\n" +
        "Provide via --token, HF_TOKEN env var, or set it in config.json (providers.huggingface.apiKey)",
    );
    process.exit(1);
  }

  const spaceName = args.name || "ai-studio-gpu";

  console.log(`Deploying Space "${spaceName}"...`);
  try {
    const result = await deployHFSpace({ spaceName, token });
    console.log("\nDeployment successful!");
    console.log(`  Repo:  https://huggingface.co/spaces/${result.repoId}`);
    console.log(`  URL:   ${result.spaceUrl}`);
    console.log("\nNext steps:");
    console.log("  1. Go to Space Settings and select ZeroGPU hardware");
    console.log(`  2. Set the Space URL in Admin → Providers → HuggingFace → API Base URL`);
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

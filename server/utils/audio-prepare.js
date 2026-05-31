/**
 * Prepare source audio for AceMusic cloud cover/remix (Cloudflare-safe size/duration).
 * Uses ffmpeg-static when available; falls back to system ffmpeg.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

const execFileAsync = promisify(execFile);

export const MAX_COVER_DURATION_SEC = 90;
export const MAX_COVER_BYTES = 2 * 1024 * 1024;
/** Compress when above this threshold (AceMusic skill recommends compression for cloud). */
const COMPRESS_ABOVE_BYTES = 512 * 1024;

let ffmpegPathPromise = null;

async function resolveFfmpegPath() {
  if (ffmpegPathPromise) return ffmpegPathPromise;
  ffmpegPathPromise = (async () => {
    try {
      const mod = await import("ffmpeg-static");
      const bundled = mod.default || mod;
      if (bundled && typeof bundled === "string") {
        await execFileAsync(bundled, ["-version"], { timeout: 10_000 });
        return bundled;
      }
    } catch {
      // bundled ffmpeg not installed or failed
    }
    try {
      await execFileAsync("ffmpeg", ["-version"], { timeout: 10_000 });
      return "ffmpeg";
    } catch {
      return null;
    }
  })();
  return ffmpegPathPromise;
}

function extForMime(mime = "") {
  const m = String(mime).toLowerCase();
  if (m.includes("wav")) return ".wav";
  if (m.includes("ogg")) return ".ogg";
  if (m.includes("m4a") || m.includes("mp4")) return ".m4a";
  if (m.includes("flac")) return ".flac";
  return ".mp3";
}

/**
 * Trim + compress cover source for api.acemusic.ai (mono 64kbps MP3, max duration).
 * @returns {Promise<Buffer>}
 */
export async function prepareCoverAudio(
  buffer,
  mime = "audio/mpeg",
  {
    maxDurationSec = MAX_COVER_DURATION_SEC,
    maxBytes = MAX_COVER_BYTES,
    force = false,
  } = {},
) {
  if (!buffer?.length) return buffer;

  const needsPrep = force || buffer.length > COMPRESS_ABOVE_BYTES;
  const ffmpeg = await resolveFfmpegPath();

  if (!ffmpeg) {
    if (buffer.length > maxBytes) {
      throw new Error(
        `Source audio is too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). ` +
          `AceMusic cloud needs clips under ~${maxDurationSec}s and 2MB. ` +
          "Install ffmpeg on the server, or upload a shorter clip (under 90 seconds).",
      );
    }
    if (needsPrep) {
      console.warn(
        "[audio-prepare] ffmpeg not available; sending original audio " +
          `(${(buffer.length / 1024 / 1024).toFixed(1)}MB). Long tracks may 504 on AceMusic.`,
      );
    }
    return buffer;
  }

  if (!needsPrep && buffer.length <= maxBytes) {
    return buffer;
  }

  const id = randomBytes(8).toString("hex");
  const inPath = join(tmpdir(), `remix-in-${id}${extForMime(mime)}`);
  const outPath = join(tmpdir(), `remix-out-${id}.mp3`);

  try {
    await writeFile(inPath, buffer);
    await execFileAsync(
      ffmpeg,
      [
        "-y",
        "-i",
        inPath,
        "-t",
        String(maxDurationSec),
        "-ac",
        "1",
        "-ar",
        "24000",
        "-b:a",
        "64k",
        outPath,
      ],
      { timeout: 120_000 },
    );

    const out = await readFile(outPath);
    console.log(
      "[audio-prepare] Prepared cover audio:",
      `${buffer.length} → ${out.length} bytes`,
      `(max ${maxDurationSec}s, mono 64kbps MP3)`,
    );

    if (out.length > maxBytes) {
      throw new Error(
        `Prepared audio is still too large (${(out.length / 1024 / 1024).toFixed(1)}MB). ` +
          `Try a shorter source clip (under ${maxDurationSec}s).`,
      );
    }

    return out;
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

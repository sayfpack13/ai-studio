/**
 * Prepare source audio for AceMusic cloud cover/remix uploads.
 * Compresses large files (mono 64kbps MP3). Auto-trims long tracks when the
 * compressed file still exceeds cloud gateway size limits (504 prevention).
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

const execFileAsync = promisify(execFile);

/** Optional trim cap (seconds). 0 / unset = auto (may trim for cloud size limits). */
export const MAX_COVER_DURATION_SEC = Number(process.env.ACEMUSIC_MAX_COVER_SEC || 0) || null;
export const MAX_COVER_BYTES = 8 * 1024 * 1024;
/** Target max prepared file size for api.acemusic.ai uploads (~1.6MB base64 in JSON). */
export const CLOUD_SAFE_UPLOAD_BYTES =
  Number(process.env.ACEMUSIC_CLOUD_MAX_BYTES || 0) || 1_200_000;
/** Compress when above this threshold. */
const COMPRESS_ABOVE_BYTES = 512 * 1024;
const AUTO_TRIM_STEPS_SEC = [240, 180, 150, 120, 90, 60];

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

async function transcodeToMp3(ffmpeg, inPath, outPath, maxDurationSec = null) {
  const args = ["-y", "-i", inPath];
  if (maxDurationSec != null && maxDurationSec > 0) {
    args.push("-t", String(maxDurationSec));
  }
  args.push("-ac", "1", "-ar", "24000", "-b:a", "64k", outPath);
  await execFileAsync(ffmpeg, args, { timeout: 180_000 });
  return readFile(outPath);
}

/**
 * Compress cover source for api.acemusic.ai (mono 64kbps MP3).
 * Auto-trims when the compressed upload would exceed CLOUD_SAFE_UPLOAD_BYTES.
 * @returns {Promise<{ buffer: Buffer, trimSec: number|null, autoTrimmed: boolean }>}
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
  if (!buffer?.length) {
    return { buffer, trimSec: maxDurationSec, autoTrimmed: false };
  }

  const needsPrep = force || buffer.length > COMPRESS_ABOVE_BYTES;
  const ffmpeg = await resolveFfmpegPath();

  if (!ffmpeg) {
    if (buffer.length > maxBytes) {
      throw new Error(
        `Source audio is too large (${(buffer.length / 1024 / 1024).toFixed(1)}MB). ` +
          "Install ffmpeg on the server to compress uploads, or use a smaller file.",
      );
    }
    if (needsPrep) {
      console.warn(
        "[audio-prepare] ffmpeg not available; sending original audio " +
          `(${(buffer.length / 1024 / 1024).toFixed(1)}MB).`,
      );
    }
    return { buffer, trimSec: maxDurationSec, autoTrimmed: false };
  }

  if (!needsPrep && buffer.length <= maxBytes && buffer.length <= CLOUD_SAFE_UPLOAD_BYTES) {
    return { buffer, trimSec: maxDurationSec, autoTrimmed: false };
  }

  const id = randomBytes(8).toString("hex");
  const inPath = join(tmpdir(), `remix-in-${id}${extForMime(mime)}`);
  const outPath = join(tmpdir(), `remix-out-${id}.mp3`);

  try {
    await writeFile(inPath, buffer);

    const trimCandidates = [];
    if (maxDurationSec != null && maxDurationSec > 0) {
      trimCandidates.push(maxDurationSec);
    } else {
      trimCandidates.push(null, ...AUTO_TRIM_STEPS_SEC);
    }

    let out = null;
    let appliedTrimSec = maxDurationSec;
    let autoTrimmed = false;

    for (let i = 0; i < trimCandidates.length; i++) {
      const trimSec = trimCandidates[i];
      out = await transcodeToMp3(ffmpeg, inPath, outPath, trimSec);
      appliedTrimSec = trimSec;

      const withinCloud = out.length <= CLOUD_SAFE_UPLOAD_BYTES;
      const withinMax = out.length <= maxBytes;
      const userCapSet = maxDurationSec != null && maxDurationSec > 0;

      if (withinMax && (userCapSet || withinCloud)) {
        if (i > 0 && maxDurationSec == null && trimSec != null) {
          autoTrimmed = true;
        }
        break;
      }

      if (userCapSet) {
        throw new Error(
          `Prepared audio is still too large (${(out.length / 1024 / 1024).toFixed(1)}MB). ` +
            `Try ACEMUSIC_MAX_COVER_SEC=${Math.max(30, Math.floor((maxDurationSec || 120) * 0.75))} in server env.`,
        );
      }
    }

    if (!out) {
      throw new Error("Failed to prepare cover audio");
    }

    if (out.length > maxBytes) {
      throw new Error(
        `Prepared audio is still too large (${(out.length / 1024 / 1024).toFixed(1)}MB). ` +
          "Try a shorter source clip or set ACEMUSIC_MAX_COVER_SEC.",
      );
    }

    const trimLabel =
      appliedTrimSec != null
        ? `max ${appliedTrimSec}s, mono 64kbps MP3`
        : "full length, mono 64kbps MP3";
    console.log(
      "[audio-prepare] Prepared cover audio:",
      `${buffer.length} → ${out.length} bytes`,
      `(${trimLabel}${autoTrimmed ? ", auto-trimmed for cloud" : ""})`,
    );

    return { buffer: out, trimSec: appliedTrimSec, autoTrimmed };
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

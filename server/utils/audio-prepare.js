/**
 * Prepare source audio for AceMusic cloud cover/remix uploads.
 * Compresses large files (mono 64kbps MP3) per AceMusic docs; does not trim duration
 * unless ACEMUSIC_MAX_COVER_SEC is set.
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, unlink } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";

const execFileAsync = promisify(execFile);

/** Optional trim cap (seconds). 0 / unset = send full track length. */
export const MAX_COVER_DURATION_SEC = Number(process.env.ACEMUSIC_MAX_COVER_SEC || 0) || null;
export const MAX_COVER_BYTES = 8 * 1024 * 1024;
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
 * Compress cover source for api.acemusic.ai (mono 64kbps MP3). Full duration preserved
 * unless MAX_COVER_DURATION_SEC / ACEMUSIC_MAX_COVER_SEC is configured.
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
          "Install ffmpeg on the server to compress uploads, or use a smaller file.",
      );
    }
    if (needsPrep) {
      console.warn(
        "[audio-prepare] ffmpeg not available; sending original audio " +
          `(${(buffer.length / 1024 / 1024).toFixed(1)}MB).`,
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

  const ffmpegArgs = ["-y", "-i", inPath];
  if (maxDurationSec != null && maxDurationSec > 0) {
    ffmpegArgs.push("-t", String(maxDurationSec));
  }
  ffmpegArgs.push("-ac", "1", "-ar", "24000", "-b:a", "64k", outPath);

  try {
    await writeFile(inPath, buffer);
    await execFileAsync(ffmpeg, ffmpegArgs, { timeout: 180_000 });

    const out = await readFile(outPath);
    console.log(
      "[audio-prepare] Prepared cover audio:",
      `${buffer.length} → ${out.length} bytes`,
      maxDurationSec ? `(max ${maxDurationSec}s, mono 64kbps MP3)` : "(full length, mono 64kbps MP3)",
    );

    if (out.length > maxBytes) {
      throw new Error(
        `Prepared audio is still too large (${(out.length / 1024 / 1024).toFixed(1)}MB). ` +
          "Try a shorter source clip or set ACEMUSIC_MAX_COVER_SEC to trim server-side.",
      );
    }

    return out;
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}

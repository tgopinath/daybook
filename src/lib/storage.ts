import "server-only";
import { createReadStream } from "fs";
import { mkdir, rm, stat, writeFile } from "fs/promises";
import path from "path";
import { Readable } from "stream";
import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Media storage (photos, videos, audio, documents) behind one small API:
// - S3-compatible object storage (Neon Object Storage, AWS S3, R2…) when S3_BUCKET is set.
//   Browsers upload straight to the bucket with a presigned PUT, so file size isn't limited by
//   the server's request body limit, and downloads redirect to short-lived presigned GETs.
// - A private local folder otherwise (development), streamed through the API.
// Vercel reserves the AWS_* names, so S3_* is read first, falling back to AWS_* for local tools.

type S3Config = { bucket: string; client: S3Client };
let s3: S3Config | null | undefined;

function s3Config(): S3Config | null {
  if (s3 !== undefined) return s3;
  const bucket = process.env.S3_BUCKET?.trim();
  const endpoint = (process.env.S3_ENDPOINT || process.env.AWS_ENDPOINT_URL_S3)?.trim();
  const accessKeyId = (process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID)?.trim();
  const secretAccessKey = (process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY)?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) return (s3 = null);
  const client = new S3Client({
    region: (process.env.S3_REGION || process.env.AWS_REGION || "us-east-1").trim(),
    endpoint: endpoint || undefined,
    forcePathStyle: true, // required by Neon Object Storage and most S3-compatible stores
    credentials: { accessKeyId, secretAccessKey },
  });
  return (s3 = { bucket, client });
}

export const storageMode = () => (s3Config() ? "s3" : process.env.VERCEL ? "none" : "local");

/** False on hosts with no persistent storage configured (e.g. Vercel without S3). */
export const storageAvailable = () => storageMode() !== "none";

const localRoot = () => path.resolve(process.cwd(), process.env.STORAGE_DIR || "./storage", "media");

function localPath(key: string) {
  const root = localRoot();
  const p = path.resolve(root, key);
  if (!p.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return p;
}

/** Presigned PUT for a browser upload, or null when the API must receive the bytes (local mode). */
export async function presignUpload(key: string, contentType: string, expiresIn = 900) {
  const cfg = s3Config();
  if (!cfg) return null;
  return getSignedUrl(cfg.client, new PutObjectCommand({ Bucket: cfg.bucket, Key: key, ContentType: contentType }), { expiresIn });
}

/** Presigned GET (S3) or null (local: stream with readObject). */
export async function presignDownload(key: string, opts: { downloadName?: string; contentType?: string; expiresIn?: number } = {}) {
  const cfg = s3Config();
  if (!cfg) return null;
  return getSignedUrl(
    cfg.client,
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      ResponseContentType: opts.contentType,
      ResponseContentDisposition: opts.downloadName ? `attachment; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}` : undefined,
      ResponseCacheControl: "private, max-age=3600",
    }),
    { expiresIn: opts.expiresIn ?? 3600 },
  );
}

/** Server-side write (local uploads, Google Photos imports). */
export async function writeObject(key: string, bytes: Uint8Array, contentType: string) {
  const cfg = s3Config();
  if (cfg) {
    await cfg.client.send(new PutObjectCommand({ Bucket: cfg.bucket, Key: key, Body: bytes, ContentType: contentType }));
    return;
  }
  if (storageMode() === "none") throw new Error("No persistent storage configured");
  const p = localPath(key);
  await mkdir(path.dirname(p), { recursive: true, mode: 0o700 });
  await writeFile(p, bytes, { mode: 0o600 });
}

/** Stored size in bytes, or null if the object doesn't exist. */
export async function objectSize(key: string): Promise<number | null> {
  const cfg = s3Config();
  try {
    if (cfg) {
      const head = await cfg.client.send(new HeadObjectCommand({ Bucket: cfg.bucket, Key: key }));
      return head.ContentLength ?? 0;
    }
    return (await stat(localPath(key))).size;
  } catch {
    return null;
  }
}

/** Local mode: a web stream of the file for the download route. */
export function readLocalObject(key: string): ReadableStream {
  return Readable.toWeb(createReadStream(localPath(key))) as ReadableStream;
}

export async function deleteObjects(keys: string[]) {
  if (!keys.length) return;
  const cfg = s3Config();
  if (cfg) {
    for (let i = 0; i < keys.length; i += 1000) {
      await cfg.client.send(new DeleteObjectsCommand({ Bucket: cfg.bucket, Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }));
    }
    return;
  }
  if (storageMode() === "none") return;
  await Promise.all(keys.map((k) => rm(localPath(k), { force: true })));
}

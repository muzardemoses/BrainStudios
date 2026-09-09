import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { Project } from "@workspace/video-workflow";
import { config, WorkflowError } from "./config";
export const r2 = new S3Client({
  region: "auto",
  endpoint: config.endpoint,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID || "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || "",
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
  maxAttempts: 3,
});
export async function checkStorage() {
  await r2.send(new HeadBucketCommand({ Bucket: config.bucket }));
}
export async function put(key: string, body: Buffer, contentType: string) {
  await r2.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      ContentLength: body.length,
    }),
  );
  return key;
}
export async function putFile(key: string, file: string, contentType: string) {
  const { size } = await stat(file);
  await r2.send(
    new PutObjectCommand({
      Bucket: config.bucket,
      Key: key,
      Body: createReadStream(file),
      ContentLength: size,
      ContentType: contentType,
    }),
  );
  return key;
}
export async function downloadFile(key: string, target: string) {
  const r = await r2.send(
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
  );
  if (!r.Body || (r.ContentLength || 0) > 512 * 1024 * 1024)
    throw new WorkflowError(
      "The scene asset is unavailable or too large for assembly.",
    );
  await pipeline(r.Body as Readable, createWriteStream(target));
}
const signed = new Map<string, { url: string; expires: number }>();
export async function assetUrl(key: string) {
  const cached = signed.get(key);
  if (cached && cached.expires > Date.now()) return cached.url;
  const url = await getSignedUrl(
    r2,
    new GetObjectCommand({ Bucket: config.bucket, Key: key }),
    { expiresIn: 3600 },
  );
  if (signed.size > 2000) signed.clear();
  signed.set(key, { url, expires: Date.now() + 45 * 60_000 });
  return url;
}
export async function hydrate(p: Project): Promise<Project> {
  return {
    ...p,
    finalUrl: p.finalKey ? await assetUrl(p.finalKey) : undefined,
    scenes: await Promise.all(
      p.scenes.map(async (s) => ({
        ...s,
        image: s.posterKey ? await assetUrl(s.posterKey) : "",
        clipUrl: s.clipKey ? await assetUrl(s.clipKey) : undefined,
      })),
    ),
    thumbnails: await Promise.all(
      p.thumbnails.map(async (t) => ({ ...t, url: await assetUrl(t.key) })),
    ),
  };
}

export async function downloadUrl(key: string, filename: string) {
  return getSignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: config.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
    }),
    { expiresIn: 300 },
  );
}

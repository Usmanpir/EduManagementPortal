import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/server/env";

/**
 * Object storage abstraction. Files never live in PostgreSQL — only their
 * keys. Keys are always generated server-side (see `buildStorageKey`) so user
 * supplied filenames can never influence the storage path.
 */
export interface StorageDriver {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Returns a web stream of the object, or null if it does not exist. */
  get(key: string): Promise<{ body: ReadableStream; size: number } | null>;
  delete(key: string): Promise<void>;
  /** Direct presigned URL when the backend supports it (S3); null means serve through the app. */
  presignedUrl(key: string, expiresInSeconds: number, downloadName?: string): Promise<string | null>;
}

const KEY_PATTERN = /^[a-z0-9-]+(\/[a-zA-Z0-9._-]+)+$/;

export function assertValidKey(key: string) {
  if (!KEY_PATTERN.test(key) || key.includes("..")) throw new Error("Invalid storage key");
}

class LocalDriver implements StorageDriver {
  private root = path.resolve(env.STORAGE_LOCAL_DIR);

  private resolve(key: string) {
    assertValidKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(key: string, body: Buffer) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }

  async get(key: string) {
    const full = this.resolve(key);
    try {
      const info = await stat(full);
      return { body: Readable.toWeb(createReadStream(full)) as ReadableStream, size: info.size };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    await rm(this.resolve(key), { force: true });
  }

  async presignedUrl() {
    return null;
  }
}

class S3Driver implements StorageDriver {
  private client: S3Client;
  private bucket: string;

  constructor() {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY_ID || !env.S3_SECRET_ACCESS_KEY) {
      throw new Error("S3 storage requires S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY");
    }
    this.bucket = env.S3_BUCKET;
    this.client = new S3Client({
      region: env.S3_REGION ?? "auto",
      endpoint: env.S3_ENDPOINT,
      forcePathStyle: !!env.S3_ENDPOINT,
      credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY },
    });
  }

  async put(key: string, body: Buffer, contentType: string) {
    assertValidKey(key);
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: "AES256" }),
    );
  }

  async get(key: string) {
    assertValidKey(key);
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) return null;
      return { body: res.Body.transformToWebStream(), size: res.ContentLength ?? 0 };
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    assertValidKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async presignedUrl(key: string, expiresInSeconds: number, downloadName?: string) {
    assertValidKey(key);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(downloadName ? { ResponseContentDisposition: `attachment; filename="${downloadName.replace(/"/g, "")}"` } : {}),
      }),
      { expiresIn: expiresInSeconds },
    );
  }
}

let driver: StorageDriver | null = null;

export function storage(): StorageDriver {
  driver ??= env.STORAGE_PROVIDER === "s3" ? new S3Driver() : new LocalDriver();
  return driver;
}

/** Server-generated key: <org>/<area>/<uuid>.<ext>. The original filename is kept only in the database. */
export function buildStorageKey(organizationId: string | null, area: string, extension: string) {
  const ext = extension.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "bin";
  return `${organizationId ?? "platform"}/${area}/${crypto.randomUUID()}.${ext}`;
}

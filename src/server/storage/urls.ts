import "server-only";
import { hmac, safeEqual } from "@/server/auth/crypto";

const DEFAULT_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Signed, expiring URL for a stored file served through /api/files.
 * Possessing the URL grants read access until it expires, so only
 * issue them to users who are already authorized to see the file.
 */
export function signedFileUrl(key: string, ttlSeconds = DEFAULT_TTL_SECONDS, download?: string) {
  // Round expiry to the TTL window so the same URL is reused (and browser-cached) within it.
  const exp = Math.ceil(Date.now() / 1000 / ttlSeconds) * ttlSeconds + ttlSeconds;
  const sig = hmac(`file:${key}:${exp}:${download ?? ""}`);
  const params = new URLSearchParams({ exp: String(exp), sig });
  if (download) params.set("dl", download);
  return `/api/files/${key}?${params.toString()}`;
}

export function verifyFileSignature(key: string, exp: string | null, sig: string | null, download: string | null) {
  if (!exp || !sig) return false;
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires * 1000 < Date.now()) return false;
  return safeEqual(sig, hmac(`file:${key}:${expires}:${download ?? ""}`));
}

/** Convenience for optional keys (avatars, logos). */
export function fileUrl(key: string | null | undefined): string | null {
  return key ? signedFileUrl(key) : null;
}

import { NextResponse, type NextRequest } from "next/server";
import { storage, assertValidKey } from "@/server/storage";
import { verifyFileSignature } from "@/server/storage/urls";
import { db } from "@/server/db/client";

/** Serves a private file when the URL carries a valid, unexpired signature. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string[] }> }) {
  const { key: parts } = await params;
  const key = parts.join("/");
  try {
    assertValidKey(key);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }

  const sp = req.nextUrl.searchParams;
  const download = sp.get("dl");
  if (!verifyFileSignature(key, sp.get("exp"), sp.get("sig"), download)) {
    return new NextResponse("This link has expired. Refresh the page and try again.", { status: 403 });
  }

  const presigned = await storage().presignedUrl(key, 300, download ?? undefined);
  if (presigned) return NextResponse.redirect(presigned, 302);

  const object = await storage().get(key);
  if (!object) return new NextResponse("Not found", { status: 404 });

  const doc = await db.document.findUnique({ where: { storageKey: key }, select: { mimeType: true } });
  const contentType = doc?.mimeType ?? guessType(key);

  return new NextResponse(object.body, {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(object.size),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      // Never let uploaded content execute in our origin.
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
      "Content-Disposition": download
        ? `attachment; filename="${download.replace(/["\r\n]/g, "")}"`
        : contentType === "application/pdf" || contentType.startsWith("image/")
          ? "inline"
          : "attachment",
    },
  });
}

function guessType(key: string) {
  const ext = key.split(".").pop()?.toLowerCase();
  return (
    {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      webp: "image/webp",
      pdf: "application/pdf",
      csv: "text/csv",
      xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }[ext ?? ""] ?? "application/octet-stream"
  );
}

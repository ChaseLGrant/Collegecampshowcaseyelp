import "server-only";
import { AwsClient } from "aws4fetch";
import { storageConfigured } from "../env";

/**
 * Private, S3-compatible object storage for attendance proofs (Railway Storage Bucket).
 * Objects are never public: the author uploads through our API, moderators view
 * them through short-lived presigned URLs, and files are deleted after review.
 */
function client() {
  if (!storageConfigured()) throw new Error("Proof storage is not configured");
  return new AwsClient({
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    service: "s3",
    region: process.env.S3_REGION || "auto",
  });
}

function objectUrl(key: string): string {
  const endpoint = new URL(process.env.S3_ENDPOINT!);
  const bucket = process.env.S3_BUCKET!;
  const path = key.split("/").map(encodeURIComponent).join("/");
  // Railway buckets use virtual-host style; set S3_URL_STYLE=path for path-style providers.
  return process.env.S3_URL_STYLE === "path"
    ? `${endpoint.origin}/${bucket}/${path}`
    : `${endpoint.protocol}//${bucket}.${endpoint.host}/${path}`;
}

export async function putProof(key: string, body: Uint8Array, contentType: string): Promise<void> {
  // Sign first, then send the bytes directly so the request has a Content-Length (S3 rejects chunked PUTs).
  const signed = await client().sign(objectUrl(key), { method: "PUT", body: body as unknown as BodyInit, headers: { "content-type": contentType } });
  const res = await fetch(signed.url, { method: "PUT", headers: signed.headers, body: Buffer.from(body) });
  if (!res.ok) throw new Error(`Upload failed (${res.status})`);
}

export async function deleteProof(key: string): Promise<void> {
  const res = await client().fetch(objectUrl(key), { method: "DELETE" });
  if (!res.ok && res.status !== 404) throw new Error(`Delete failed (${res.status})`);
}

/** Short-lived signed GET link for moderators. */
export async function proofViewUrl(key: string, expiresSeconds = 600): Promise<string> {
  const url = new URL(objectUrl(key));
  url.searchParams.set("X-Amz-Expires", String(expiresSeconds));
  const signed = await client().sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

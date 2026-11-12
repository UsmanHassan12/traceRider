"use client";

import { useEffect, useState } from "react";
import { sb } from "./supabase";

/**
 * Proof photos live in the private Supabase Storage bucket "proof" (see
 * supabase/migrations/003_proof_photos.sql). A parcel only stores the file's path as "sb:<path>",
 * so loading the app no longer downloads every photo.
 * If the upload fails (no signal, bucket missing) the photo is kept inline as before,
 * so a delivery or return is never lost because of a photo.
 */

const BUCKET = "proof";
const PREFIX = "sb:";

function toBlob(dataUrl: string): Blob {
  const [head, b64] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(head)?.[1] ?? "image/jpeg";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

/** Uploads a captured photo and returns what to store on the parcel. */
export async function storeProof(parcelId: string, dataUrl: string | undefined): Promise<string | undefined> {
  if (!dataUrl || !dataUrl.startsWith("data:")) return dataUrl;
  try {
    const path = `${parcelId.replace(/[^A-Za-z0-9_-]/g, "")}/${Date.now()}.jpg`;
    const upload = sb().storage.from(BUCKET).upload(path, toBlob(dataUrl), { contentType: "image/jpeg", upsert: false });
    const timeout = new Promise<{ error: Error }>((resolve) => setTimeout(() => resolve({ error: new Error("timeout") }), 20000));
    const { error } = await Promise.race([upload, timeout]);
    if (error) throw error;
    return PREFIX + path;
  } catch {
    return dataUrl;
  }
}

const cache = new Map<string, { url: string; until: number }>();

/** Turns a stored photo value into something an <img> can show. */
export function usePhotoUrl(src: string | undefined): string | undefined {
  const isStored = !!src && src.startsWith(PREFIX);
  const [url, setUrl] = useState<string | undefined>(isStored ? cache.get(src!)?.url : src);
  useEffect(() => {
    if (!src || !src.startsWith(PREFIX)) {
      setUrl(src);
      return;
    }
    const hit = cache.get(src);
    if (hit && hit.until > Date.now()) {
      setUrl(hit.url);
      return;
    }
    let cancelled = false;
    sb()
      .storage.from(BUCKET)
      .createSignedUrl(src.slice(PREFIX.length), 3600)
      .then(({ data }: { data: { signedUrl: string } | null }) => {
        if (!data || cancelled) return;
        cache.set(src, { url: data.signedUrl, until: Date.now() + 50 * 60e3 });
        setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);
  return url;
}

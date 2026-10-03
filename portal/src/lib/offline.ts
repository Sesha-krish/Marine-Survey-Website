"use client";
// Device-side queue for the surveyor PWA. Answers → localStorage (small, sync);
// photo blobs → IndexedDB (large). Everything degrades to online-only if storage is unavailable.

export type QueuedPhoto = { key: string; surveyId: string; slot: string; blob: Blob; takenAt: string; lat: number | null; lng: number | null };

const DB = "msp-offline";
const STORE = "photos";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "key" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function queuePhoto(p: QueuedPhoto) {
  try {
    await tx("readwrite", (s) => s.put(p));
    return true;
  } catch {
    return false;
  }
}
export async function queuedPhotos(surveyId: string): Promise<QueuedPhoto[]> {
  try {
    const all = await tx<QueuedPhoto[]>("readonly", (s) => s.getAll() as IDBRequest<QueuedPhoto[]>);
    return all.filter((p) => p.surveyId === surveyId);
  } catch {
    return [];
  }
}
export async function dequeuePhoto(key: string) {
  try {
    await tx("readwrite", (s) => s.delete(key));
  } catch {
    /* ignore */
  }
}

export type LocalDraft = { answers: Record<string, unknown>; dirtyKeys: string[]; baseRevision: number; verdict?: string | null; verdictReason?: string | null; completionNotes?: string | null; savedAt: string };

export function loadLocal(surveyId: string): LocalDraft | null {
  try {
    const raw = localStorage.getItem(`survey:${surveyId}`);
    return raw ? (JSON.parse(raw) as LocalDraft) : null;
  } catch {
    return null;
  }
}
export function saveLocal(surveyId: string, d: LocalDraft) {
  try {
    localStorage.setItem(`survey:${surveyId}`, JSON.stringify(d));
    return true;
  } catch {
    return false;
  }
}
export function clearLocal(surveyId: string) {
  try {
    localStorage.removeItem(`survey:${surveyId}`);
  } catch {
    /* ignore */
  }
}

/** Downscale + re-encode on the device before upload/queueing (photos from phones are 4–12 MB). */
export async function compressImage(file: Blob, maxDim = 1600, quality = 0.8): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    return await new Promise((res) => canvas.toBlob((b) => res(b ?? file), "image/jpeg", quality));
  } catch {
    return file;
  }
}

export function currentPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 },
    );
  });
}

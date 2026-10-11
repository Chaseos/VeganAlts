import { DRAFT_TTL, type PhotoSlot } from "./product-draft";

/**
 * Photos picked for an unfinished product, kept in IndexedDB for a day.
 * Phones often reload the page after the camera opens, which would otherwise
 * lose them. Like the text draft, this is a convenience: when IndexedDB is
 * missing or blocked, photos are simply chosen again.
 */
const DATABASE = "veganalts-drafts",
  STORE = "photos";

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function transaction(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => void,
): Promise<void> {
  const db = await open();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      work(tx.objectStore(STORE));
      tx.oncomplete =
        tx.onerror =
        tx.onabort =
          () => {
            db.close();
            resolve();
          };
    } catch {
      db.close();
      resolve();
    }
  });
}

interface StoredPhoto {
  file: File;
  // The draft the photo was picked for; another draft never receives it.
  draftId: string;
  slot: PhotoSlot;
  savedAt: number;
}
// Keyed by draft and slot, so one draft's photo never replaces another's.
const photoKey = (draftId: string, slot: PhotoSlot) => `${draftId}:${slot}`;

export function saveDraftPhoto(
  draftId: string,
  slot: PhotoSlot,
  file: File | undefined,
) {
  return transaction("readwrite", (store) => {
    if (file)
      store.put(
        { file, draftId, slot, savedAt: Date.now() } satisfies StoredPhoto,
        photoKey(draftId, slot),
      );
    else store.delete(photoKey(draftId, slot));
  });
}

export async function loadDraftPhotos(draftId: string, now = Date.now()) {
  const photos: Partial<Record<PhotoSlot, File>> = {};
  const db = await open();
  if (!db) return photos;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const cursor = tx.objectStore(STORE).openCursor();
      cursor.onsuccess = () => {
        const row = cursor.result;
        if (!row) return;
        const stored = row.value as StoredPhoto;
        if (
          stored?.file instanceof Blob &&
          stored.draftId === draftId &&
          now - stored.savedAt <= DRAFT_TTL
        )
          photos[stored.slot] = stored.file;
        row.continue();
      };
      tx.oncomplete = tx.onerror = tx.onabort = () => resolve();
    } catch {
      resolve();
    }
  });
  db.close();
  return photos;
}

// Removes stored photos the predicate picks; others (another tab's draft)
// stay.
function removePhotos(pick: (stored: StoredPhoto | undefined) => boolean) {
  return transaction("readwrite", (store) => {
    const cursor = store.openCursor();
    cursor.onsuccess = () => {
      const row = cursor.result;
      if (!row) return;
      if (pick(row.value as StoredPhoto | undefined)) row.delete();
      row.continue();
    };
  });
}

/** Forgets one draft's photos. */
export function clearDraftPhotos(draftId: string) {
  return removePhotos((stored) => stored?.draftId === draftId);
}

/** Drops photos past the draft lifetime, or from before drafts had IDs. */
export function pruneDraftPhotos(now = Date.now()) {
  return removePhotos(
    (stored) =>
      !stored?.draftId || !stored.savedAt || now - stored.savedAt > DRAFT_TTL,
  );
}

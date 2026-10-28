import type { SongMeta, StemKind, StereoPCM } from "./types";

const DB_NAME = "kraoke";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("songs")) db.createObjectStore("songs", { keyPath: "id" });
        if (!db.objectStoreNames.contains("audio")) db.createObjectStore("audio");
        if (!db.objectStoreNames.contains("files")) db.createObjectStore("files");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function tx<T>(
  store: string,
  mode: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => resolve(req.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

/** Songs saved before lyrics became a separate step used a single status. */
function migrate(song: SongMeta | undefined): SongMeta | undefined {
  if (!song || song.lyricsStatus) return song;
  const legacy = song.status as string;
  if (legacy === "ready" || legacy === "transcribing")
    return { ...song, status: "separated", lyricsStatus: legacy === "ready" ? "ready" : "none" };
  return { ...song, lyricsStatus: "none" };
}

export const listSongs = async () =>
  (await tx<SongMeta[]>("songs", "readonly", (s) => s.getAll()))
    .map((s) => migrate(s)!)
    .sort((a, b) => b.createdAt - a.createdAt);

export const getSong = async (id: string) =>
  migrate(await tx<SongMeta | undefined>("songs", "readonly", (s) => s.get(id)));

export const putSong = (song: SongMeta) =>
  tx("songs", "readwrite", (s) => s.put(song));

export async function updateSong(id: string, patch: Partial<SongMeta>) {
  const song = await getSong(id);
  if (!song) throw new Error("Canción no encontrada");
  const next = { ...song, ...patch };
  await putSong(next);
  return next;
}

export const putFile = (id: string, file: Blob) =>
  tx("files", "readwrite", (s) => s.put(file, id));

export const getFile = (id: string) =>
  tx<Blob | undefined>("files", "readonly", (s) => s.get(id));

export const putStem = (id: string, kind: StemKind, pcm: StereoPCM) =>
  tx("audio", "readwrite", (s) => s.put(pcm, `${id}:${kind}`));

export const getStem = (id: string, kind: StemKind) =>
  tx<StereoPCM | undefined>("audio", "readonly", (s) => s.get(`${id}:${kind}`));

export async function deleteSong(id: string) {
  await tx("songs", "readwrite", (s) => s.delete(id));
  await tx("files", "readwrite", (s) => s.delete(id));
  for (const kind of ["original", "vocals", "instrumental"] as StemKind[]) {
    await tx("audio", "readwrite", (s) => s.delete(`${id}:${kind}`));
  }
}

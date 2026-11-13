/** 会话持久化：IndexedDB（刷新/关闭浏览器后可续学） */

import type { Session } from "./types";
import { normalizeSession } from "./sessionData";

const DB_NAME = "zixue-xiaozhan";
const DB_VERSION = 1;
const STORE = "sessions";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "id" });
          store.createIndex("updatedAt", "updatedAt");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const req = fn(t.objectStore(STORE));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export async function listSessions(): Promise<Session[]> {
  const all = await tx<unknown[]>("readonly", (s) => s.getAll() as IDBRequest<unknown[]>);
  return all
    .map(normalizeSession)
    .filter((session): session is Session => session !== null)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getSession(id: string): Promise<Session | undefined> {
  const raw = await tx<unknown>("readonly", (s) => s.get(id) as IDBRequest<unknown>);
  return normalizeSession(raw) ?? undefined;
}

export function putSession(session: Session): Promise<IDBValidKey> {
  return tx("readwrite", (s) => s.put(session));
}

export function deleteSession(id: string): Promise<undefined> {
  return tx("readwrite", (s) => s.delete(id) as IDBRequest<undefined>);
}

import type { Spike } from '../types/domain';

const DB_NAME = 'EcoSenseDB';
const DB_VERSION = 2;
const SPIKES_STORE = 'spikes';
const SESSIONS_STORE = 'sessions';

let dbPromise: IDBDatabase | null = null;

const openDB = (): Promise<IDBDatabase> => {
  if (dbPromise) return Promise.resolve(dbPromise);

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(SPIKES_STORE)) {
        const store = db.createObjectStore(SPIKES_STORE, { keyPath: 'id' });
        store.createIndex('expires_at', 'expires_at', { unique: false });
        store.createIndex('session_id', 'session_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = db.createObjectStore(SESSIONS_STORE, { keyPath: 'id' });
        store.createIndex('started_at', 'started_at', { unique: false });
        store.createIndex('type', 'type', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbPromise = (event.target as IDBOpenDBRequest).result;
      resolve(dbPromise);
    };
    request.onerror = (event) => reject(event);
  });
};

const idbRequest = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

export const saveSpikeWithBlob = async (
  spike: Spike,
  blob: Blob
): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(SPIKES_STORE, 'readwrite');
    const store = tx.objectStore(SPIKES_STORE);

    const record = {
      ...spike,
      blob,
      expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };

    await idbRequest(store.put(record));
  } catch (err) {
    console.error('IndexedDB 저장 실패:', err);
  }
};

export const cleanupExpiredSpikes = async (): Promise<number> => {
  let deletedCount = 0;

  try {
    const db = await openDB();
    const tx = db.transaction(SPIKES_STORE, 'readwrite');
    const store = tx.objectStore(SPIKES_STORE);
    const index = store.index('expires_at');

    return new Promise((resolve) => {
      const request = index.openCursor(IDBKeyRange.upperBound(Date.now()));
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>)
          .result;
        if (cursor) {
          cursor.delete();
          deletedCount++;
          cursor.continue();
        } else {
          resolve(deletedCount);
        }
      };
    });
  } catch (err) {
    console.warn('IndexedDB 정리 실패:', err);
    return 0;
  }
};

export const getSpikesBySession = async (sessionId: string): Promise<Spike[]> => {
  try {
    const db = await openDB();
    const tx = db.transaction(SPIKES_STORE, 'readonly');
    const store = tx.objectStore(SPIKES_STORE);
    const index = store.index('session_id');
    return await idbRequest(index.getAll(sessionId));
  } catch (err) {
    console.error('세션 스파이크 조회 실패:', err);
    return [];
  }
};

export const getSpikes = async (): Promise<Spike[]> => {
  try {
    const db = await openDB();
    const tx = db.transaction(SPIKES_STORE, 'readonly');
    const store = tx.objectStore(SPIKES_STORE);
    return await idbRequest(store.getAll());
  } catch (err) {
    console.error('스파이크 조회 실패:', err);
    return [];
  }
};

export const getRecordings = async (): Promise<(Spike & { blob: Blob })[]> => {
  try {
    const spikes = await getSpikes();
    return (spikes as Array<Spike & { blob?: Blob }>).filter(
      (spike): spike is Spike & { blob: Blob } =>
        spike.blob instanceof Blob && spike.blob.size > 0
    );
  } catch (err) {
    console.error('녹음 파일 조회 실패:', err);
    return [];
  }
};

export const saveSpikeMetadata = async (spike: Spike): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(SPIKES_STORE, 'readwrite');
    const store = tx.objectStore(SPIKES_STORE);

    const record = {
      ...spike,
      blob: new Blob(),
      expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000,
    };

    await idbRequest(store.put(record));
  } catch (err) {
    console.error('스파이크 메타데이터 저장 실패:', err);
  }
};

export const clearSpikes = async (): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(SPIKES_STORE, 'readwrite');
    const store = tx.objectStore(SPIKES_STORE);
    await idbRequest(store.clear());
  } catch (err) {
    console.error('스파이크 초기화 실패:', err);
    throw err;
  }
};

// ─── Sessions ─────────────────────────────────────────────

export interface SessionRecord {
  id: string;
  type: 'OUTDOOR' | 'INDOOR' | 'SLEEP';
  started_at: string;
  ended_at?: string;
  spike_count?: number;
}

export const saveSession = async (session: SessionRecord): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction(SESSIONS_STORE, 'readwrite');
    const store = tx.objectStore(SESSIONS_STORE);
    await idbRequest(store.put(session));
  } catch (err) {
    console.error('세션 저장 실패:', err);
  }
};

export const getSessions = async (): Promise<SessionRecord[]> => {
  try {
    const db = await openDB();
    const tx = db.transaction(SESSIONS_STORE, 'readonly');
    const store = tx.objectStore(SESSIONS_STORE);
    const index = store.index('started_at');
    return new Promise((resolve, reject) => {
      const results: SessionRecord[] = [];
      const request = index.openCursor(null, 'prev');
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          results.push(cursor.value as SessionRecord);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('세션 목록 조회 실패:', err);
    return [];
  }
};

export const deleteSessionFromDB = async (sessionId: string): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction([SESSIONS_STORE, SPIKES_STORE], 'readwrite');
    const sessionStore = tx.objectStore(SESSIONS_STORE);
    const spikesStore = tx.objectStore(SPIKES_STORE);
    const spikesIndex = spikesStore.index('session_id');

    // 세션에 속한 스파이크 ID 목록을 먼저 가져온 뒤 모두 삭제
    const spikes = await idbRequest(spikesIndex.getAll(sessionId));
    for (const spike of spikes) {
      await idbRequest(spikesStore.delete((spike as { id: string }).id));
    }
    await idbRequest(sessionStore.delete(sessionId));

    // 트랜잭션 완료 보장
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  } catch (err) {
    console.error('세션 삭제 실패:', err);
    throw err;
  }
};

export const clearAllSessions = async (): Promise<void> => {
  try {
    const db = await openDB();
    const tx = db.transaction([SESSIONS_STORE, SPIKES_STORE], 'readwrite');
    await idbRequest(tx.objectStore(SESSIONS_STORE).clear());
    await idbRequest(tx.objectStore(SPIKES_STORE).clear());

    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));
    });
  } catch (err) {
    console.error('전체 세션 초기화 실패:', err);
    throw err;
  }
};
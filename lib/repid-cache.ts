import { openDB, IDBPDatabase } from 'idb';

const DB_NAME = 'trinity-repid-cache';
const STORE_NAME = 'scores';
const PENDING_STORE = 'pending-updates';

export interface RepIDScore {
    agentId: string;
    score: number;
    tier: string;
    lastUpdated: number;
}

export interface PendingUpdate {
    id?: number;
    agentId: string;
    newScore: number;
    timestamp: number;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB() {
    if (!dbPromise) {
        dbPromise = openDB(DB_NAME, 1, {
            upgrade(db) {
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'agentId' });
                }
                if (!db.objectStoreNames.contains(PENDING_STORE)) {
                    db.createObjectStore(PENDING_STORE, { keyPath: 'id', autoIncrement: true });
                }
            },
        });
    }
    return dbPromise;
}

export async function cacheScore(score: RepIDScore) {
    const db = await getDB();
    await db.put(STORE_NAME, score);
}

export async function getCachedScore(agentId: string): Promise<RepIDScore | undefined> {
    const db = await getDB();
    return db.get(STORE_NAME, agentId);
}

export async function queueUpdate(update: PendingUpdate) {
    const db = await getDB();
    await db.add(PENDING_STORE, update);

    if (navigator.onLine) {
        await syncPendingUpdates();
    }
}

export async function syncPendingUpdates() {
    const db = await getDB();
    const tx = db.transaction(PENDING_STORE, 'readwrite');
    const store = tx.objectStore(PENDING_STORE);
    const updates = await store.getAll();

    for (const update of updates) {
        try {
            // Stub for Supabase/Web3 sync
            console.log('Syncing update to cloud:', update);
            // await supabase.from('repid_scores').upsert(...)

            await store.delete(update.id!);
        } catch (error) {
            console.error('Failed to sync update:', error);
        }
    }
    await tx.done;
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', syncPendingUpdates);
}

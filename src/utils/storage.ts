/**
 * IndexedDB storage for voiceprints with encrypted audio blob support.
 *
 * DB schema (v2):
 *   - "voiceprints" store: VoicePrint metadata (no large binary data)
 *   - "audioBlobs"  store: encrypted audio blobs keyed by voiceprint id
 *   - "keys"        store: persisted CryptoKey for AES-GCM encryption
 */
import type { VoicePrint } from '../types';

const DB_NAME = 'VocalTextDB';
const DB_VERSION = 3;
const VOICEPRINTS_STORE = 'voiceprints';
const AUDIO_BLOBS_STORE = 'audioBlobs';
const KEYS_STORE = 'keys';
const ENCRYPTION_KEY_ID = 'primary';
const VOICEBANK_DRAFTS_STORE = 'voicebankDrafts';

// ---------------------------------------------------------------------------
// Database
// ---------------------------------------------------------------------------

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;
      const oldVersion = event.oldVersion;

      // v1 -> v2 migration: the old "voiceprints" store may contain audioData.
      // We keep the store but will lazily strip audioData on next read/write.
      if (oldVersion < 1) {
        // Fresh install – create all stores
        db.createObjectStore(VOICEPRINTS_STORE, { keyPath: 'id' });
      }

      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains(AUDIO_BLOBS_STORE)) {
          db.createObjectStore(AUDIO_BLOBS_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(KEYS_STORE)) {
          db.createObjectStore(KEYS_STORE, { keyPath: 'id' });
        }
      }

      if (oldVersion < 3) {
        if (!db.objectStoreNames.contains(VOICEBANK_DRAFTS_STORE)) {
          db.createObjectStore(VOICEBANK_DRAFTS_STORE, { keyPath: 'id' });
        }
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ---------------------------------------------------------------------------
// Encryption helpers (Web Crypto API – AES-GCM 256-bit)
// ---------------------------------------------------------------------------

/** Generate a new AES-GCM 256-bit encryption key */
export async function generateEncryptionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    false, // not extractable – stays in IndexedDB
    ['encrypt', 'decrypt']
  );
}

/** Persist an encryption key in IndexedDB */
export async function storeEncryptionKey(key: CryptoKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEYS_STORE, 'readwrite');
    const store = tx.objectStore(KEYS_STORE);
    const request = store.put({ id: ENCRYPTION_KEY_ID, key });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Retrieve the persisted encryption key (or null if none exists) */
export async function getEncryptionKey(): Promise<CryptoKey | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(KEYS_STORE, 'readonly');
    const store = tx.objectStore(KEYS_STORE);
    const request = store.get(ENCRYPTION_KEY_ID);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.key : null);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Ensure an encryption key exists. Creates and stores one if missing.
 * This is called transparently by save/load functions.
 */
async function ensureEncryptionKey(): Promise<CryptoKey> {
  let key = await getEncryptionKey();
  if (!key) {
    key = await generateEncryptionKey();
    await storeEncryptionKey(key);
  }
  return key;
}

/** Encrypt a Blob with AES-GCM. Returns ciphertext and the random IV. */
export async function encryptBlob(
  blob: Blob,
  key: CryptoKey
): Promise<{ encrypted: ArrayBuffer; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = await blob.arrayBuffer();
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );
  return { encrypted, iv };
}

/** Decrypt an AES-GCM ciphertext back into a Blob */
export async function decryptBlob(
  encrypted: ArrayBuffer,
  iv: Uint8Array,
  key: CryptoKey
): Promise<Blob> {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    encrypted
  );
  return new Blob([decrypted], { type: 'audio/wav' });
}

// ---------------------------------------------------------------------------
// Helper: base64 <-> Uint8Array for IV serialisation
// ---------------------------------------------------------------------------

function uint8ToBase64(arr: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < arr.length; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    arr[i] = binary.charCodeAt(i);
  }
  return arr;
}

// ---------------------------------------------------------------------------
// Voiceprint CRUD (metadata only – no large blobs)
// ---------------------------------------------------------------------------

/**
 * Migrate a v1 voiceprint record that may still carry `audioData`.
 * Strips the field and sets `hasAudioBlob` appropriately.
 */
function migrateV1Record(record: any): VoicePrint {
  if ('audioData' in record) {
    const migrated: VoicePrint = {
      id: record.id,
      name: record.name,
      createdAt: record.createdAt,
      hasAudioBlob: false, // will become true once audio is re-saved
      duration: record.duration,
      frequencyProfile: record.frequencyProfile,
      averagePitch: record.averagePitch,
      language: record.language,
      cloudVoiceId: record.cloudVoiceId,
      encryptionIv: record.encryptionIv,
    };
    return migrated;
  }
  return record as VoicePrint;
}

/** Get all voiceprint metadata (no audio blobs loaded) */
export async function getAllVoicePrints(): Promise<VoicePrint[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOICEPRINTS_STORE, 'readonly');
    const store = tx.objectStore(VOICEPRINTS_STORE);
    const request = store.getAll();
    request.onsuccess = () => {
      const records: any[] = request.result;
      resolve(records.map(migrateV1Record));
    };
    request.onerror = () => reject(request.error);
  });
}

/** Get a single voiceprint by id */
export async function getVoicePrint(id: string): Promise<VoicePrint | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOICEPRINTS_STORE, 'readonly');
    const store = tx.objectStore(VOICEPRINTS_STORE);
    const request = store.get(id);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? migrateV1Record(result) : undefined);
    };
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save voiceprint metadata. If an audio Blob is provided it is encrypted and
 * stored in the separate audioBlobs store.
 */
export async function saveVoicePrint(
  voiceprint: VoicePrint,
  audioBlob?: Blob
): Promise<void> {
  const db = await openDB();

  if (audioBlob) {
    const key = await ensureEncryptionKey();
    const { encrypted, iv } = await encryptBlob(audioBlob, key);

    voiceprint = {
      ...voiceprint,
      hasAudioBlob: true,
      encryptionIv: uint8ToBase64(iv),
    };

    // Write both stores in a single transaction
    return new Promise((resolve, reject) => {
      const tx = db.transaction([VOICEPRINTS_STORE, AUDIO_BLOBS_STORE], 'readwrite');
      tx.objectStore(VOICEPRINTS_STORE).put(voiceprint);
      tx.objectStore(AUDIO_BLOBS_STORE).put({ id: voiceprint.id, encrypted });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  // Metadata-only update
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOICEPRINTS_STORE, 'readwrite');
    const store = tx.objectStore(VOICEPRINTS_STORE);
    const request = store.put(voiceprint);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Update a single field (or multiple fields) on an existing voiceprint record.
 * This performs a read-modify-write so callers don't need the full object.
 */
export async function updateVoicePrint(
  id: string,
  updates: Partial<Omit<VoicePrint, 'id'>>,
): Promise<VoicePrint | undefined> {
  const existing = await getVoicePrint(id);
  if (!existing) return undefined;

  const updated: VoicePrint = { ...existing, ...updates };

  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOICEPRINTS_STORE, 'readwrite');
    const store = tx.objectStore(VOICEPRINTS_STORE);
    const request = store.put(updated);
    request.onsuccess = () => resolve(updated);
    request.onerror = () => reject(request.error);
  });
}

/** Delete a voiceprint and its associated audio blob */
export async function deleteVoicePrint(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([VOICEPRINTS_STORE, AUDIO_BLOBS_STORE], 'readwrite');
    tx.objectStore(VOICEPRINTS_STORE).delete(id);
    tx.objectStore(AUDIO_BLOBS_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Audio blob retrieval (decrypted)
// ---------------------------------------------------------------------------

/** Load and decrypt the audio Blob for a voiceprint. Returns null if missing. */
export async function getAudioBlob(id: string): Promise<Blob | null> {
  const voiceprint = await getVoicePrint(id);
  if (!voiceprint || !voiceprint.hasAudioBlob || !voiceprint.encryptionIv) {
    return null;
  }

  const db = await openDB();
  const record: any = await new Promise((resolve, reject) => {
    const tx = db.transaction(AUDIO_BLOBS_STORE, 'readonly');
    const store = tx.objectStore(AUDIO_BLOBS_STORE);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  if (!record || !record.encrypted) {
    return null;
  }

  const key = await ensureEncryptionKey();
  const iv = base64ToUint8(voiceprint.encryptionIv);
  return decryptBlob(record.encrypted, iv, key);
}

// ---------------------------------------------------------------------------
// Voicebank draft recordings (IndexedDB instead of localStorage)
// ---------------------------------------------------------------------------

export interface VoicebankDraft {
  id: string; // always 'current'
  currentIndex: number;
  completedIndices: number[];
  /** Raw audio blobs keyed by prompt index */
  recordings: Record<number, ArrayBuffer>;
}

const VOICEBANK_DRAFT_ID = 'current';

/** Save voicebank recording draft to IndexedDB */
export async function saveVoicebankDraft(draft: Omit<VoicebankDraft, 'id'>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOICEBANK_DRAFTS_STORE, 'readwrite');
    const store = tx.objectStore(VOICEBANK_DRAFTS_STORE);
    store.put({ ...draft, id: VOICEBANK_DRAFT_ID });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Load voicebank recording draft from IndexedDB */
export async function getVoicebankDraft(): Promise<VoicebankDraft | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOICEBANK_DRAFTS_STORE, 'readonly');
    const store = tx.objectStore(VOICEBANK_DRAFTS_STORE);
    const request = store.get(VOICEBANK_DRAFT_ID);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

/** Delete voicebank recording draft */
export async function deleteVoicebankDraft(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(VOICEBANK_DRAFTS_STORE, 'readwrite');
    const store = tx.objectStore(VOICEBANK_DRAFTS_STORE);
    store.delete(VOICEBANK_DRAFT_ID);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ---------------------------------------------------------------------------
// Storage usage
// ---------------------------------------------------------------------------

/** Query storage usage via the Storage Manager API */
export async function getStorageUsage(): Promise<{ used: number; quota: number }> {
  if (navigator.storage && navigator.storage.estimate) {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage ?? 0,
      quota: estimate.quota ?? 0,
    };
  }
  return { used: 0, quota: 0 };
}

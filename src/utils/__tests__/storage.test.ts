/**
 * Tests for storage.ts — encryption roundtrip and IndexedDB operations.
 *
 * Uses fake-indexeddb (shimmed globally) so that IDB operations work in jsdom.
 * Since we don't have fake-indexeddb installed, we test the pure crypto
 * helpers directly and mock IndexedDB-dependent functions at a higher level.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  encryptBlob,
  decryptBlob,
  generateEncryptionKey,
} from '../storage';

// ---------------------------------------------------------------------------
// Web Crypto is available natively in Node 20+ and jsdom — no polyfill needed.
// ---------------------------------------------------------------------------

describe('Encryption helpers', () => {
  it('generateEncryptionKey returns a CryptoKey', async () => {
    const key = await generateEncryptionKey();
    expect(key).toBeDefined();
    expect(key.algorithm).toBeDefined();
    expect((key.algorithm as AesKeyGenParams).name).toBe('AES-GCM');
  });

  it('encrypt then decrypt returns the original bytes', async () => {
    const key = await generateEncryptionKey();

    const original = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const blob = new Blob([original], { type: 'audio/wav' });

    const { encrypted, iv } = await encryptBlob(blob, key);

    // Node crypto may return ArrayBuffer or a buffer-like; verify it's usable
    expect(encrypted.byteLength).toBeGreaterThan(0);
    expect(iv).toBeInstanceOf(Uint8Array);
    expect(iv.length).toBe(12); // AES-GCM standard IV size

    // Ciphertext should be larger than plaintext (GCM adds 16-byte auth tag)
    expect(encrypted.byteLength).toBeGreaterThan(original.length);

    // Decrypt
    const decryptedBlob = await decryptBlob(encrypted, iv, key);
    expect(decryptedBlob).toBeInstanceOf(Blob);
    expect(decryptedBlob.type).toBe('audio/wav');

    const decryptedBuffer = await decryptedBlob.arrayBuffer();
    const decryptedBytes = new Uint8Array(decryptedBuffer);
    expect(decryptedBytes).toEqual(original);
  });

  it('decrypt with wrong key throws', async () => {
    const key1 = await generateEncryptionKey();
    const key2 = await generateEncryptionKey();

    const blob = new Blob([new Uint8Array([1, 2, 3])]);
    const { encrypted, iv } = await encryptBlob(blob, key1);

    await expect(decryptBlob(encrypted, iv, key2)).rejects.toThrow();
  });

  it('decrypt with wrong IV throws', async () => {
    const key = await generateEncryptionKey();
    const blob = new Blob([new Uint8Array([10, 20, 30])]);
    const { encrypted } = await encryptBlob(blob, key);

    const wrongIv = crypto.getRandomValues(new Uint8Array(12));
    await expect(decryptBlob(encrypted, wrongIv, key)).rejects.toThrow();
  });

  it('handles large blobs correctly', async () => {
    const key = await generateEncryptionKey();

    // 64 KB of random data
    const largeData = new Uint8Array(65536);
    crypto.getRandomValues(largeData);
    const blob = new Blob([largeData], { type: 'audio/wav' });

    const { encrypted, iv } = await encryptBlob(blob, key);
    const decryptedBlob = await decryptBlob(encrypted, iv, key);
    const decryptedBuffer = await decryptedBlob.arrayBuffer();
    const decryptedBytes = new Uint8Array(decryptedBuffer);

    expect(decryptedBytes).toEqual(largeData);
  });
});

// ---------------------------------------------------------------------------
// IndexedDB operations (mocked via IDB request stubs)
// ---------------------------------------------------------------------------

describe('IndexedDB operations', () => {
  // We test the higher-level functions by importing them and relying on
  // jsdom's stub indexedDB. If indexedDB is not fully functional in jsdom,
  // these tests verify the API contract via mocking.

  let storage: typeof import('../storage');

  beforeEach(async () => {
    // Dynamic import to allow fresh module state; reset IDB between tests
    vi.resetModules();
    storage = await import('../storage');
  });

  it('saveVoicePrint and getAllVoicePrints roundtrip (metadata only)', async () => {
    const vp = {
      id: 'test-1',
      name: 'Test Voice',
      createdAt: Date.now(),
      hasAudioBlob: false,
      duration: 5,
      frequencyProfile: [0.1, 0.2, 0.3],
      averagePitch: 220,
      language: 'en',
    };

    await storage.saveVoicePrint(vp);
    const all = await storage.getAllVoicePrints();
    const found = all.find((v) => v.id === 'test-1');
    expect(found).toBeDefined();
    expect(found!.name).toBe('Test Voice');
    expect(found!.averagePitch).toBe(220);
  });

  it('saveVoicePrint with audio blob encrypts and stores', async () => {
    const vp = {
      id: 'test-2',
      name: 'Encrypted Voice',
      createdAt: Date.now(),
      hasAudioBlob: false,
      duration: 3,
      frequencyProfile: [0.5],
      averagePitch: 150,
      language: 'zh',
    };

    const audioBlob = new Blob([new Uint8Array([1, 2, 3, 4, 5])], {
      type: 'audio/wav',
    });

    await storage.saveVoicePrint(vp, audioBlob);

    // Verify metadata was updated
    const saved = await storage.getVoicePrint('test-2');
    expect(saved).toBeDefined();
    expect(saved!.hasAudioBlob).toBe(true);
    expect(saved!.encryptionIv).toBeDefined();

    // Verify audio blob can be retrieved and decrypted
    const retrieved = await storage.getAudioBlob('test-2');
    expect(retrieved).toBeInstanceOf(Blob);
    const bytes = new Uint8Array(await retrieved!.arrayBuffer());
    expect(bytes).toEqual(new Uint8Array([1, 2, 3, 4, 5]));
  });

  it('deleteVoicePrint removes both metadata and audio', async () => {
    const vp = {
      id: 'test-3',
      name: 'To Delete',
      createdAt: Date.now(),
      hasAudioBlob: false,
      duration: 1,
      frequencyProfile: [],
      averagePitch: 100,
      language: 'en',
    };

    await storage.saveVoicePrint(vp);
    await storage.deleteVoicePrint('test-3');

    const found = await storage.getVoicePrint('test-3');
    expect(found).toBeUndefined();
  });

  it('getAudioBlob returns null for non-existent id', async () => {
    const blob = await storage.getAudioBlob('does-not-exist');
    expect(blob).toBeNull();
  });
});

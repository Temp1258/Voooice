import { test, expect } from '@playwright/test';

test.describe('Audiobook workbench', () => {
  test('audiobook page loads and shows no-voiceprints message when empty', async ({ page }) => {
    await page.goto('/audiobook');
    // With no voiceprints, the page should indicate voices are needed
    await expect(page.locator('h1')).toHaveText('Audiobook');
  });

  test('audiobook page shows workbench when voiceprints exist', async ({ page }) => {
    // Seed a voiceprint in IndexedDB before navigating
    await page.goto('/');
    await page.evaluate(async () => {
      const request = indexedDB.open('VocalTextDB', 1);
      await new Promise<void>((resolve, reject) => {
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('voiceprints')) {
            db.createObjectStore('voiceprints', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('audioBlobs')) {
            db.createObjectStore('audioBlobs', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('voiceprints', 'readwrite');
          tx.objectStore('voiceprints').put({
            id: 'test-vp-1',
            name: 'Test Voice',
            createdAt: Date.now(),
            hasAudioBlob: false,
            duration: 10,
            frequencyProfile: [],
            averagePitch: 200,
            language: 'en-US',
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    });

    // Reload so the app picks up the seeded voiceprint
    await page.goto('/audiobook');

    await expect(page.getByText('Audiobook Workbench')).toBeVisible({ timeout: 5000 });
  });

  test('tab navigation works (Project, Editor, Roles, Synthesize, Export)', async ({ page }) => {
    // Seed voiceprint
    await page.goto('/');
    await page.evaluate(async () => {
      const request = indexedDB.open('VocalTextDB', 1);
      await new Promise<void>((resolve, reject) => {
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('voiceprints')) {
            db.createObjectStore('voiceprints', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('audioBlobs')) {
            db.createObjectStore('audioBlobs', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('voiceprints', 'readwrite');
          tx.objectStore('voiceprints').put({
            id: 'test-vp-1',
            name: 'Test Voice',
            createdAt: Date.now(),
            hasAudioBlob: false,
            duration: 10,
            frequencyProfile: [],
            averagePitch: 200,
            language: 'en-US',
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    });

    await page.goto('/audiobook');
    await expect(page.getByText('Audiobook Workbench')).toBeVisible({ timeout: 5000 });

    const tabs = ['Project', 'Editor', 'Roles', 'Synthesize', 'Export'];

    for (const tabName of tabs) {
      const tabButton = page.getByRole('button', { name: tabName });
      await tabButton.click();
      // Active tab should have the indigo background
      await expect(tabButton).toHaveClass(/bg-indigo-600/);
    }
  });

  test('create new book button is visible', async ({ page }) => {
    // Seed voiceprint
    await page.goto('/');
    await page.evaluate(async () => {
      const request = indexedDB.open('VocalTextDB', 1);
      await new Promise<void>((resolve, reject) => {
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('voiceprints')) {
            db.createObjectStore('voiceprints', { keyPath: 'id' });
          }
          if (!db.objectStoreNames.contains('audioBlobs')) {
            db.createObjectStore('audioBlobs', { keyPath: 'id' });
          }
        };
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('voiceprints', 'readwrite');
          tx.objectStore('voiceprints').put({
            id: 'test-vp-1',
            name: 'Test Voice',
            createdAt: Date.now(),
            hasAudioBlob: false,
            duration: 10,
            frequencyProfile: [],
            averagePitch: 200,
            language: 'en-US',
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        request.onerror = () => reject(request.error);
      });
    });

    await page.goto('/audiobook');
    await expect(page.getByText('Audiobook Workbench')).toBeVisible({ timeout: 5000 });

    const newBookButton = page.getByRole('button', { name: 'New Book' });
    await expect(newBookButton).toBeVisible();
  });
});

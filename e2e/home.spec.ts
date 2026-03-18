import { test, expect } from '@playwright/test';

test.describe('Home page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads with Voooice title', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Voooice');
  });

  test('tab bar navigation works', async ({ page }) => {
    const tabs = [
      { label: 'Home', path: '/' },
      { label: 'Record', path: '/record' },
      { label: 'Live', path: '/realtime' },
      { label: 'Voiceprints', path: '/voiceprints' },
      { label: 'Speak', path: '/speak' },
    ];

    for (const tab of tabs) {
      const button = page.locator('nav[role="navigation"]').getByLabel(tab.label);
      await button.click();
      await expect(page).toHaveURL(tab.path);
    }
  });

  test('settings gear icon navigates to settings', async ({ page }) => {
    await page.getByLabel('Settings').click();
    await expect(page).toHaveURL('/settings');
    await expect(page.locator('h1')).toHaveText('Settings');
  });

  test('back button returns to home', async ({ page }) => {
    // Navigate away from home first
    await page.getByLabel('Settings').click();
    await expect(page).toHaveURL('/settings');

    // Click back button
    await page.getByLabel('Back').click();
    await expect(page).toHaveURL('/');
    await expect(page.locator('h1')).toHaveText('Voooice');
  });

  test('creative tools section is hidden when no voiceprints exist', async ({ page }) => {
    await expect(page.getByText('Creative Tools')).not.toBeVisible();
  });

  test('advanced features section is visible', async ({ page }) => {
    await expect(page.getByText('Advanced Features')).toBeVisible();
  });
});

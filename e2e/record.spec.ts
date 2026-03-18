import { test, expect } from '@playwright/test';

test.describe('Record page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/record');
  });

  test('record page loads with correct title and description', async ({ page }) => {
    await expect(page.locator('h1')).toHaveText('Record Voice');
    await expect(page.getByText('Ready')).toBeVisible();
  });

  test('displays timer at 00:00 initially', async ({ page }) => {
    await expect(page.getByText('00:00')).toBeVisible();
  });

  test('microphone permission handling - grant access and record', async ({ page, context }) => {
    // Grant microphone permission
    await context.grantPermissions(['microphone']);

    // The record button (mic icon inside a large red circle) should be visible
    const recordButton = page.locator('button.bg-red-500').first();
    await expect(recordButton).toBeVisible();
  });

  test('record button states transition from idle to recording', async ({ page, context }) => {
    await context.grantPermissions(['microphone']);

    // Initial state: "Ready" text visible
    await expect(page.getByText('Ready')).toBeVisible();

    // Click the record button to start recording
    const recordButton = page.locator('button.bg-red-500').first();
    await recordButton.click();

    // Should transition to recording state
    await expect(page.getByText('Recording...')).toBeVisible({ timeout: 5000 });

    // The stop button (square icon) should now be visible
    const stopButton = page.locator('button.bg-red-500').first();
    await stopButton.click();

    // After stopping, should show either "Processing..." or "Recording Complete"
    await expect(
      page.getByText('Processing...').or(page.getByText('Recording Complete'))
    ).toBeVisible({ timeout: 10000 });
  });

  test('back button navigates to home from record page', async ({ page }) => {
    await page.getByLabel('Back').click();
    await expect(page).toHaveURL('/');
  });
});

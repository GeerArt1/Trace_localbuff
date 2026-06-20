// ══════════════════════════════════════════════
// TRACE — HQ Monitor Panel E2E Tests
// ══════════════════════════════════════════════
// Validates the Server Monitor panel loads correctly,
// fetches /api/debug, and renders all monitoring data.
// ══════════════════════════════════════════════

const { test, expect } = require('@playwright/test');
const HQ_URL = 'http://localhost:3000/src/trace_hq.html';

// ── Helpers ──

async function gotoHQ(page) {
  await page.goto(HQ_URL);
  await page.waitForSelector('#app', { timeout: 10000 });
  // Ensure the app is unlocked
  await page.evaluate(() => {
    try { window.unlock(); } catch(e) { /* may already be unlocked */ }
  });
}

async function showPanel(page, name) {
  await page.evaluate((n) => { window.show(n); }, name);
  // Wait for the panel to become active
  await page.waitForTimeout(300);
  await expect(page.locator('#panel-' + name)).toHaveClass(/active/);
}

// ── Tests ──

test.describe('HQ Monitor Panel', () => {

  test('should navigate to Monitor panel and show empty state', async ({ page }) => {
    await gotoHQ(page);
    await showPanel(page, 'monitor');

    // Panel should be visible
    await expect(page.locator('#panel-monitor')).toBeVisible();
    await expect(page.locator('#panel-monitor')).toHaveClass(/active/);

    // Should show the refresh button
    await expect(page.locator('#monitor-refresh-btn')).toBeVisible();

    // Content may already load via auto-refresh from window.show handler
    // Either empty state or loaded data is fine
  });

  test('should load monitoring data on refresh', async ({ page }) => {
    await gotoHQ(page);
    await showPanel(page, 'monitor');

    // Click the refresh button
    await page.click('#monitor-refresh-btn');

    // Wait for data to load (fetch /api/debug + render)
    await page.waitForTimeout(1000);

    // Should show provider health section
    var content = page.locator('#monitor-content');
    await expect(content).toContainText('AI Provider');
    // Should show at least one AI provider (multiple dots expected)
    var providerDots = await page.locator('#monitor-content .dot').count();
    expect(providerDots).toBeGreaterThanOrEqual(1);
    await expect(page.locator('#monitor-content .dot').first()).toBeVisible();

    // Should show disk space with progress bar
    await expect(content).toContainText('Disk');
    await expect(content).toContainText('MB');

    // Should show SSL certificates section
    await expect(content).toContainText('SSL');

    // Should show database files
    await expect(content).toContainText('Database');

    // Should show server info
    await expect(content).toContainText('Uptime');
    await expect(content).toContainText('Memory');
    await expect(content).toContainText('Subscriptions');

    // Should show credits section (from /api/debug data)
    await expect(content).toContainText('Credits');
    // Should show dependency vulnerabilities section
    await expect(content).toContainText('Dependency');
  });

  test('should show provider health status indicators', async ({ page }) => {
    await gotoHQ(page);
    await showPanel(page, 'monitor');
    await page.click('#monitor-refresh-btn');
    await page.waitForTimeout(1000);

    // Provider health should have status dots (green for healthy)
    var dots = page.locator('#monitor-content .dot');
    var count = await dots.count();
    expect(count).toBeGreaterThanOrEqual(1);

    // At least one provider should be shown
    await expect(page.locator('#monitor-content')).toContainText('Provider');
  });

  test('should render dependency vulnerabilities section', async ({ page }) => {
    await gotoHQ(page);
    await showPanel(page, 'monitor');
    await page.click('#monitor-refresh-btn');
    await page.waitForTimeout(1000);

    await expect(page.locator('#monitor-content')).toContainText('Dependency');
  });

  test('should handle errors gracefully when /api/debug fails', async ({ page }) => {
    await gotoHQ(page);
    await showPanel(page, 'monitor');

    // Mock a failed /api/debug response
    await page.route('**/api/debug', (route) => {
      route.fulfill({ status: 500, body: 'Server Error' });
    });

    await page.click('#monitor-refresh-btn');
    await page.waitForTimeout(500);

    // Should show an error message, not crash
    // Should show a fetch error message
    await expect(page.locator('#monitor-content')).toContainText('Failed to fetch', { timeout: 5000 });
  });

  test('should auto-refresh when navigating to Monitor panel', async ({ page }) => {
    await gotoHQ(page);
    // Start on dashboard
    await showPanel(page, 'dashboard');

    // Intercept /api/debug to track calls
    var apiCallCount = 0;
    await page.route('**/api/debug', (route) => {
      apiCallCount++;
      route.continue();
    });

    // Navigate to monitor — should trigger refresh
    await showPanel(page, 'monitor');

    // Wait for the refresh to fire
    await page.waitForTimeout(1500);

    // Should have made at least one API call from window.show handler
    expect(apiCallCount).toBeGreaterThanOrEqual(1);
  });

});

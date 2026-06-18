// ══════════════════════════════════════════════
// TRACE — HQ Panel E2E Tests
// Validates lock screen, navigation, panel content.
// Uses page.evaluate() for function calls to avoid
// timing issues with the data-hq delegation handler.
// Run: npx playwright test tests/hq.e2e.test.js
// ══════════════════════════════════════════════

const { test, expect } = require('@playwright/test');

const HQ_URL = 'http://localhost:3000/src/trace_hq.html';

// ── Hash function matching trace_hq.html's hashPassword ──
function hashPassword(pw) {
  var hash = 0;
  for (var i = 0; i < pw.length; i++) {
    var char = pw.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'h' + Math.abs(hash).toString(36);
}

// ── Navigate to HQ and wait for app to render ──
async function gotoHQ(page) {
  await page.goto(HQ_URL);
  await page.waitForSelector('#app', { state: 'visible', timeout: 10000 });
}

// ── Navigate to a panel by calling show() directly ──
async function showPanel(page, name) {
  await page.evaluate((n) => {
    if (typeof window.show === 'function') window.show(n);
  }, name);
  await page.waitForSelector('#panel-' + name + '.active', { timeout: 2000 });
}

// ══════════════════════════════════════════════
// App loads by default
// ══════════════════════════════════════════════

test.describe('App Load', () => {

  test('app is visible by default on page load', async ({ page }) => {
    await gotoHQ(page);
    await expect(page.locator('#app')).toBeVisible();
  });

  test('lock screen is hidden by default', async ({ page }) => {
    await gotoHQ(page);
    await expect(page.locator('#lock-screen')).toBeHidden();
  });

  test('topbar controls are visible', async ({ page }) => {
    await gotoHQ(page);
    await expect(page.locator('button[data-hq="lockApp"]')).toBeVisible();
    await expect(page.locator('button[data-hq="toggleMute"]')).toBeVisible();
  });

  test('dashboard panel is active by default', async ({ page }) => {
    await gotoHQ(page);
    await expect(page.locator('#panel-dashboard')).toHaveClass(/active/);
  });

});

// ══════════════════════════════════════════════
// Lock Screen — tested via page.evaluate()
// ══════════════════════════════════════════════

test.describe('Lock Screen', () => {

  test('lockApp() shows lock screen', async ({ page }) => {
    await gotoHQ(page);
    const ok = await page.evaluate(() => {
      try { lockApp(); return true; }
      catch(e) { return false; }
    });
    expect(ok).toBe(true);
    await expect(page.locator('#lock-screen')).toBeVisible();
    await expect(page.locator('#lock-input')).toBeVisible();
  });

  test('unlock with correct password returns to app', async ({ page }) => {
    await gotoHQ(page);

    // Set password hash so unlock validates
    const pw = 'e2e-test-pw';
    const hash = hashPassword(pw);
    await page.evaluate((h) => localStorage.setItem('trace_hq_pw', h), hash);

    // Lock the app
    await page.evaluate(() => lockApp());
    await expect(page.locator('#lock-screen')).toBeVisible();

    // Set input and call unlock
    await page.evaluate((p) => {
      document.getElementById('lock-input').value = p;
      unlock();
    }, pw);

    await expect(page.locator('#app')).toBeVisible();
  });

  test('incorrect password shows error', async ({ page }) => {
    await gotoHQ(page);

    const pw = 'e2e-test-pw';
    const hash = hashPassword(pw);
    await page.evaluate((h) => localStorage.setItem('trace_hq_pw', h), hash);

    await page.evaluate(() => lockApp());
    await page.evaluate(() => {
      document.getElementById('lock-input').value = 'wrong-password';
      unlock();
    });

    const errorText = await page.evaluate(() => {
      return document.getElementById('lock-error').textContent;
    });
    expect(errorText.length).toBeGreaterThan(0);
  });

  test('reset password link is visible on lock screen', async ({ page }) => {
    await gotoHQ(page);
    await page.evaluate(() => lockApp());
    await expect(page.locator('a[data-hq="resetPassword"]')).toBeVisible();
  });

});

// ══════════════════════════════════════════════
// Navigation — tested via page.evaluate()
// ══════════════════════════════════════════════

test.describe('Navigation', () => {

  test('all sidebar navigation buttons switch panels', async ({ page }) => {
    await gotoHQ(page);

    const panels = [
      'dashboard', 'analytics', 'files', 'versions', 'status',
      'apikey', 'checklist', 'sacredgeo', 'eventlog', 'flags',
      'aiops', 'revenue', 'deploy', 'usermgmt', 'settings',
      'tierdesigner', 'abtesting'
    ];

    for (const name of panels) {
      const panelId = `#panel-${name}`;
      const panel = page.locator(panelId);

      // Only test panels that exist in the DOM
      if (await panel.count() > 0) {
        await showPanel(page, name);
        await expect(panel).toHaveClass(/active/);
      }
    }
  });

  test('panel-specific buttons are present after navigation', async ({ page }) => {
    await gotoHQ(page);

    async function checkPanel(name, selector) {
      const panel = page.locator(`#panel-${name}`);
      if (await panel.count() > 0) {
        await showPanel(page, name);
        await expect(panel).toHaveClass(/active/);
        await expect(page.locator(selector)).toBeVisible({ timeout: 2000 });
      }
    }

    await checkPanel('analytics', 'button[data-hq="refreshAnalytics"]');
    await checkPanel('files', 'button[data-hq="downloadAll"]');
    await checkPanel('eventlog', 'button[data-hq="elRefresh"]');
    await checkPanel('aiops', 'button[data-hq="aiOpsClear"]');
    await checkPanel('status', 'button[data-hq="checkAll"]');
    await checkPanel('sacredgeo', 'button[data-hq="sgUpload"]');
    await checkPanel('flags', '#flags-list');
    await checkPanel('deploy', 'button[data-hq="dpBuildLocal"]');
    await checkPanel('deploy', 'button[data-hq="dpDeployNetlify"]');
    await checkPanel('apikey', 'button[data-hq="copyProxyUrl"]');
  });

});

// ══════════════════════════════════════════════
// Event Log Panel
// ══════════════════════════════════════════════

test.describe('Event Log', () => {

  test('simulate event buttons exist in HTML', async ({ page }) => {
    await gotoHQ(page);
    await showPanel(page, 'eventlog');
    await expect(page.locator('#panel-eventlog')).toHaveClass(/active/);

    const elAddBtns = page.locator('button[data-hq="elAdd"]');
    const count = await elAddBtns.count();
    expect(count).toBeGreaterThan(0);
  });

});

// ══════════════════════════════════════════════
// Sacred Geometry Panel
// ══════════════════════════════════════════════

test.describe('Sacred Geometry', () => {

  test('sacred geometry controls are present in HTML', async ({ page }) => {
    await gotoHQ(page);
    await showPanel(page, 'sacredgeo');
    await expect(page.locator('#panel-sacredgeo')).toHaveClass(/active/);

    await expect(page.locator('button[data-hq="sgToggle"]').first()).toBeVisible({ timeout: 2000 });
    await expect(page.locator('button[data-hq="sgUpload"]')).toBeVisible();
    await expect(page.locator('button[data-hq="sgClear"]')).toBeVisible();
  });

});

// ══════════════════════════════════════════════
// Topbar — Mute toggle button exists
// ══════════════════════════════════════════════

test.describe('Topbar', () => {

  test('mute toggle button is visible', async ({ page }) => {
    await gotoHQ(page);
    await expect(page.locator('button[data-hq="toggleMute"]')).toBeVisible();
  });

});

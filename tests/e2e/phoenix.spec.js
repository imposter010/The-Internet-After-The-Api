import { test, expect } from '@playwright/test';

const gatewayToken = 'e2e-gateway-admin-token';
const providerToken = 'e2e-provider-admin-token';
const gatewayHeaders = { Authorization: `Bearer ${gatewayToken}` };
const providerHeaders = { Authorization: `Bearer ${providerToken}` };
const gateway = 'http://127.0.0.1:8000';
const provider = 'http://127.0.0.1:8001';

test.beforeEach(async ({ request }) => {
  await request.post(`${provider}/admin/reset`, { headers: providerHeaders });
  const snapshot = await request.get(`${gateway}/admin/snapshot`, { headers: gatewayHeaders });
  expect(snapshot.ok()).toBeTruthy();
  await expect.poll(async () => {
    const data = await (await request.get(`${gateway}/admin/snapshot`, { headers: gatewayHeaders })).json();
    return data.incidents.filter(i => ['detecting', 'validating'].includes(i.status)).length;
  }).toBe(0);
  expect((await request.post(`${gateway}/admin/reset`, { headers: gatewayHeaders, data: { confirm: 'RESET' } })).ok()).toBeTruthy();
  expect((await request.post(`${gateway}/admin/probe`, { headers: gatewayHeaders })).ok()).toBeTruthy();
});

test('provider control causes real drift, client recovers, and dashboard carries proof', async ({ browser, request }, testInfo) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(({ gatewayToken, providerToken }) => {
    if (location.port === '5173') sessionStorage.setItem('phoenix.gateway.token', gatewayToken);
    if (location.port === '8001') sessionStorage.setItem('phoenix.provider.token', providerToken);
  }, { gatewayToken, providerToken });
  const dashboard = await context.newPage();
  const consoleErrors = [];
  dashboard.on('pageerror', error => consoleErrors.push(error.message));
  await dashboard.goto('http://127.0.0.1:5173');
  await expect(dashboard.getByText('Live updates', { exact: true })).toBeVisible();
  await expect(dashboard.getByRole('heading', { name: 'Connected services' })).toBeVisible();
  const shop = await context.newPage();
  const externalRequests = [];
  shop.on('request', req => { if (req.url().startsWith(provider)) externalRequests.push(req.url()); });
  shop.on('pageerror', error => consoleErrors.push(error.message));
  await shop.goto('http://127.0.0.1:5174');
  await expect(shop.getByTestId('checkout-button')).toBeEnabled();
  await expect(shop.getByTestId('endpoint-customer')).toContainText('Rahul Sharma');
  await expect(shop.getByTestId('endpoint-shipping')).toContainText('3 days');
  await shop.getByTestId('checkout-button').click();
  await expect(shop.getByRole('dialog')).toContainText('₹942.82');
  await shop.getByRole('button', { name: 'Back to ShopFlow' }).click();

  const providerPage = await context.newPage();
  providerPage.on('pageerror', error => consoleErrors.push(error.message));
  await providerPage.goto('http://127.0.0.1:8001/provider');
  await expect(providerPage.getByLabel('Choose behavior').first()).toBeEnabled();
  await providerPage.locator('#scenario-customer').selectOption('rename');
  await providerPage.locator('.scenario-card').filter({ has: providerPage.getByRole('heading', { name: 'Customer API', exact: true }) }).getByRole('button', { name: /Apply scenario/ }).click();
  await expect(providerPage.getByRole('status')).toContainText('customer scenario updated');
  await shop.getByRole('button', { name: 'Refresh checks' }).click();
  await expect(shop.getByTestId('endpoint-customer')).toContainText('Stale');
  await expect(shop.getByTestId('checkout-button')).toBeDisabled();
  await expect.poll(async () => {
    const data = await (await request.get(`${gateway}/admin/snapshot`, { headers: gatewayHeaders })).json();
    return data.passports.some(p => p.endpointId === 'customer' && p.decision === 'activated');
  }, { timeout: 20000 }).toBeTruthy();
  await expect(shop.getByTestId('endpoint-customer')).toContainText('Recovered', { timeout: 15000 });
  await expect(shop.getByTestId('checkout-button')).toBeEnabled();
  await dashboard.getByRole('link', { name: 'Repairs & passports' }).click();
  await expect(dashboard.locator('.passport-card')).toHaveCount(1);
  await dashboard.locator('.passport-card').click();
  await expect(dashboard.getByRole('dialog')).toContainText('Independent live HTTP probes');
  await expect(dashboard.getByRole('dialog')).toContainText('Final deployment probe');
  await dashboard.getByRole('button', { name: 'Close dialog' }).click();
  await dashboard.getByRole('link', { name: 'Overview', exact: true }).click();
  await dashboard.screenshot({ path: '.cache/screenshots/dashboard.png', fullPage: true });
  await shop.screenshot({ path: '.cache/screenshots/shopflow.png', fullPage: true });
  await providerPage.screenshot({ path: '.cache/screenshots/provider.png', fullPage: true });
  await testInfo.attach('dashboard', { path: '.cache/screenshots/dashboard.png', contentType: 'image/png' });
  expect(externalRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test('unsafe price freezes checkout and healthy upstream restores it on mobile', async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:5174');
  await expect(page.getByTestId('checkout-button')).toBeEnabled();
  await request.post(`${provider}/admin/scenario`, { headers: providerHeaders, data: { endpointId: 'pricing', scenario: 'semantic' } });
  await page.getByRole('button', { name: 'Refresh checks' }).click();
  await expect(page.getByRole('alert').first()).toContainText('Checkout is paused');
  await expect(page.getByTestId('checkout-button')).toBeDisabled();
  await expect(page.locator('.product-price')).toContainText('₹799.00');
  const checkout = await request.post(`${gateway}/api/checkout`, { data: { quantity: 1 } });
  expect(checkout.status()).toBe(409);
  const data = await (await request.get(`${gateway}/admin/snapshot`, { headers: gatewayHeaders })).json();
  expect(data.passports.some(p => p.decision === 'blocked')).toBeTruthy();
  expect(data.adapters.filter(a => a.endpointId === 'pricing' && a.status === 'active')).toHaveLength(0);
  await page.screenshot({ path: '.cache/screenshots/shopflow-mobile-blocked.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await request.post(`${provider}/admin/reset`, { headers: providerHeaders });
  await page.getByRole('button', { name: 'Refresh checks' }).click();
  await expect(page.getByTestId('checkout-button')).toBeEnabled();
  expect(errors).toEqual([]);
});

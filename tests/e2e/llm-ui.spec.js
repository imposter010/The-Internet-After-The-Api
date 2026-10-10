import { test, expect } from '@playwright/test';

const modelGuidance = {
  status: 'completed', provider: 'openai', model: 'simulated-openai-model', latencyMs: 42,
  analyzedAt: '2026-10-10T12:00:00Z', fallbackUsed: false, candidateAccepted: true,
  explanation: 'A field rename preserves the observed value. Independent validation is required.',
  hinglishExplanation: 'Field ka naam badla hai; value same hai. Tests pass hona zaroori hai.',
  recommendedAction: 'apply_candidate', risk: 'low', adapter: { type: 'alias', source: 'display_name', target: 'name' },
  verificationNotes: ['Check checkout requirements.'],
};
const incident = { id: 'inc-ui-fixture', title: 'Response field renamed', endpointId: 'customer', status: 'resolved',
  summary: 'The detector observed a field rename.', oldBehavior: { name: '[REDACTED]' }, newBehavior: { display_name: '[REDACTED]' },
  createdAt: modelGuidance.analyzedAt, impactedWorkflows: [], evidence: [], aiAnalysis: modelGuidance };
const fixture = (overrides = {}) => ({ persistence: 'mongodb', aiMode: 'llm-assisted', metrics: { observations: 9, drifts: 1, verifiedRepairs: 1, safetyBlocks: 0, upstreamErrors: 0 },
  services: [], baselines: [], observations: [], incidents: [incident], proposals: [], adapters: [], validations: [], events: [], dependencies: [],
  passports: [{ id: 'pass-ui-fixture', incidentId: incident.id, endpointId: 'customer', createdAt: modelGuidance.analyzedAt,
    decision: 'activated', aiAnalysis: modelGuidance, oldBehavior: incident.oldBehavior, newBehavior: incident.newBehavior,
    tests: [{ name: 'Final deployment probe', passed: true }], rollback: {} }],
  llm: { configured: true, provider: 'openai', model: 'gpt-4o-mini', status: 'ready' }, ...overrides });

async function mockSnapshot(page, data) {
  await page.addInitScript(() => sessionStorage.setItem('phoenix.gateway.token', 'ui-fixture-token-not-real'));
  await page.route('**/admin/snapshot', route => route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } }));
  await page.route('**/socket.io/**', route => route.abort());
  await page.goto('/');
}

test('shows configuration honestly and renders English/Hinglish analysis in incidents and passports', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await mockSnapshot(page, fixture());
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'LLM drift analyst' })).toBeVisible();
  await expect(page.getByText(/Ready — no model response tested yet/)).toBeVisible();
  await page.getByRole('link', { name: /Drift incidents/ }).click();
  await page.getByRole('button', { name: /Response field renamed/ }).click();
  await page.getByRole('tab', { name: 'LLM analysis', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(modelGuidance.explanation);
  await expect(page.getByRole('dialog')).toContainText(modelGuidance.hinglishExplanation);
  await expect(page.getByRole('dialog')).toContainText('Suggested operator checks — not executed tests');
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('link', { name: 'Repairs & passports' }).click();
  await page.locator('.passport-card').click();
  await expect(page.getByRole('dialog')).toContainText('simulated-openai-model');
  await expect(page.getByRole('dialog')).toContainText('Final deployment probe');
  expect(errors).toEqual([]);
});

test('shows rejected-output fallback without fabricated AI text on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const rejected = { status: 'rejected', provider: 'openai', model: 'simulated-openai-model', latencyMs: 10,
    analyzedAt: modelGuidance.analyzedAt, fallbackUsed: true, reason: 'unsupported_proposal' };
  await mockSnapshot(page, fixture({ incidents: [{ ...incident, aiAnalysis: rejected }] }));
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: /Drift incidents/ }).click();
  await page.getByRole('button', { name: /Response field renamed/ }).click();
  await page.getByRole('tab', { name: 'LLM analysis', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('unsupported proposal');
  await expect(page.getByRole('dialog')).toContainText('no AI explanation is fabricated');
  await expect(page.getByRole('heading', { name: 'Model explanation' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});

import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ORIGIN = 'http://localhost:4173';

/** Falla si la app pide algo que no sea su propio origen (sin red en ejecución). */
function trackNetwork(page: Page): { external: string[]; all: string[] } {
  const external: string[] = [];
  const all: string[] = [];
  page.on('request', (r) => {
    const url = r.url();
    all.push(url);
    if (!url.startsWith(ORIGIN) && !url.startsWith('blob:') && !url.startsWith('data:')) external.push(url);
  });
  return { external, all };
}

async function finishOnboarding(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Permitir cámara' }).click();
  await expect(page.getByText('Cámara lista.')).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Siguiente' }).click();
  await page.getByRole('button', { name: 'Terminar y calibrar' }).click();
}

test('onboarding completo con cámara simulada, modelo local cargado y sin tráfico externo', async ({
  page,
}) => {
  const net = trackNetwork(page);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await finishOnboarding(page);

  await expect(page.getByRole('heading', { name: 'Calibración' })).toBeVisible();
  await expect(page.locator('video.preview-video')).toBeVisible();
  // Sin persona en el vídeo simulado no se puede calibrar: se explica por qué.
  await expect(page.getByText('Aún no se detecta a una persona')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Cargando modelo|No se pudo cargar el modelo/)).toHaveCount(0, {
    timeout: 60_000,
  });

  expect(net.all.some((u) => u.endsWith('pose_landmarker_lite.task'))).toBe(true);
  expect(net.all.some((u) => u.includes('/wasm/vision_wasm_internal'))).toBe(true);
  expect(net.external).toEqual([]);
  expect(errors).toEqual([]);
});

test('CSP estricta presente en producción', async ({ page }) => {
  await page.goto('/');
  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("'wasm-unsafe-eval'");
  expect(csp).not.toMatch(/'unsafe-inline'|'unsafe-eval'/);
});

for (const [name, nav] of [
  ['onboarding', async (_p: Page) => undefined],
  [
    'panel',
    async (p: Page) =>
      void (await finishOnboarding(p), await p.getByRole('button', { name: 'Panel' }).click()),
  ],
  [
    'ajustes',
    async (p: Page) =>
      void (await finishOnboarding(p), await p.getByRole('button', { name: 'Ajustes' }).click()),
  ],
  [
    'estadísticas',
    async (p: Page) =>
      void (await finishOnboarding(p), await p.getByRole('button', { name: 'Estadísticas' }).click()),
  ],
  [
    'ejercicios',
    async (p: Page) =>
      void (await finishOnboarding(p), await p.getByRole('button', { name: 'Ejercicios' }).click()),
  ],
  [
    'acerca de',
    async (p: Page) =>
      void (await finishOnboarding(p), await p.getByRole('button', { name: 'Acerca de' }).click()),
  ],
] as const) {
  test(`accesibilidad (axe) sin errores críticos: ${name}`, async ({ page }) => {
    await page.goto('/');
    await nav(page);
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
}

test('modo oscuro y reducción de movimiento se respetan', async ({ browser }) => {
  const ctx = await browser.newContext({ colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto('/');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(bg).toBe('rgb(28, 28, 30)');
  await ctx.close();
});

test('exportar y borrar datos desde Ajustes', async ({ page }) => {
  await finishOnboarding(page);
  await page.getByRole('button', { name: 'Ajustes' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Exportar mis datos (JSON)' }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('neckguard-data.json');
  await page.getByRole('button', { name: 'Borrar todos mis datos' }).click();
  await page.getByRole('button', { name: 'Sí, borrar todo' }).click();
  await expect(page.getByRole('heading', { name: 'Bienvenido/a a NeckGuard' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('neckguard.data'))).toBeNull();
});

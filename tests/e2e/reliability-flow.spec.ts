import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createSolidPng } from '../fixtures/png';

const png = createSolidPng();

test('Web: import, calibrate, digitize, save, reopen and export', async ({ page }) => {
  await page.goto('/');
  await page.locator('input[accept="image/*,.pdf"]').setInputFiles({
    name: 'flow.png',
    mimeType: 'image/png',
    buffer: png
  });
  await expect(page.getByAltText('Chart')).toBeVisible();
  await page.getByRole('button', { name: '确认校准 & 开始采集' }).click();
  await page.getByAltText('Chart').locator('..').dblclick({
    position: { x: 200, y: 100 }
  });
  await expect
    .poll(() =>
      page.locator('input').evaluateAll((inputs) =>
        inputs.some((input) => (input as HTMLInputElement).value === 'Sample A')
      )
    )
    .toBe(true);

  const projectDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存项目' }).click();
  const projectPath = await (await projectDownloadPromise).path();
  expect(projectPath).toBeTruthy();
  const projectBytes = await readFile(projectPath!);

  await page.getByRole('button', { name: '重置' }).click();
  await expect(page.getByText('请先导入图片或 PDF')).toBeVisible();
  await page.locator('input[accept=".plotdigitizer"]').setInputFiles({
    name: 'flow.plotdigitizer',
    mimeType: 'application/x-plotdigitizer',
    buffer: projectBytes
  });
  await expect(page.getByAltText('Chart')).toBeVisible();
  await expect
    .poll(() =>
      page.locator('input').evaluateAll((inputs) =>
        inputs.some((input) => (input as HTMLInputElement).value === 'Sample A')
      )
    )
    .toBe(true);

  await page.getByRole('button', { name: '导出', exact: true }).click();
  const csvDownloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出文件' }).click();
  const csvPath = await (await csvDownloadPromise).path();
  const csv = await readFile(csvPath!, 'utf8');
  expect(csv).toContain('schema_version,page,plot_id');
  expect(csv).toContain('Sample A');
});

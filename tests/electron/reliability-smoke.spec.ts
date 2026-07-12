import { _electron as electron, expect, test } from '@playwright/test';
import { access, mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSolidPng } from '../fixtures/png';

const png = createSolidPng();

test('Electron: secure native save/open bridge completes the reliability flow', async () => {
  const temporaryDirectory = await mkdtemp(path.join(tmpdir(), 'plotdigitizer-'));
  const projectPath = path.join(temporaryDirectory, 'electron-flow.plotdigitizer');
  const application = await electron.launch({
    args: ['.'],
    env: { ...process.env, PLOT_DIGITIZER_E2E: '1', NODE_ENV: 'production' }
  });

  try {
    const page = await application.firstWindow();
    expect(
      await page.evaluate(() => ({
        open: typeof window.plotDigitizer?.openProject,
        save: typeof window.plotDigitizer?.saveProject
      }))
    ).toEqual({ open: 'function', save: 'function' });

    await page.locator('input[accept="image/*,.pdf"]').setInputFiles({
      name: 'electron-flow.png',
      mimeType: 'image/png',
      buffer: png
    });
    await expect(page.getByAltText('Chart')).toBeVisible();
    await page.getByRole('button', { name: '确认校准 & 开始采集' }).click();
    await page.getByAltText('Chart').locator('..').dblclick({
      position: { x: 200, y: 100 }
    });

    await application.evaluate(
      ({ dialog }, destination) => {
        dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination });
      },
      projectPath
    );
    await page.getByRole('button', { name: '保存项目' }).click();
    await expect
      .poll(async () => access(projectPath).then(() => true).catch(() => false))
      .toBe(true);

    await page.getByRole('button', { name: '重置' }).click();
    await application.evaluate(
      ({ dialog }, source) => {
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source] });
      },
      projectPath
    );
    await page.getByRole('button', { name: '打开项目' }).click();
    await expect(page.getByAltText('Chart')).toBeVisible();

    await page.getByRole('button', { name: '导出', exact: true }).click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出文件' }).click();
    const csv = await readFile((await (await downloadPromise).path())!, 'utf8');
    expect(csv).toContain('schema_version,page,plot_id');
  } finally {
    await application.close();
  }
});

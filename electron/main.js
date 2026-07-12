const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const fs = require('fs/promises');
const path = require('path');

const PROJECT_EXTENSION = '.plotdigitizer';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    title: 'PlotDigitizer - 图表数字化工具'
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      buttons: ['放弃修改并关闭', '取消'],
      defaultId: 1,
      cancelId: 1,
      title: '存在未保存修改',
      message: '当前项目存在未保存修改，确定要关闭应用吗？'
    });
    if (choice === 0) event.preventDefault();
  });

  if (process.env.PLOT_DIGITIZER_E2E === '1') {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  } else if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
    mainWindow.loadURL('http://localhost:5173').catch(() => {
      mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

ipcMain.handle('project:open', async (event) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const result = await dialog.showOpenDialog(owner, {
    title: '打开 PlotDigitizer 项目',
    properties: ['openFile'],
    filters: [{ name: 'PlotDigitizer Project', extensions: ['plotdigitizer'] }]
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const selectedPath = result.filePaths[0];
  const buffer = await fs.readFile(selectedPath);
  const bytes = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
  return { name: path.basename(selectedPath), bytes };
});

ipcMain.handle('project:save', async (event, input) => {
  const owner = BrowserWindow.fromWebContents(event.sender);
  const safeDefaultName = ensureProjectExtension(
    path.basename(String(input?.defaultName || 'project.plotdigitizer'))
  );
  const result = await dialog.showSaveDialog(owner, {
    title: '保存 PlotDigitizer 项目',
    defaultPath: safeDefaultName,
    filters: [{ name: 'PlotDigitizer Project', extensions: ['plotdigitizer'] }]
  });
  if (result.canceled || !result.filePath) return { saved: false };
  const destination = ensureProjectExtension(result.filePath);
  await fs.writeFile(destination, Buffer.from(new Uint8Array(input.bytes)));
  return { saved: true, name: path.basename(destination) };
});

function ensureProjectExtension(filePath) {
  return filePath.toLowerCase().endsWith(PROJECT_EXTENSION)
    ? filePath
    : `${filePath}${PROJECT_EXTENSION}`;
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

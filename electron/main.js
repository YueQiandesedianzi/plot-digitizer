const { app, BrowserWindow } = require('electron')
const path = require('path')

function createWindow() {
    const mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        },
        title: 'PlotDigitizer - 图表数字化工具'
    })

    // 隐藏菜单栏
    mainWindow.setMenuBarVisibility(false)

    // 开发模式加载 Vite 服务器，生产模式加载打包文件
    if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
        // 开发模式：尝试连接 Vite 开发服务器
        mainWindow.loadURL('http://localhost:5173').catch(() => {
            // 如果开发服务器未启动，加载打包文件
            mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
        })
    } else {
        // 生产模式：加载打包后的文件
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
    }
}

app.whenReady().then(() => {
    createWindow()

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
        }
    })
})

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

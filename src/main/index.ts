import { app, BrowserWindow, shell } from 'electron'
import electronUpdater from 'electron-updater'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDb, closeDb } from './db'
import { registerIpcHandlers } from './ipc'
import { getActiveGameVersion } from './store'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isMac = process.platform === 'darwin'

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#121212',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  win.once('ready-to-show', () => win.show())

  // Any window.open()/target=_blank request (e.g. a Wowhead link) opens in
  // the user's default browser instead of a second Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServerUrl = process.env['ELECTRON_RENDERER_URL']
  if (devServerUrl) {
    void win.loadURL(devServerUrl)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

void app.whenReady().then(() => {
  // Initialize the active game version's database (creates schema + seed
  // data on first run) before any renderer can issue an IPC query against it.
  getDb(getActiveGameVersion())
  registerIpcHandlers()

  createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
  })

  // Only meaningful for a packaged build pulling from the GitHub Releases feed
  // configured in electron-builder.yml — checkForUpdatesAndNotify() throws if
  // called against an unpackaged dev run.
  if (app.isPackaged) {
    electronUpdater.autoUpdater.checkForUpdatesAndNotify().catch((error: unknown) => {
      console.error('Auto-update check failed:', error)
    })
  }
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

app.on('before-quit', () => {
  closeDb()
})

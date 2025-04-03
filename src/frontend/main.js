const { app, BrowserWindow, ipcMain, Menu, Tray } = require('electron');
const path = require('path');
const url = require('url');
const fs = require('fs');
const { setupBackendServer } = require('../backend/server');

// Keep a global reference of the window object to avoid garbage collection
let mainWindow;
let tray = null;
let isSecureModeActive = false;

// Create the main application window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  // Load the index.html file
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }));

  // Open DevTools in development mode
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Handle window close event
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Create system tray icon
  createTray();
}

// Create system tray icon and menu
function createTray() {
  try {
    // Check if assets directory exists
    const assetsDir = path.join(__dirname, 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
      console.log('Created missing assets directory');
    }
    
    // Check if icon file exists, use a fallback if not
    const iconPath = path.join(__dirname, 'assets/icon.png');
    if (!fs.existsSync(iconPath)) {
      console.warn('Icon file not found, using a default icon');
      // Create a simple 16x16 transparent icon as fallback
      const { nativeImage } = require('electron');
      const emptyIcon = nativeImage.createEmpty();
      tray = new Tray(emptyIcon);
    } else {
      tray = new Tray(iconPath);
    }
    
    const contextMenu = Menu.buildFromTemplate([
      { 
        label: 'Secure Mode', 
        type: 'checkbox',
        checked: isSecureModeActive,
        click: () => {
          isSecureModeActive = !isSecureModeActive;
          if (mainWindow) {
            mainWindow.webContents.send('secure-mode-toggle', isSecureModeActive);
          }
        }
      },
      { type: 'separator' },
      { 
        label: 'Show App', 
        click: () => {
          if (mainWindow === null) {
            createWindow();
          } else {
            mainWindow.show();
          }
        }
      },
      { 
        label: 'Exit', 
        click: () => {
          if (isSecureModeActive) {
            // Perform cleanup before exit
            cleanupSecureSession().then(() => {
              app.quit();
            });
          } else {
            app.quit();
          }
        }
      }
    ]);
    
    tray.setToolTip('Secure Ephemeral Workspace');
    tray.setContextMenu(contextMenu);
    
    // Store the context menu reference directly on the tray object
    tray.contextMenu = contextMenu;
    
    tray.on('click', () => {
      if (mainWindow === null) {
        createWindow();
      } else {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
      }
    });
  } catch (error) {
    console.error('Failed to create tray:', error);
    // Create a minimal tray if the normal creation fails
    try {
      const { nativeImage } = require('electron');
      const emptyIcon = nativeImage.createEmpty();
      tray = new Tray(emptyIcon);
      const simpleMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => mainWindow?.show() },
        { label: 'Exit', click: () => app.quit() }
      ]);
      tray.setContextMenu(simpleMenu);
      tray.contextMenu = simpleMenu;
    } catch (fallbackError) {
      console.error('Failed to create fallback tray:', fallbackError);
      // Continue without tray
      tray = null;
    }
  }
}

// Clean up secure session data
async function cleanupSecureSession() {
  // This will be implemented with OS-specific cleanup scripts
  mainWindow.webContents.send('cleanup-started');
  
  try {
    // OS detection
    if (process.platform === 'win32') {
      const { cleanupWindowsSession } = require('../isolation/windows/cleanup');
      await cleanupWindowsSession();
    } else if (process.platform === 'linux') {
      const { cleanupLinuxSession } = require('../isolation/linux/cleanup');
      await cleanupLinuxSession();
    }
    
    mainWindow.webContents.send('cleanup-completed');
    return true;
  } catch (error) {
    console.error('Cleanup failed:', error);
    mainWindow.webContents.send('cleanup-failed', error.message);
    return false;
  }
}

// Initialize the app when Electron is ready
app.whenReady().then(() => {
  createWindow();
  
  // Start the backend server for cloud API
  setupBackendServer();
  
  // Create necessary directories if they don't exist
  const tempDir = path.join(app.getPath('temp'), 'secure-workspace');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Handle IPC messages from renderer process
ipcMain.on('toggle-secure-mode', (event, enabled) => {
  try {
    isSecureModeActive = enabled;
    
    // Update tray menu with null checks
    if (tray && tray.contextMenu) {
      const contextMenu = tray.contextMenu;
      if (contextMenu.items && contextMenu.items[0]) {
        contextMenu.items[0].checked = isSecureModeActive;
        tray.setContextMenu(contextMenu);
      }
    }
    
    if (enabled) {
      // Start secure session
      if (process.platform === 'win32') {
        const { startWindowsSecureSession } = require('../isolation/windows/session');
        startWindowsSecureSession();
      } else if (process.platform === 'linux') {
        const { startLinuxSecureSession } = require('../isolation/linux/session');
        startLinuxSecureSession();
      }
    } else {
      // End secure session and clean up
      cleanupSecureSession();
    }
  } catch (error) {
    console.error('Error in toggle-secure-mode handler:', error);
    if (mainWindow) {
      mainWindow.webContents.send('secure-mode-error', error.message);
    }
  }
});

// Handle cloud sync request
ipcMain.on('sync-to-cloud', async (event, { service, files }) => {
  try {
    const { syncToCloud } = require('../cloud/sync');
    const result = await syncToCloud(service, files);
    event.reply('sync-completed', result);
  } catch (error) {
    console.error('Cloud sync failed:', error);
    event.reply('sync-failed', error.message);
  }
});

// Handle app quit with cleanup
app.on('before-quit', (event) => {
  if (isSecureModeActive) {
    event.preventDefault();
    cleanupSecureSession().then(() => {
      app.exit(0);
    });
  }
}); 
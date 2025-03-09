const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { promisify } = require('util');
const sudo = require('sudo-prompt');

// Promisify exec
const execAsync = promisify(exec);

// Paths
const SCRIPTS_DIR = path.join(__dirname, '../../../scripts/linux');
const TEMP_DIR = path.join(app.getPath('temp'), 'secure-workspace');
const OVERLAY_DIR = path.join(TEMP_DIR, 'overlay');
const WORK_DIR = path.join(TEMP_DIR, 'work');
const MERGED_DIR = path.join(TEMP_DIR, 'merged');

// Track modified files
let modifiedFiles = [];
let isSessionActive = false;
let fileMonitoringInterval = null;

/**
 * Start a secure session on Linux
 * @returns {Promise<boolean>} - Whether the session was started successfully
 */
async function startLinuxSecureSession() {
  try {
    console.log('Starting Linux secure session...');
    
    // Create necessary directories
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(OVERLAY_DIR)) {
      fs.mkdirSync(OVERLAY_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(WORK_DIR)) {
      fs.mkdirSync(WORK_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(MERGED_DIR)) {
      fs.mkdirSync(MERGED_DIR, { recursive: true });
    }
    
    // Set up OverlayFS
    await setupOverlayFS();
    
    // Start file monitoring
    startFileMonitoring();
    
    isSessionActive = true;
    console.log('Linux secure session started successfully');
    return true;
  } catch (error) {
    console.error('Failed to start Linux secure session:', error);
    return false;
  }
}

/**
 * End a secure session on Linux
 * @returns {Promise<boolean>} - Whether the session was ended successfully
 */
async function endLinuxSecureSession() {
  try {
    console.log('Ending Linux secure session...');
    
    // Stop file monitoring
    stopFileMonitoring();
    
    // Unmount OverlayFS
    await unmountOverlayFS();
    
    isSessionActive = false;
    console.log('Linux secure session ended successfully');
    return true;
  } catch (error) {
    console.error('Failed to end Linux secure session:', error);
    return false;
  }
}

/**
 * Set up OverlayFS
 * @returns {Promise<void>}
 */
async function setupOverlayFS() {
  console.log('Setting up OverlayFS...');
  
  try {
    // Get user home directory
    const homeDir = app.getPath('home');
    
    // Directories to overlay
    const overlayDirs = [
      'Documents',
      'Downloads',
      'Pictures',
      'Videos',
      'Music',
      'Desktop'
    ];
    
    // Mount each directory with OverlayFS
    for (const dir of overlayDirs) {
      const lowerDir = path.join(homeDir, dir);
      const upperDir = path.join(OVERLAY_DIR, dir);
      const workDir = path.join(WORK_DIR, dir);
      const mergedDir = path.join(MERGED_DIR, dir);
      
      // Create directories if they don't exist
      if (!fs.existsSync(upperDir)) {
        fs.mkdirSync(upperDir, { recursive: true });
      }
      
      if (!fs.existsSync(workDir)) {
        fs.mkdirSync(workDir, { recursive: true });
      }
      
      if (!fs.existsSync(mergedDir)) {
        fs.mkdirSync(mergedDir, { recursive: true });
      }
      
      // Mount OverlayFS
      const mountCommand = `mount -t overlay overlay -o lowerdir=${lowerDir},upperdir=${upperDir},workdir=${workDir} ${mergedDir}`;
      
      await new Promise((resolve, reject) => {
        sudo.exec(mountCommand, { name: 'Secure Ephemeral Workspace' }, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error mounting OverlayFS for ${dir}:`, stderr);
            reject(error);
          } else {
            console.log(`OverlayFS mounted for ${dir}`);
            resolve();
          }
        });
      });
      
      // Create symbolic link to merged directory
      const symlinkCommand = `ln -sf ${mergedDir} ${lowerDir}.secure`;
      
      await execAsync(symlinkCommand);
    }
  } catch (error) {
    console.error('Failed to set up OverlayFS:', error);
    throw error;
  }
}

/**
 * Unmount OverlayFS
 * @returns {Promise<void>}
 */
async function unmountOverlayFS() {
  console.log('Unmounting OverlayFS...');
  
  try {
    // Get user home directory
    const homeDir = app.getPath('home');
    
    // Directories to unmount
    const overlayDirs = [
      'Documents',
      'Downloads',
      'Pictures',
      'Videos',
      'Music',
      'Desktop'
    ];
    
    // Unmount each directory
    for (const dir of overlayDirs) {
      const mergedDir = path.join(MERGED_DIR, dir);
      const symlinkPath = path.join(homeDir, `${dir}.secure`);
      
      // Remove symbolic link
      if (fs.existsSync(symlinkPath)) {
        fs.unlinkSync(symlinkPath);
      }
      
      // Unmount OverlayFS
      const unmountCommand = `umount ${mergedDir}`;
      
      await new Promise((resolve, reject) => {
        sudo.exec(unmountCommand, { name: 'Secure Ephemeral Workspace' }, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error unmounting OverlayFS for ${dir}:`, stderr);
            // Don't reject, continue with other unmounts
            resolve();
          } else {
            console.log(`OverlayFS unmounted for ${dir}`);
            resolve();
          }
        });
      });
    }
  } catch (error) {
    console.error('Failed to unmount OverlayFS:', error);
    throw error;
  }
}

/**
 * Start file monitoring
 */
function startFileMonitoring() {
  console.log('Starting file monitoring...');
  
  // Reset modified files list
  modifiedFiles = [];
  
  // For demo purposes, we'll just scan the overlay directory periodically
  fileMonitoringInterval = setInterval(() => {
    scanOverlayDirectory();
  }, 5000);
}

/**
 * Stop file monitoring
 */
function stopFileMonitoring() {
  console.log('Stopping file monitoring...');
  
  if (fileMonitoringInterval) {
    clearInterval(fileMonitoringInterval);
    fileMonitoringInterval = null;
  }
}

/**
 * Scan overlay directory for modified files
 */
function scanOverlayDirectory() {
  if (!isSessionActive) return;
  
  try {
    // Recursively scan the overlay directory
    const newFiles = [];
    
    function scanDirectory(dir) {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          scanDirectory(filePath);
        } else {
          const relativePath = path.relative(OVERLAY_DIR, filePath);
          
          newFiles.push({
            id: newFiles.length + 1,
            name: path.basename(filePath),
            path: filePath,
            size: stats.size,
            modified: stats.mtime.toISOString()
          });
        }
      }
    }
    
    scanDirectory(OVERLAY_DIR);
    
    // Update modified files list if changed
    if (JSON.stringify(newFiles) !== JSON.stringify(modifiedFiles)) {
      modifiedFiles = newFiles;
      
      // Notify renderer process
      const mainWindow = require('electron').BrowserWindow.getAllWindows()[0];
      if (mainWindow) {
        mainWindow.webContents.send('file-list-update', modifiedFiles);
      }
    }
  } catch (error) {
    console.error('Error scanning overlay directory:', error);
  }
}

/**
 * Get list of modified files
 * @returns {Array} - List of modified files
 */
function getModifiedFiles() {
  return modifiedFiles;
}

/**
 * Check if session is active
 * @returns {boolean} - Whether the session is active
 */
function isSecureSessionActive() {
  return isSessionActive;
}

module.exports = {
  startLinuxSecureSession,
  endLinuxSecureSession,
  getModifiedFiles,
  isSecureSessionActive
}; 
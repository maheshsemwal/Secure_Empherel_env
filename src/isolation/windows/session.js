const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { promisify } = require('util');
const sudo = require('sudo-prompt');
const PowerShell = require('node-powershell');

// Promisify exec
const execAsync = promisify(exec);

// Paths
const SCRIPTS_DIR = path.join(__dirname, '../../../scripts/windows');
const TEMP_DIR = path.join(app.getPath('temp'), 'secure-workspace');
const SANDBOX_DIR = path.join(TEMP_DIR, 'sandbox');
const REGISTRY_BACKUP_FILE = path.join(TEMP_DIR, 'registry-backup.reg');

// Track modified files
let modifiedFiles = [];
let isSessionActive = false;


/**
 * Start a secure session on Windows
 * @returns {Promise<boolean>} - Whether the session was started successfully
 */
async function startWindowsSecureSession() {
  try {
    console.log('Starting Windows secure session...');
    
    // Create necessary directories
    if (!fs.existsSync(TEMP_DIR)) {
      fs.mkdirSync(TEMP_DIR, { recursive: true });
    }
    
    if (!fs.existsSync(SANDBOX_DIR)) {
      fs.mkdirSync(SANDBOX_DIR, { recursive: true });
    }
    
    // Backup registry settings
    await backupRegistry();
    
    // Create sandbox environment
    await createSandboxEnvironment();
    
    // Start file monitoring
    startFileMonitoring();
    
    isSessionActive = true;
    console.log('Windows secure session started successfully');
    return true;
  } catch (error) {
    console.error('Failed to start Windows secure session:', error);
    return false;
  }
}

/**
 * End a secure session on Windows
 * @returns {Promise<boolean>} - Whether the session was ended successfully
 */
async function endWindowsSecureSession() {
  try {
    console.log('Ending Windows secure session...');
    
    // Stop file monitoring
    stopFileMonitoring();
    
    // Restore registry settings
    await restoreRegistry();
    
    isSessionActive = false;
    console.log('Windows secure session ended successfully');
    return true;
  } catch (error) {
    console.error('Failed to end Windows secure session:', error);
    return false;
  }
}

/**
 * Backup registry settings
 * @returns {Promise<void>}
 */
async function backupRegistry() {
  console.log('Backing up registry settings...');
  
  try {
    // Create PowerShell instance
    const ps = new PowerShell({
      executionPolicy: 'Bypass',
      noProfile: true
    });
    
    // Add registry export command
    await ps.addCommand(`
      # Registry keys to backup
      $keys = @(
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\UserAssist",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RecentDocs",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\RunMRU",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\TypedPaths"
      )
      
      # Export each key
      foreach ($key in $keys) {
        reg export $key "${REGISTRY_BACKUP_FILE.replace(/\\/g, '\\\\')}" /y
      }
    `);
    
    // Execute the command
    const result = await ps.invoke();
    console.log('Registry backup completed:', result);
    
    // Dispose of PowerShell instance
    await ps.dispose();
  } catch (error) {
    console.error('Failed to backup registry:', error);
    throw error;
  }
}

/**
 * Restore registry settings
 * @returns {Promise<void>}
 */
async function restoreRegistry() {
  console.log('Restoring registry settings...');
  
  try {
    if (fs.existsSync(REGISTRY_BACKUP_FILE)) {
      // Create PowerShell instance
      const ps = new PowerShell({
        executionPolicy: 'Bypass',
        noProfile: true
      });
      
      // Add registry import command
      await ps.addCommand(`
        # Import registry backup
        reg import "${REGISTRY_BACKUP_FILE.replace(/\\/g, '\\\\')}"
      `);
      
      // Execute the command
      const result = await ps.invoke();
      console.log('Registry restore completed:', result);
      
      // Dispose of PowerShell instance
      await ps.dispose();
      
      // Delete backup file
      fs.unlinkSync(REGISTRY_BACKUP_FILE);
    } else {
      console.log('No registry backup file found, skipping restore');
    }
  } catch (error) {
    console.error('Failed to restore registry:', error);
    throw error;
  }
}

/**
 * Create sandbox environment
 * @returns {Promise<void>}
 */
async function createSandboxEnvironment() {
  console.log('Creating sandbox environment...');
  
  try {
    // Create PowerShell instance
    const ps = new PowerShell({
      executionPolicy: 'Bypass',
      noProfile: true
    });
    
    // Add sandbox creation command
    await ps.addCommand(`
      # Create junction points for redirecting user profile folders
      $userProfileFolders = @(
        "Documents",
        "Downloads",
        "Pictures",
        "Videos",
        "Music",
        "Desktop"
      )
      
      # Get user profile path
      $userProfilePath = [Environment]::GetFolderPath("UserProfile")
      
      # Create sandbox folders and junctions
      foreach ($folder in $userProfileFolders) {
        # Create sandbox folder
        $sandboxFolder = "${SANDBOX_DIR.replace(/\\/g, '\\\\')}\\$folder"
        if (-not (Test-Path $sandboxFolder)) {
          New-Item -Path $sandboxFolder -ItemType Directory -Force | Out-Null
        }
        
        # Backup original folder if needed
        $originalFolder = "$userProfilePath\\$folder"
        $backupFolder = "$originalFolder.backup"
        
        if (Test-Path $originalFolder) {
          if (-not (Test-Path $backupFolder)) {
            Rename-Item -Path $originalFolder -NewName "$folder.backup" -Force
          }
        }
        
        # Create junction point
        if (-not (Test-Path $originalFolder)) {
          New-Item -Path $originalFolder -ItemType Junction -Value $sandboxFolder -Force | Out-Null
        }
      }
    `);
    
    // Execute the command
    const result = await ps.invoke();
    console.log('Sandbox environment created:', result);
    
    // Dispose of PowerShell instance
    await ps.dispose();
  } catch (error) {
    console.error('Failed to create sandbox environment:', error);
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
  
  // Set up file monitoring using PowerShell
  // This is a simplified version for demonstration
  // In a real implementation, you would use Windows APIs or a file system watcher
  
  // For demo purposes, we'll just scan the sandbox directory periodically
  fileMonitoringInterval = setInterval(() => {
    scanSandboxDirectory();
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
 * Scan sandbox directory for modified files
 */
function scanSandboxDirectory() {
  if (!isSessionActive) return;
  
  try {
    // Recursively scan the sandbox directory
    const newFiles = [];
    
    function scanDirectory(dir) {
      const files = fs.readdirSync(dir);
      
      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);
        
        if (stats.isDirectory()) {
          scanDirectory(filePath);
        } else {
          const relativePath = path.relative(SANDBOX_DIR, filePath);
          
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
    
    scanDirectory(SANDBOX_DIR);
    
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
    console.error('Error scanning sandbox directory:', error);
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
  startWindowsSecureSession,
  endWindowsSecureSession,
  getModifiedFiles,
  isSecureSessionActive
}; 
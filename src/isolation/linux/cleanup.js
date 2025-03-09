const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { promisify } = require('util');
const sudo = require('sudo-prompt');
const { endLinuxSecureSession } = require('./session');

// Promisify exec
const execAsync = promisify(exec);

// Paths
const SCRIPTS_DIR = path.join(__dirname, '../../../scripts/linux');
const TEMP_DIR = path.join(app.getPath('temp'), 'secure-workspace');
const OVERLAY_DIR = path.join(TEMP_DIR, 'overlay');
const WORK_DIR = path.join(TEMP_DIR, 'work');
const MERGED_DIR = path.join(TEMP_DIR, 'merged');

/**
 * Clean up Linux secure session
 * @returns {Promise<boolean>} - Whether the cleanup was successful
 */
async function cleanupLinuxSession() {
  try {
    console.log('Cleaning up Linux secure session...');
    
    // End the secure session
    await endLinuxSecureSession();
    
    // Clean browser history
    await cleanBrowserHistory();
    
    // Clean temporary files
    await cleanTemporaryFiles();
    
    console.log('Linux secure session cleanup completed successfully');
    return true;
  } catch (error) {
    console.error('Failed to clean up Linux secure session:', error);
    return false;
  }
}

/**
 * Clean browser history
 * @returns {Promise<void>}
 */
async function cleanBrowserHistory() {
  console.log('Cleaning browser history...');
  
  try {
    const homeDir = app.getPath('home');
    
    // Chrome/Chromium history
    const chromeDir = path.join(homeDir, '.config/google-chrome');
    const chromiumDir = path.join(homeDir, '.config/chromium');
    
    // Firefox history
    const firefoxDir = path.join(homeDir, '.mozilla/firefox');
    
    // Clean Chrome history
    if (fs.existsSync(chromeDir)) {
      const command = `
        find "${chromeDir}" -name "History" -o -name "Cookies" -o -name "Login Data" -o -name "Web Data" -o -name "*journal" -type f -delete
      `;
      
      await execAsync(command);
    }
    
    // Clean Chromium history
    if (fs.existsSync(chromiumDir)) {
      const command = `
        find "${chromiumDir}" -name "History" -o -name "Cookies" -o -name "Login Data" -o -name "Web Data" -o -name "*journal" -type f -delete
      `;
      
      await execAsync(command);
    }
    
    // Clean Firefox history
    if (fs.existsSync(firefoxDir)) {
      const command = `
        find "${firefoxDir}" -name "places.sqlite" -o -name "cookies.sqlite" -o -name "formhistory.sqlite" -o -name "*journal" -type f -delete
      `;
      
      await execAsync(command);
    }
    
    console.log('Browser history cleaned');
  } catch (error) {
    console.error('Failed to clean browser history:', error);
    // Don't throw error, continue with cleanup
  }
}

/**
 * Clean temporary files
 * @returns {Promise<void>}
 */
async function cleanTemporaryFiles() {
  console.log('Cleaning temporary files...');
  
  try {
    // Delete overlay directory
    if (fs.existsSync(OVERLAY_DIR)) {
      await deleteDirectory(OVERLAY_DIR);
    }
    
    // Delete work directory
    if (fs.existsSync(WORK_DIR)) {
      await deleteDirectory(WORK_DIR);
    }
    
    // Delete merged directory
    if (fs.existsSync(MERGED_DIR)) {
      await deleteDirectory(MERGED_DIR);
    }
    
    // Clean system temporary files
    const homeDir = app.getPath('home');
    const tempDirs = [
      '/tmp',
      path.join(homeDir, '.cache')
    ];
    
    for (const dir of tempDirs) {
      if (fs.existsSync(dir)) {
        const command = `
          find "${dir}" -type f -mmin -180 -delete 2>/dev/null || true
        `;
        
        try {
          await execAsync(command);
        } catch (error) {
          console.error(`Error cleaning temporary files in ${dir}:`, error);
          // Continue with other directories
        }
      }
    }
    
    // Clean recent files
    const recentFilesDir = path.join(homeDir, '.local/share/recently-used.xbel');
    if (fs.existsSync(recentFilesDir)) {
      try {
        fs.writeFileSync(recentFilesDir, '<?xml version="1.0" encoding="UTF-8"?>\n<xbel version="1.0">\n</xbel>');
      } catch (error) {
        console.error('Error cleaning recent files:', error);
      }
    }
    
    console.log('Temporary files cleaned');
  } catch (error) {
    console.error('Failed to clean temporary files:', error);
    // Don't throw error, continue with cleanup
  }
}

/**
 * Delete a directory recursively
 * @param {string} dirPath - Path to the directory
 * @returns {Promise<void>}
 */
async function deleteDirectory(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      const files = fs.readdirSync(dirPath);
      
      for (const file of files) {
        const filePath = path.join(dirPath, file);
        
        if (fs.statSync(filePath).isDirectory()) {
          await deleteDirectory(filePath);
        } else {
          fs.unlinkSync(filePath);
        }
      }
      
      fs.rmdirSync(dirPath);
    }
  } catch (error) {
    console.error(`Failed to delete directory ${dirPath}:`, error);
    throw error;
  }
}

module.exports = {
  cleanupLinuxSession
}; 
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { promisify } = require('util');
const PowerShell = require('node-powershell');
const { endWindowsSecureSession } = require('./session');

// Promisify exec
const execAsync = promisify(exec);

// Paths
const SCRIPTS_DIR = path.join(__dirname, '../../../scripts/windows');
const TEMP_DIR = path.join(app.getPath('temp'), 'secure-workspace');
const SANDBOX_DIR = path.join(TEMP_DIR, 'sandbox');

/**
 * Clean up Windows secure session
 * @returns {Promise<boolean>} - Whether the cleanup was successful
 */
async function cleanupWindowsSession() {
  try {
    console.log('Cleaning up Windows secure session...');
    
    // End the secure session
    await endWindowsSecureSession();
    
    // Remove junction points and restore original folders
    await removeJunctionPoints();
    
    // Clean browser history
    await cleanBrowserHistory();
    
    // Clean temporary files
    await cleanTemporaryFiles();
    
    console.log('Windows secure session cleanup completed successfully');
    return true;
  } catch (error) {
    console.error('Failed to clean up Windows secure session:', error);
    return false;
  }
}

/**
 * Remove junction points and restore original folders
 * @returns {Promise<void>}
 */
async function removeJunctionPoints() {
  console.log('Removing junction points and restoring original folders...');
  
  try {
    // Create PowerShell instance
    const ps = new PowerShell({
      executionPolicy: 'Bypass',
      noProfile: true
    });
    
    // Add junction removal command
    await ps.addCommand(`
      # User profile folders
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
      
      # Remove junctions and restore original folders
      foreach ($folder in $userProfileFolders) {
        $originalFolder = "$userProfilePath\\$folder"
        $backupFolder = "$originalFolder.backup"
        
        # Remove junction if it exists
        if (Test-Path $originalFolder) {
          $folderInfo = Get-Item $originalFolder -Force
          if ($folderInfo.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            # It's a junction point, remove it
            Remove-Item -Path $originalFolder -Force
          }
        }
        
        # Restore original folder if backup exists
        if (Test-Path $backupFolder) {
          Rename-Item -Path $backupFolder -NewName $folder -Force
        }
      }
    `);
    
    // Execute the command
    const result = await ps.invoke();
    console.log('Junction points removed and original folders restored:', result);
    
    // Dispose of PowerShell instance
    await ps.dispose();
  } catch (error) {
    console.error('Failed to remove junction points:', error);
    throw error;
  }
}

/**
 * Clean browser history
 * @returns {Promise<void>}
 */
async function cleanBrowserHistory() {
  console.log('Cleaning browser history...');
  
  try {
    // Create PowerShell instance
    const ps = new PowerShell({
      executionPolicy: 'Bypass',
      noProfile: true
    });
    
    // Add browser history cleanup command
    await ps.addCommand(`
      # Clean Chrome history
      $chromePath = "$env:LOCALAPPDATA\\Google\\Chrome\\User Data\\Default"
      $chromeFiles = @(
        "History",
        "History-journal",
        "Cookies",
        "Cookies-journal",
        "Login Data",
        "Login Data-journal",
        "Web Data",
        "Web Data-journal"
      )
      
      foreach ($file in $chromeFiles) {
        $filePath = "$chromePath\\$file"
        if (Test-Path $filePath) {
          try {
            Remove-Item -Path $filePath -Force -ErrorAction SilentlyContinue
          } catch {
            Write-Output "Could not remove $filePath: $_"
          }
        }
      }
      
      # Clean Edge history
      $edgePath = "$env:LOCALAPPDATA\\Microsoft\\Edge\\User Data\\Default"
      $edgeFiles = @(
        "History",
        "History-journal",
        "Cookies",
        "Cookies-journal",
        "Login Data",
        "Login Data-journal",
        "Web Data",
        "Web Data-journal"
      )
      
      foreach ($file in $edgeFiles) {
        $filePath = "$edgePath\\$file"
        if (Test-Path $filePath) {
          try {
            Remove-Item -Path $filePath -Force -ErrorAction SilentlyContinue
          } catch {
            Write-Output "Could not remove $filePath: $_"
          }
        }
      }
      
      # Clean Firefox history
      $firefoxPath = "$env:APPDATA\\Mozilla\\Firefox\\Profiles"
      if (Test-Path $firefoxPath) {
        $profiles = Get-ChildItem -Path $firefoxPath -Directory
        
        foreach ($profile in $profiles) {
          $firefoxFiles = @(
            "places.sqlite",
            "places.sqlite-journal",
            "cookies.sqlite",
            "cookies.sqlite-journal",
            "formhistory.sqlite",
            "formhistory.sqlite-journal"
          )
          
          foreach ($file in $firefoxFiles) {
            $filePath = "$($profile.FullName)\\$file"
            if (Test-Path $filePath) {
              try {
                Remove-Item -Path $filePath -Force -ErrorAction SilentlyContinue
              } catch {
                Write-Output "Could not remove $filePath: $_"
              }
            }
          }
        }
      }
    `);
    
    // Execute the command
    const result = await ps.invoke();
    console.log('Browser history cleaned:', result);
    
    // Dispose of PowerShell instance
    await ps.dispose();
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
    // Delete sandbox directory
    if (fs.existsSync(SANDBOX_DIR)) {
      await deleteDirectory(SANDBOX_DIR);
    }
    
    // Create PowerShell instance
    const ps = new PowerShell({
      executionPolicy: 'Bypass',
      noProfile: true
    });
    
    // Add temp files cleanup command
    await ps.addCommand(`
      # Clean Windows temp files
      $tempFolders = @(
        "$env:TEMP",
        "$env:USERPROFILE\\AppData\\Local\\Temp"
      )
      
      foreach ($folder in $tempFolders) {
        if (Test-Path $folder) {
          Get-ChildItem -Path $folder -File -Recurse -ErrorAction SilentlyContinue | 
            Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-3) } | 
            Remove-Item -Force -ErrorAction SilentlyContinue
        }
      }
      
      # Clean recent items
      $recentItemsPath = "$env:APPDATA\\Microsoft\\Windows\\Recent"
      if (Test-Path $recentItemsPath) {
        Get-ChildItem -Path $recentItemsPath -File -ErrorAction SilentlyContinue | 
          Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-3) } | 
          Remove-Item -Force -ErrorAction SilentlyContinue
      }
    `);
    
    // Execute the command
    const result = await ps.invoke();
    console.log('Temporary files cleaned:', result);
    
    // Dispose of PowerShell instance
    await ps.dispose();
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
  cleanupWindowsSession
}; 
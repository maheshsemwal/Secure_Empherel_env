const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');

/**
 * Sync files to cloud storage
 * @param {string} service - The cloud service to sync to (google, onedrive, dropbox)
 * @param {Array} files - Array of file objects to sync
 * @returns {Promise<Object>} - Result of the sync operation
 */
async function syncToCloud(service, files) {
  if (!service || !files || files.length === 0) {
    throw new Error('Invalid parameters');
  }
  
  // Create a result object
  const result = {
    service,
    count: 0,
    successfulFiles: [],
    failedFiles: []
  };
  
  // Determine the API endpoint based on the service
  const apiEndpoint = `http://localhost:3000/api/upload/${service}`;
  
  // Process each file
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const fileName = path.basename(file.path);
    
    try {
      // Calculate progress percentage
      const progress = Math.round(((i + 1) / files.length) * 100);
      
      // Send progress update to renderer
      BrowserWindow.getAllWindows()[0]?.webContents.send('sync-progress', progress);
      
      // Upload the file
      const response = await axios.post(apiEndpoint, {
        filePath: file.path,
        fileName: fileName,
        mimeType: getMimeType(fileName)
      });
      
      // Add to successful files
      result.successfulFiles.push({
        id: file.id,
        name: fileName,
        cloudId: response.data.fileId,
        cloudUrl: response.data.webViewLink || response.data.webUrl || response.data.path
      });
      
      result.count++;
    } catch (error) {
      console.error(`Error syncing file ${fileName}:`, error);
      
      // Add to failed files
      result.failedFiles.push({
        id: file.id,
        name: fileName,
        error: error.response?.data?.error || error.message
      });
    }
  }
  
  return result;
}

/**
 * Authenticate with a cloud service
 * @param {string} service - The cloud service to authenticate with
 * @returns {Promise<void>}
 */
function authenticateCloudService(service) {
  return new Promise((resolve, reject) => {
    try {
      // Create authentication window
      const authWindow = new BrowserWindow({
        width: 800,
        height: 600,
        show: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      });
      
      // Load the authentication URL
      const authUrl = `http://localhost:3000/auth/${service}`;
      authWindow.loadURL(authUrl);
      
      // Handle window close
      authWindow.on('closed', () => {
        reject(new Error('Authentication window was closed'));
      });
      
      // Handle redirect
      authWindow.webContents.on('will-navigate', (event, url) => {
        handleAuthCallback(url, authWindow, resolve, reject);
      });
      
      authWindow.webContents.on('will-redirect', (event, url) => {
        handleAuthCallback(url, authWindow, resolve, reject);
      });
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * Handle authentication callback
 * @param {string} url - The callback URL
 * @param {BrowserWindow} authWindow - The authentication window
 * @param {Function} resolve - Promise resolve function
 * @param {Function} reject - Promise reject function
 */
function handleAuthCallback(url, authWindow, resolve, reject) {
  const callbackPattern = /\/auth\/([^\/]+)\/callback/;
  const match = url.match(callbackPattern);
  
  if (match) {
    const service = match[1];
    
    // Check if the URL contains an error
    if (url.includes('error=')) {
      const errorMatch = url.match(/error=([^&]+)/);
      const error = errorMatch ? errorMatch[1] : 'Unknown error';
      authWindow.close();
      reject(new Error(`Authentication failed: ${error}`));
    } else if (url.includes('code=')) {
      // Success - the backend will handle the token exchange
      setTimeout(() => {
        authWindow.close();
        resolve(service);
      }, 1000);
    }
  }
}

/**
 * Get MIME type based on file extension
 * @param {string} fileName - The file name
 * @returns {string} - The MIME type
 */
function getMimeType(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  
  const mimeTypes = {
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.zip': 'application/zip',
    '.rar': 'application/x-rar-compressed',
    '.tar': 'application/x-tar',
    '.mp3': 'audio/mpeg',
    '.mp4': 'video/mp4',
    '.avi': 'video/x-msvideo',
    '.mpeg': 'video/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg'
  };
  
  return mimeTypes[ext] || 'application/octet-stream';
}

module.exports = {
  syncToCloud,
  authenticateCloudService
}; 
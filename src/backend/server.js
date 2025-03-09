const express = require('express');
const { google } = require('googleapis');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { OAuth2Client } = require('google-auth-library');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express app
const expressApp = express();
const PORT = 3000;

let server = null;
let mainWindow = null;

// OAuth2 configurations
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'your-google-client-id';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'your-google-client-secret';
const GOOGLE_REDIRECT_URI = `http://localhost:${PORT}/auth/google/callback`;

const ONEDRIVE_CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID || 'your-onedrive-client-id';
const ONEDRIVE_CLIENT_SECRET = process.env.ONEDRIVE_CLIENT_SECRET || 'your-onedrive-client-secret';
const ONEDRIVE_REDIRECT_URI = `http://localhost:${PORT}/auth/onedrive/callback`;

const DROPBOX_CLIENT_ID = process.env.DROPBOX_CLIENT_ID || 'your-dropbox-client-id';
const DROPBOX_CLIENT_SECRET = process.env.DROPBOX_CLIENT_SECRET || 'your-dropbox-client-secret';
const DROPBOX_REDIRECT_URI = `http://localhost:${PORT}/auth/dropbox/callback`;

// OAuth2 clients
const googleOAuth2Client = new OAuth2Client(
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI
);

// Token storage
let tokens = {
  google: null,
  onedrive: null,
  dropbox: null
};

// Setup Express middleware
expressApp.use(express.json());
expressApp.use(express.urlencoded({ extended: true }));

// Setup routes
expressApp.get('/', (req, res) => {
  res.send('Secure Ephemeral Workspace API Server');
});

// Google Drive OAuth2 routes
expressApp.get('/auth/google', (req, res) => {
  const authUrl = googleOAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file']
  });
  res.redirect(authUrl);
});

expressApp.get('/auth/google/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const { tokens: googleTokens } = await googleOAuth2Client.getToken(code);
    tokens.google = googleTokens;
    
    // Save tokens to file
    saveTokens();
    
    // Notify renderer process
    if (mainWindow) {
      mainWindow.webContents.send('auth-success', 'google');
    }
    
    res.send('Authentication successful! You can close this window.');
  } catch (error) {
    console.error('Error authenticating with Google:', error);
    
    // Notify renderer process
    if (mainWindow) {
      mainWindow.webContents.send('auth-failed', { 
        service: 'google', 
        error: error.message 
      });
    }
    
    res.status(500).send('Authentication failed. Please try again.');
  }
});

// OneDrive OAuth2 routes
expressApp.get('/auth/onedrive', (req, res) => {
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${ONEDRIVE_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(ONEDRIVE_REDIRECT_URI)}&scope=files.readwrite offline_access`;
  res.redirect(authUrl);
});

expressApp.get('/auth/onedrive/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const response = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token', 
      `client_id=${ONEDRIVE_CLIENT_ID}&redirect_uri=${encodeURIComponent(ONEDRIVE_REDIRECT_URI)}&client_secret=${ONEDRIVE_CLIENT_SECRET}&code=${code}&grant_type=authorization_code`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    tokens.onedrive = response.data;
    
    // Save tokens to file
    saveTokens();
    
    // Notify renderer process
    if (mainWindow) {
      mainWindow.webContents.send('auth-success', 'onedrive');
    }
    
    res.send('Authentication successful! You can close this window.');
  } catch (error) {
    console.error('Error authenticating with OneDrive:', error);
    
    // Notify renderer process
    if (mainWindow) {
      mainWindow.webContents.send('auth-failed', { 
        service: 'onedrive', 
        error: error.response?.data?.error_description || error.message 
      });
    }
    
    res.status(500).send('Authentication failed. Please try again.');
  }
});

// Dropbox OAuth2 routes
expressApp.get('/auth/dropbox', (req, res) => {
  const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_CLIENT_ID}&response_type=code&redirect_uri=${encodeURIComponent(DROPBOX_REDIRECT_URI)}`;
  res.redirect(authUrl);
});

expressApp.get('/auth/dropbox/callback', async (req, res) => {
  const { code } = req.query;
  
  try {
    const response = await axios.post('https://api.dropboxapi.com/oauth2/token', 
      `code=${code}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(DROPBOX_REDIRECT_URI)}&client_id=${DROPBOX_CLIENT_ID}&client_secret=${DROPBOX_CLIENT_SECRET}`,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    
    tokens.dropbox = response.data;
    
    // Save tokens to file
    saveTokens();
    
    // Notify renderer process
    if (mainWindow) {
      mainWindow.webContents.send('auth-success', 'dropbox');
    }
    
    res.send('Authentication successful! You can close this window.');
  } catch (error) {
    console.error('Error authenticating with Dropbox:', error);
    
    // Notify renderer process
    if (mainWindow) {
      mainWindow.webContents.send('auth-failed', { 
        service: 'dropbox', 
        error: error.response?.data?.error_description || error.message 
      });
    }
    
    res.status(500).send('Authentication failed. Please try again.');
  }
});

// API routes for file operations
expressApp.post('/api/upload/google', async (req, res) => {
  if (!tokens.google) {
    return res.status(401).json({ error: 'Not authenticated with Google Drive' });
  }
  
  try {
    // Set credentials
    googleOAuth2Client.setCredentials(tokens.google);
    
    // Create Drive client
    const drive = google.drive({ version: 'v3', auth: googleOAuth2Client });
    
    // Upload file
    const { filePath, fileName, mimeType } = req.body;
    
    const fileMetadata = {
      name: fileName,
      parents: ['root'] // Upload to root folder
    };
    
    const media = {
      mimeType: mimeType || 'application/octet-stream',
      body: fs.createReadStream(filePath)
    };
    
    const file = await drive.files.create({
      resource: fileMetadata,
      media: media,
      fields: 'id,name,webViewLink'
    });
    
    res.json({
      success: true,
      fileId: file.data.id,
      fileName: file.data.name,
      webViewLink: file.data.webViewLink
    });
  } catch (error) {
    console.error('Error uploading to Google Drive:', error);
    res.status(500).json({ error: error.message });
  }
});

expressApp.post('/api/upload/onedrive', async (req, res) => {
  if (!tokens.onedrive) {
    return res.status(401).json({ error: 'Not authenticated with OneDrive' });
  }
  
  try {
    const { filePath, fileName } = req.body;
    
    // Read file
    const fileContent = fs.readFileSync(filePath);
    
    // Upload to OneDrive
    const response = await axios.put(
      `https://graph.microsoft.com/v1.0/me/drive/root:/${fileName}:/content`,
      fileContent,
      {
        headers: {
          'Authorization': `Bearer ${tokens.onedrive.access_token}`,
          'Content-Type': 'application/octet-stream'
        }
      }
    );
    
    res.json({
      success: true,
      fileId: response.data.id,
      fileName: response.data.name,
      webUrl: response.data.webUrl
    });
  } catch (error) {
    console.error('Error uploading to OneDrive:', error);
    res.status(500).json({ error: error.response?.data?.error?.message || error.message });
  }
});

expressApp.post('/api/upload/dropbox', async (req, res) => {
  if (!tokens.dropbox) {
    return res.status(401).json({ error: 'Not authenticated with Dropbox' });
  }
  
  try {
    const { filePath, fileName } = req.body;
    
    // Read file
    const fileContent = fs.readFileSync(filePath);
    
    // Upload to Dropbox
    const response = await axios.post(
      'https://content.dropboxapi.com/2/files/upload',
      fileContent,
      {
        headers: {
          'Authorization': `Bearer ${tokens.dropbox.access_token}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({
            path: `/${fileName}`,
            mode: 'add',
            autorename: true,
            mute: false
          })
        }
      }
    );
    
    res.json({
      success: true,
      fileId: response.data.id,
      fileName: response.data.name,
      path: response.data.path_display
    });
  } catch (error) {
    console.error('Error uploading to Dropbox:', error);
    res.status(500).json({ error: error.response?.data?.error_summary || error.message });
  }
});

// Helper functions
function saveTokens() {
  const tokenPath = path.join(app.getPath('userData'), 'tokens.json');
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));
}

function loadTokens() {
  const tokenPath = path.join(app.getPath('userData'), 'tokens.json');
  
  if (fs.existsSync(tokenPath)) {
    try {
      const data = fs.readFileSync(tokenPath, 'utf8');
      tokens = JSON.parse(data);
    } catch (error) {
      console.error('Error loading tokens:', error);
    }
  }
}

// Setup the backend server
function setupBackendServer(window) {
  mainWindow = window;
  
  // Load saved tokens
  loadTokens();
  
  // Start the server if not already running
  if (!server) {
    server = expressApp.listen(PORT, () => {
      console.log(`Backend server running on http://localhost:${PORT}`);
    });
  }
  
  return server;
}

// Shutdown the server
function shutdownBackendServer() {
  if (server) {
    server.close();
    server = null;
    console.log('Backend server shut down');
  }
}

module.exports = {
  setupBackendServer,
  shutdownBackendServer,
  expressApp
}; 
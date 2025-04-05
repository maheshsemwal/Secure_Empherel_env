// Import required modules
const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');

// DOM Elements
const secureModeToggle = document.getElementById('secure-mode-toggle');
const statusText = document.getElementById('status-text');
const secureModeStatus = document.getElementById('secure-mode-status');
const sessionTime = document.getElementById('session-time');
const filesCount = document.getElementById('files-count');
const fileListBody = document.getElementById('file-list-body');
const refreshFilesBtn = document.getElementById('refresh-files');
const selectAllFiles = document.getElementById('select-all-files');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabPanes = document.querySelectorAll('.tab-pane');
const syncServiceSelect = document.getElementById('sync-service');
const syncFilesBtn = document.getElementById('sync-files');
const syncProgress = document.getElementById('sync-progress');
const progressBar = document.querySelector('.progress-bar');
const progressText = document.querySelector('.progress-text');
const connectButtons = document.querySelectorAll('.connect-btn');
const saveSettingsBtn = document.getElementById('save-settings');
const resetSettingsBtn = document.getElementById('reset-settings');
const statusMessage = document.getElementById('status-message');
const modal = document.getElementById('modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');
const modalCancel = document.getElementById('modal-cancel');
const modalConfirm = document.getElementById('modal-confirm');
const closeModalBtn = document.querySelector('.close-btn');

// State variables
let isSecureModeActive = false;
let sessionStartTime = null;
let sessionTimer = null;
let sessionFiles = [];
let selectedFiles = [];
let connectedServices = {
  google: false,
  onedrive: false,
  dropbox: false
};

// Settings
let settings = {
  startupSecureMode: false,
  minimizeToTray: true,
  hotkeySecureMode: 'Ctrl+Shift+S',
  cleanupBrowserHistory: true,
  cleanupTempFiles: true,
  cleanupRegistry: true,
  isolationLevel: 'medium',
  tempDirectory: ''
};

// Initialize the application
function init() {
  // Load settings
  loadSettings();
  
  // Update UI based on settings
  updateSettingsUI();
  
  // Set up event listeners
  setupEventListeners();
  
  // Check if secure mode should be enabled on startup
  if (settings.startupSecureMode) {
    toggleSecureMode(true);
  }
  
  // Update status message
  updateStatus('Ready');
}

// Load settings from storage
function loadSettings() {
  try {
    const storedSettings = localStorage.getItem('settings');
    if (storedSettings) {
      settings = JSON.parse(storedSettings);
    }
    
    // Get temp directory from main process
    ipcRenderer.send('get-temp-directory');
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

// Update UI based on settings
function updateSettingsUI() {
  document.getElementById('startup-secure-mode').checked = settings.startupSecureMode;
  document.getElementById('minimize-to-tray').checked = settings.minimizeToTray;
  document.getElementById('hotkey-secure-mode').value = settings.hotkeySecureMode;
  document.getElementById('cleanup-browser-history').checked = settings.cleanupBrowserHistory;
  document.getElementById('cleanup-temp-files').checked = settings.cleanupTempFiles;
  document.getElementById('cleanup-registry').checked = settings.cleanupRegistry;
  document.getElementById('isolation-level').value = settings.isolationLevel;
  document.getElementById('temp-directory').value = settings.tempDirectory;
}

// Set up event listeners
function setupEventListeners() {
  // Secure mode toggle
  secureModeToggle.addEventListener('change', () => {
    toggleSecureMode(secureModeToggle.checked);
  });
  
  // Tab switching
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const tabId = button.getAttribute('data-tab');
      switchTab(tabId);
    });
  });
  
  // Refresh files list
  refreshFilesBtn.addEventListener('click', () => {
    refreshFilesList();
  });
  
  // Select all files
  selectAllFiles.addEventListener('change', () => {
    const checkboxes = document.querySelectorAll('#file-list tbody input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      checkbox.checked = selectAllFiles.checked;
    });
    updateSelectedFiles();
  });
  
  // Sync files button
  syncFilesBtn.addEventListener('click', () => {
    syncSelectedFiles();
  });
  
  // Connect to cloud service buttons
  connectButtons.forEach(button => {
    button.addEventListener('click', () => {
      const service = button.getAttribute('data-service');
      connectToCloudService(service);
    });
  });
  
  // Save settings button
  saveSettingsBtn.addEventListener('click', () => {
    saveSettings();
  });
  
  // Reset settings button
  resetSettingsBtn.addEventListener('click', () => {
    resetSettings();
  });
  
  // Modal close button
  closeModalBtn.addEventListener('click', () => {
    closeModal();
  });
  
  // Modal cancel button
  modalCancel.addEventListener('click', () => {
    closeModal();
  });
  
  // Sync service selection
  syncServiceSelect.addEventListener('change', () => {
    updateSyncButtonState();
  });
  
  // IPC event listeners
  setupIPCListeners();
}

// Set up IPC event listeners
function setupIPCListeners() {
  // Secure mode toggle from main process
  ipcRenderer.on('secure-mode-toggle', (event, enabled) => {
    updateSecureModeUI(enabled);
  });
  
  // Add error handler for secure mode toggle
  ipcRenderer.on('secure-mode-error', (event, errorMessage) => {
    updateStatus(`Error: ${errorMessage}`);
    // Revert the toggle state in the UI
    secureModeToggle.checked = !secureModeToggle.checked;
    isSecureModeActive = secureModeToggle.checked;
    updateSecureModeUI(isSecureModeActive);
    
    // Show error modal
    showModal('Error', `Failed to toggle Secure Mode: ${errorMessage}`, 'OK');
  });
  
  // File list update
  ipcRenderer.on('file-list-update', (event, files) => {
    updateFilesList(files);
  });
  
  // Cleanup events
  ipcRenderer.on('cleanup-started', () => {
    updateStatus('Cleaning up session data...');
  });
  
  ipcRenderer.on('cleanup-completed', () => {
    updateStatus('Cleanup completed');
    resetSessionData();
  });
  
  ipcRenderer.on('cleanup-failed', (event, error) => {
    updateStatus(`Cleanup failed: ${error}`);
    showModal('Cleanup Failed', `Failed to clean up session data: ${error}`, 'OK');
  });
  
  // Cloud sync events
  ipcRenderer.on('sync-completed', (event, result) => {
    hideSyncProgress();
    updateStatus('Files synced successfully');
    showModal('Sync Completed', `Successfully synced ${result.count} files to ${result.service}`, 'OK');
  });
  
  ipcRenderer.on('sync-failed', (event, error) => {
    hideSyncProgress();
    updateStatus(`Sync failed: ${error}`);
    showModal('Sync Failed', `Failed to sync files: ${error}`, 'OK');
  });
  
  ipcRenderer.on('sync-progress', (event, progress) => {
    updateSyncProgress(progress);
  });
  
  // Cloud authentication events
  ipcRenderer.on('auth-success', (event, service) => {
    connectedServices[service] = true;
    updateCloudServiceUI(service);
    updateStatus(`Connected to ${getServiceName(service)}`);
  });
  
  ipcRenderer.on('auth-failed', (event, { service, error }) => {
    connectedServices[service] = false;
    updateCloudServiceUI(service);
    updateStatus(`Failed to connect to ${getServiceName(service)}`);
    showModal('Authentication Failed', `Failed to connect to ${getServiceName(service)}: ${error}`, 'OK');
  });
  
  // Temp directory response
  ipcRenderer.on('temp-directory', (event, directory) => {
    settings.tempDirectory = directory;
    document.getElementById('temp-directory').value = directory;
  });
}

// Toggle secure mode
function toggleSecureMode(enabled) {
  try {
    isSecureModeActive = enabled;
    
    // Update UI
    updateSecureModeUI(enabled);
    
    // Send to main process
    ipcRenderer.send('toggle-secure-mode', enabled);
    
    if (enabled) {
      // Start session timer
      startSessionTimer();
      
      // Refresh files list
      setTimeout(() => {
        refreshFilesList();
      }, 1000);
      
      updateStatus('Secure Mode activated');
    } else {
      // Show confirmation dialog
      showModal(
        'Disable Secure Mode',
        'Are you sure you want to disable Secure Mode? All temporary files will be cleaned up.',
        'Disable',
        () => {
          // End session timer
          stopSessionTimer();
          resetSessionData();
          updateStatus('Secure Mode deactivated');
        }
      );
    }
  } catch (error) {
    console.error('Error toggling secure mode:', error);
    updateStatus(`Error: ${error.message}`);
    
    // Revert the toggle state
    secureModeToggle.checked = !secureModeToggle.checked;
    isSecureModeActive = secureModeToggle.checked;
    updateSecureModeUI(isSecureModeActive);
  }
}

// Update secure mode UI
function updateSecureModeUI(enabled) {
  secureModeToggle.checked = enabled;
  statusText.textContent = `Secure Mode: ${enabled ? 'On' : 'Off'}`;
  secureModeStatus.textContent = enabled ? 'Active' : 'Inactive';
  
  const secureCard = document.getElementById('secure-mode-card');
  if (enabled) {
    secureCard.style.borderLeft = '4px solid var(--primary-color)';
  } else {
    secureCard.style.borderLeft = 'none';
  }
}

// Start session timer
function startSessionTimer() {
  sessionStartTime = new Date();
  
  // Clear existing timer if any
  if (sessionTimer) {
    clearInterval(sessionTimer);
  }
  
  // Update timer every second
  sessionTimer = setInterval(() => {
    updateSessionTime();
  }, 1000);
}

// Stop session timer
function stopSessionTimer() {
  if (sessionTimer) {
    clearInterval(sessionTimer);
    sessionTimer = null;
  }
}

// Update session time display
function updateSessionTime() {
  if (!sessionStartTime) return;
  
  const now = new Date();
  const diff = now - sessionStartTime;
  
  // Convert to hours, minutes, seconds
  const hours = Math.floor(diff / 3600000);
  const minutes = Math.floor((diff % 3600000) / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  // Format as HH:MM:SS
  const timeString = [
    hours.toString().padStart(2, '0'),
    minutes.toString().padStart(2, '0'),
    seconds.toString().padStart(2, '0')
  ].join(':');
  
  sessionTime.textContent = timeString;
}

// Reset session data
function resetSessionData() {
  sessionStartTime = null;
  sessionTime.textContent = '00:00:00';
  filesCount.textContent = '0 files';
  sessionFiles = [];
  selectedFiles = [];
  
  // Clear file list
  fileListBody.innerHTML = `
    <tr class="empty-state">
      <td colspan="5">No files have been modified in this session yet.</td>
    </tr>
  `;
}

// Refresh files list
function refreshFilesList() {
  if (!isSecureModeActive) return;
  
  updateStatus('Refreshing file list...');
  
  // Request file list from main process
  ipcRenderer.send('get-session-files');
  
  // For demo purposes, simulate file list update
  simulateFileListUpdate();
}

// Simulate file list update (for demo)
function simulateFileListUpdate() {
  
  updateStatus('File list refreshed');
}

// Update files list
function updateFilesList(files) {
  sessionFiles = files;
  filesCount.textContent = `${files.length} files`;
  
  if (files.length === 0) {
    fileListBody.innerHTML = `
      <tr class="empty-state">
        <td colspan="5">No files have been modified in this session yet.</td>
      </tr>
    `;
    return;
  }
  
  // Clear existing list
  fileListBody.innerHTML = '';
  
  // Add files to list
  files.forEach(file => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><input type="checkbox" data-id="${file.id}"></td>
      <td>${file.name}</td>
      <td>${file.path}</td>
      <td>${formatFileSize(file.size)}</td>
      <td>${formatDate(file.modified)}</td>
    `;
    fileListBody.appendChild(row);
  });
  
  // Add event listeners to checkboxes
  const checkboxes = document.querySelectorAll('#file-list tbody input[type="checkbox"]');
  checkboxes.forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      updateSelectedFiles();
    });
  });
}

// Update selected files
function updateSelectedFiles() {
  selectedFiles = [];
  
  const checkboxes = document.querySelectorAll('#file-list tbody input[type="checkbox"]:checked');
  checkboxes.forEach(checkbox => {
    const fileId = parseInt(checkbox.getAttribute('data-id'));
    const file = sessionFiles.find(f => f.id === fileId);
    if (file) {
      selectedFiles.push(file);
    }
  });
  
  // Update sync button state
  updateSyncButtonState();
}

// Update sync button state
function updateSyncButtonState() {
  const service = syncServiceSelect.value;
  
  if (selectedFiles.length > 0 && service && connectedServices[service]) {
    syncFilesBtn.disabled = false;
  } else {
    syncFilesBtn.disabled = true;
  }
}

// Sync selected files
function syncSelectedFiles() {
  if (selectedFiles.length === 0) return;
  
  const service = syncServiceSelect.value;
  if (!service || !connectedServices[service]) return;
  
  updateStatus(`Syncing ${selectedFiles.length} files to ${getServiceName(service)}...`);
  showSyncProgress();
  
  // Send sync request to main process
  ipcRenderer.send('sync-to-cloud', {
    service,
    files: selectedFiles
  });
  
  // For demo purposes, simulate sync progress
  simulateSyncProgress();
}

// Simulate sync progress (for demo)
function simulateSyncProgress() {
  let progress = 0;
  const interval = setInterval(() => {
    progress += 10;
    updateSyncProgress(progress);
    
    if (progress >= 100) {
      clearInterval(interval);
      
      // Simulate completion after a short delay
      setTimeout(() => {
        ipcRenderer.send('sync-completed', {
          service: syncServiceSelect.value,
          count: selectedFiles.length
        });
      }, 500);
    }
  }, 300);
}

// Show sync progress
function showSyncProgress() {
  syncProgress.classList.remove('hidden');
  updateSyncProgress(0);
}

// Hide sync progress
function hideSyncProgress() {
  syncProgress.classList.add('hidden');
}

// Update sync progress
function updateSyncProgress(progress) {
  progressBar.style.width = `${progress}%`;
  progressText.textContent = `${progress}%`;
}

// Connect to cloud service
function connectToCloudService(service) {
  updateStatus(`Connecting to ${getServiceName(service)}...`);
  
  // Send authentication request to main process
  ipcRenderer.send('authenticate-cloud-service', service);
  
  // For demo purposes, simulate authentication
  simulateAuthentication(service);
}

// Simulate authentication (for demo)
function simulateAuthentication(service) {
  setTimeout(() => {
    // Simulate successful authentication
    connectedServices[service] = true;
    updateCloudServiceUI(service);
    updateStatus(`Connected to ${getServiceName(service)}`);
    
    // Update sync button state
    updateSyncButtonState();
  }, 1500);
}

// Update cloud service UI
function updateCloudServiceUI(service) {
  const statusElement = document.getElementById(`${service}-status`);
  const connectButton = document.querySelector(`.connect-btn[data-service="${service}"]`);
  
  if (connectedServices[service]) {
    statusElement.textContent = 'Connected';
    statusElement.style.color = 'var(--success-color)';
    connectButton.textContent = 'Disconnect';
  } else {
    statusElement.textContent = 'Not connected';
    statusElement.style.color = 'var(--text-muted)';
    connectButton.textContent = 'Connect';
  }
}

// Save settings
function saveSettings() {
  settings.startupSecureMode = document.getElementById('startup-secure-mode').checked;
  settings.minimizeToTray = document.getElementById('minimize-to-tray').checked;
  settings.cleanupBrowserHistory = document.getElementById('cleanup-browser-history').checked;
  settings.cleanupTempFiles = document.getElementById('cleanup-temp-files').checked;
  settings.cleanupRegistry = document.getElementById('cleanup-registry').checked;
  settings.isolationLevel = document.getElementById('isolation-level').value;
  
  // Save to localStorage
  localStorage.setItem('settings', JSON.stringify(settings));
  
  // Send settings to main process
  ipcRenderer.send('update-settings', settings);
  
  updateStatus('Settings saved');
}

// Reset settings
function resetSettings() {
  // Show confirmation dialog
  showModal(
    'Reset Settings',
    'Are you sure you want to reset all settings to default values?',
    'Reset',
    () => {
      // Reset to defaults
      settings = {
        startupSecureMode: false,
        minimizeToTray: true,
        hotkeySecureMode: 'Ctrl+Shift+S',
        cleanupBrowserHistory: true,
        cleanupTempFiles: true,
        cleanupRegistry: true,
        isolationLevel: 'medium',
        tempDirectory: settings.tempDirectory // Keep the temp directory
      };
      
      // Update UI
      updateSettingsUI();
      
      // Save to localStorage
      localStorage.setItem('settings', JSON.stringify(settings));
      
      // Send settings to main process
      ipcRenderer.send('update-settings', settings);
      
      updateStatus('Settings reset to defaults');
    }
  );
}

// Switch tab
function switchTab(tabId) {
  // Update tab buttons
  tabButtons.forEach(button => {
    if (button.getAttribute('data-tab') === tabId) {
      button.classList.add('active');
    } else {
      button.classList.remove('active');
    }
  });
  
  // Update tab panes
  tabPanes.forEach(pane => {
    if (pane.id === tabId) {
      pane.classList.add('active');
    } else {
      pane.classList.remove('active');
    }
  });
}

// Show modal
function showModal(title, message, confirmText = 'Confirm', onConfirm = null, onCancel = null) {
  modalTitle.textContent = title;
  modalBody.innerHTML = `<p>${message}</p>`;
  modalConfirm.textContent = confirmText;
  
  // Store callbacks
  modalConfirm.onclick = () => {
    if (onConfirm) onConfirm();
    closeModal();
  };
  
  if (onCancel) {
    modalCancel.onclick = () => {
      onCancel();
      closeModal();
    };
  } else {
    modalCancel.onclick = closeModal;
  }
  
  // Show modal
  modal.style.display = 'flex';
}

// Close modal
function closeModal() {
  modal.style.display = 'none';
}

// Update status message
function updateStatus(message) {
  statusMessage.textContent = message;
}

// Helper functions
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString();
}

function getServiceName(service) {
  switch (service) {
    case 'google': return 'Google Drive';
    case 'onedrive': return 'OneDrive';
    case 'dropbox': return 'Dropbox';
    default: return service;
  }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', init); 
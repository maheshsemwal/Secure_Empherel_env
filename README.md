# Secure Ephemeral Workspace for public PC's

A cross-platform application that provides an incognito-like mode for public computers, ensuring all user activities, files, and session data are deleted upon logout while still allowing access to existing software and files on the system.

## Features

- **Secure Mode Activation**: Toggle button to enable Secure Mode, redirecting all file changes to a virtual sandbox layer
- **Automatic Cleanup**: Deletes all user activity, session data, and temporary files on logout
- **Cloud Sync Option**: Allows users to select and sync files to Google Drive, OneDrive, or Dropbox before logout
- **User-Friendly Interface**: Simple UI for enabling Secure Mode, viewing session files, and selecting files to sync

## Project Structure

```
secure-ephemeral-workspace/
├── src/                    # Source code
│   ├── backend/            # Backend API for cloud storage integration
│   ├── frontend/           # Electron.js UI
│   ├── isolation/          # OS-specific isolation mechanisms
│   │   ├── windows/        # Windows Sandbox implementation
│   │   └── linux/          # OverlayFS implementation
│   └── cloud/              # Cloud service integrations
├── scripts/                # Automation scripts
│   ├── windows/            # PowerShell scripts
│   └── linux/              # Bash scripts
├── docs/                   # Documentation
└── tests/                  # Test files
```

## Development Roadmap

1. **Research & Testing** (1-2 Weeks)
   - Test isolation mechanisms
   - Write basic scripts for session management
   - Verify cleanup functionality

2. **Secure Mode Implementation** (2-3 Weeks)
   - Implement UI for toggling Secure Mode
   - Automate temporary session creation and isolation
   - Ensure proper cleanup after logout

3. **Cloud Sync** (2-3 Weeks)
   - Implement cloud storage APIs
   - Allow file selection for backup
   - Test authentication and file restoration

4. **UI & User Experience** (2 Weeks)
   - Build user-friendly interface
   - Display session status and sync options
   - Add hotkey support

5. **Testing, Security & Deployment** (3-4 Weeks)
   - Multi-user testing on different OS versions
   - Performance optimization
   - Security enhancements

## Technologies Used

- **Session Management**: OverlayFS (Linux), Windows Sandbox, PowerShell, Bash
- **Cleanup & Automation**: PowerShell (Windows), Bash & PAM (Linux)
- **Cloud Storage**: Google Drive API, OneDrive API, Dropbox API
- **Backend**: Node.js (Express.js)
- **Frontend**: Electron.js
- **Authentication**: OAuth 2.0

## Setup Instructions

### Prerequisites
- Node.js (v14+)
- npm or yarn
- Windows 10+ or Linux (Ubuntu 18.04+)
- Administrative privileges (for system-level operations)

### Installation
1. Clone the repository
2. Run `npm install` to install dependencies
3. Configure cloud service API keys in `.env` file
4. Run `npm start` to launch the application

## License
MIT 

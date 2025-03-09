# Secure Ephemeral Workspace - Windows Sandbox Creation Script
# This script creates a sandbox environment for secure ephemeral workspace

param (
    [string]$SandboxDir = "$env:TEMP\secure-workspace\sandbox",
    [switch]$Cleanup = $false
)

# Ensure running as administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator. Please restart with elevated privileges."
    exit 1
}

# Function to create sandbox environment
function Create-Sandbox {
    param (
        [string]$SandboxDir
    )
    
    Write-Host "Creating sandbox environment at $SandboxDir..." -ForegroundColor Green
    
    # Create sandbox directory if it doesn't exist
    if (-not (Test-Path $SandboxDir)) {
        New-Item -Path $SandboxDir -ItemType Directory -Force | Out-Null
    }
    
    # User profile folders to redirect
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
        $sandboxFolder = "$SandboxDir\$folder"
        if (-not (Test-Path $sandboxFolder)) {
            New-Item -Path $sandboxFolder -ItemType Directory -Force | Out-Null
        }
        
        # Backup original folder if needed
        $originalFolder = "$userProfilePath\$folder"
        $backupFolder = "$originalFolder.backup"
        
        if (Test-Path $originalFolder) {
            if (-not (Test-Path $backupFolder)) {
                Write-Host "Backing up $originalFolder to $backupFolder" -ForegroundColor Yellow
                Rename-Item -Path $originalFolder -NewName "$folder.backup" -Force
            }
        }
        
        # Create junction point
        if (-not (Test-Path $originalFolder)) {
            Write-Host "Creating junction from $originalFolder to $sandboxFolder" -ForegroundColor Yellow
            New-Item -Path $originalFolder -ItemType Junction -Value $sandboxFolder -Force | Out-Null
        }
    }
    
    # Backup registry settings
    $registryBackupFile = "$env:TEMP\secure-workspace\registry-backup.reg"
    
    # Registry keys to backup
    $registryKeys = @(
        "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist",
        "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs",
        "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\RunMRU",
        "HKCU\Software\Microsoft\Windows\CurrentVersion\Explorer\TypedPaths"
    )
    
    # Export registry keys
    foreach ($key in $registryKeys) {
        Write-Host "Backing up registry key: $key" -ForegroundColor Yellow
        reg export $key $registryBackupFile /y | Out-Null
    }
    
    Write-Host "Sandbox environment created successfully!" -ForegroundColor Green
}

# Function to clean up sandbox environment
function Cleanup-Sandbox {
    param (
        [string]$SandboxDir
    )
    
    Write-Host "Cleaning up sandbox environment..." -ForegroundColor Green
    
    # User profile folders to restore
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
        $originalFolder = "$userProfilePath\$folder"
        $backupFolder = "$originalFolder.backup"
        
        # Remove junction if it exists
        if (Test-Path $originalFolder) {
            $folderInfo = Get-Item $originalFolder -Force
            if ($folderInfo.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
                Write-Host "Removing junction: $originalFolder" -ForegroundColor Yellow
                Remove-Item -Path $originalFolder -Force
            }
        }
        
        # Restore original folder if backup exists
        if (Test-Path $backupFolder) {
            Write-Host "Restoring $backupFolder to $originalFolder" -ForegroundColor Yellow
            Rename-Item -Path $backupFolder -NewName $folder -Force
        }
    }
    
    # Restore registry settings
    $registryBackupFile = "$env:TEMP\secure-workspace\registry-backup.reg"
    if (Test-Path $registryBackupFile) {
        Write-Host "Restoring registry settings from $registryBackupFile" -ForegroundColor Yellow
        reg import $registryBackupFile | Out-Null
        Remove-Item -Path $registryBackupFile -Force
    }
    
    # Clean up sandbox directory
    if (Test-Path $SandboxDir) {
        Write-Host "Removing sandbox directory: $SandboxDir" -ForegroundColor Yellow
        Remove-Item -Path $SandboxDir -Recurse -Force
    }
    
    Write-Host "Sandbox environment cleaned up successfully!" -ForegroundColor Green
}

# Main execution
if ($Cleanup) {
    Cleanup-Sandbox -SandboxDir $SandboxDir
} else {
    Create-Sandbox -SandboxDir $SandboxDir
} 
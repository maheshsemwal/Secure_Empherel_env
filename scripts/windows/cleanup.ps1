# Secure Ephemeral Workspace - Windows Cleanup Script
# This script cleans up user activity traces on Windows

param (
    [switch]$CleanBrowserHistory = $true,
    [switch]$CleanTempFiles = $true,
    [switch]$CleanRegistry = $true
)

# Ensure running as administrator
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Error "This script must be run as Administrator. Please restart with elevated privileges."
    exit 1
}

# Function to clean browser history
function Clean-BrowserHistory {
    Write-Host "Cleaning browser history..." -ForegroundColor Green
    
    # Clean Chrome history
    $chromePath = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default"
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
        $filePath = "$chromePath\$file"
        if (Test-Path $filePath) {
            try {
                Write-Host "Removing Chrome file: $file" -ForegroundColor Yellow
                Remove-Item -Path $filePath -Force -ErrorAction SilentlyContinue
            } catch {
                Write-Host "Could not remove $filePath: $_" -ForegroundColor Red
            }
        }
    }
    
    # Clean Edge history
    $edgePath = "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default"
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
        $filePath = "$edgePath\$file"
        if (Test-Path $filePath) {
            try {
                Write-Host "Removing Edge file: $file" -ForegroundColor Yellow
                Remove-Item -Path $filePath -Force -ErrorAction SilentlyContinue
            } catch {
                Write-Host "Could not remove $filePath: $_" -ForegroundColor Red
            }
        }
    }
    
    # Clean Firefox history
    $firefoxPath = "$env:APPDATA\Mozilla\Firefox\Profiles"
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
                $filePath = "$($profile.FullName)\$file"
                if (Test-Path $filePath) {
                    try {
                        Write-Host "Removing Firefox file: $file from profile $($profile.Name)" -ForegroundColor Yellow
                        Remove-Item -Path $filePath -Force -ErrorAction SilentlyContinue
                    } catch {
                        Write-Host "Could not remove $filePath: $_" -ForegroundColor Red
                    }
                }
            }
        }
    }
    
    Write-Host "Browser history cleaned successfully!" -ForegroundColor Green
}

# Function to clean temporary files
function Clean-TempFiles {
    Write-Host "Cleaning temporary files..." -ForegroundColor Green
    
    # Clean Windows temp files
    $tempFolders = @(
        "$env:TEMP",
        "$env:USERPROFILE\AppData\Local\Temp"
    )
    
    foreach ($folder in $tempFolders) {
        if (Test-Path $folder) {
            Write-Host "Cleaning temporary files in $folder" -ForegroundColor Yellow
            Get-ChildItem -Path $folder -File -Recurse -ErrorAction SilentlyContinue | 
                Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-3) } | 
                ForEach-Object {
                    try {
                        Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
                        Write-Host "Removed: $($_.FullName)" -ForegroundColor Gray
                    } catch {
                        Write-Host "Could not remove $($_.FullName): $_" -ForegroundColor Red
                    }
                }
        }
    }
    
    # Clean recent items
    $recentItemsPath = "$env:APPDATA\Microsoft\Windows\Recent"
    if (Test-Path $recentItemsPath) {
        Write-Host "Cleaning recent items in $recentItemsPath" -ForegroundColor Yellow
        Get-ChildItem -Path $recentItemsPath -File -ErrorAction SilentlyContinue | 
            Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-3) } | 
            ForEach-Object {
                try {
                    Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
                    Write-Host "Removed recent item: $($_.Name)" -ForegroundColor Gray
                } catch {
                    Write-Host "Could not remove $($_.FullName): $_" -ForegroundColor Red
                }
            }
    }
    
    # Clean prefetch files
    $prefetchPath = "$env:WINDIR\Prefetch"
    if (Test-Path $prefetchPath) {
        Write-Host "Cleaning prefetch files in $prefetchPath" -ForegroundColor Yellow
        Get-ChildItem -Path $prefetchPath -File -ErrorAction SilentlyContinue | 
            Where-Object { $_.LastWriteTime -gt (Get-Date).AddHours(-3) } | 
            ForEach-Object {
                try {
                    Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
                    Write-Host "Removed prefetch file: $($_.Name)" -ForegroundColor Gray
                } catch {
                    Write-Host "Could not remove $($_.FullName): $_" -ForegroundColor Red
                }
            }
    }
    
    Write-Host "Temporary files cleaned successfully!" -ForegroundColor Green
}

# Function to clean registry entries
function Clean-Registry {
    Write-Host "Cleaning registry entries..." -ForegroundColor Green
    
    # Registry keys to clean
    $registryKeys = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\UserAssist",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\RecentDocs",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\RunMRU",
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\TypedPaths"
    )
    
    foreach ($key in $registryKeys) {
        if (Test-Path $key) {
            Write-Host "Cleaning registry key: $key" -ForegroundColor Yellow
            
            try {
                # Backup the key first
                $backupFile = "$env:TEMP\secure-workspace\$(Split-Path $key -Leaf)-backup.reg"
                $backupDir = Split-Path $backupFile -Parent
                
                if (-not (Test-Path $backupDir)) {
                    New-Item -Path $backupDir -ItemType Directory -Force | Out-Null
                }
                
                $regKey = $key.Replace("HKCU:", "HKCU\")
                reg export $regKey $backupFile /y | Out-Null
                
                # Clear the key (remove all values)
                $keyObj = Get-Item -Path $key
                $keyObj.Property | ForEach-Object {
                    Remove-ItemProperty -Path $key -Name $_ -Force
                    Write-Host "Removed registry value: $_" -ForegroundColor Gray
                }
            } catch {
                Write-Host "Could not clean registry key $key: $_" -ForegroundColor Red
            }
        }
    }
    
    Write-Host "Registry entries cleaned successfully!" -ForegroundColor Green
}

# Main execution
if ($CleanBrowserHistory) {
    Clean-BrowserHistory
}

if ($CleanTempFiles) {
    Clean-TempFiles
}

if ($CleanRegistry) {
    Clean-Registry
}

Write-Host "Cleanup completed successfully!" -ForegroundColor Green 
#!/bin/bash
# Secure Ephemeral Workspace - Linux OverlayFS Setup Script
# This script sets up OverlayFS for secure ephemeral workspace

# Default paths
TEMP_DIR="/tmp/secure-workspace"
OVERLAY_DIR="$TEMP_DIR/overlay"
WORK_DIR="$TEMP_DIR/work"
MERGED_DIR="$TEMP_DIR/merged"

# Parse command line arguments
CLEANUP=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --cleanup)
      CLEANUP=true
      shift
      ;;
    --temp-dir=*)
      TEMP_DIR="${1#*=}"
      OVERLAY_DIR="$TEMP_DIR/overlay"
      WORK_DIR="$TEMP_DIR/work"
      MERGED_DIR="$TEMP_DIR/merged"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Check if running as root
if [ "$EUID" -ne 0 ]; then
  echo "This script must be run as root. Please use sudo."
  exit 1
fi

# Function to set up OverlayFS
setup_overlayfs() {
  echo "Setting up OverlayFS..."
  
  # Create necessary directories
  mkdir -p "$OVERLAY_DIR" "$WORK_DIR" "$MERGED_DIR"
  
  # Directories to overlay
  OVERLAY_DIRS=(
    "Documents"
    "Downloads"
    "Pictures"
    "Videos"
    "Music"
    "Desktop"
  )
  
  # Get user home directory
  HOME_DIR=$(eval echo ~$SUDO_USER)
  
  # Mount each directory with OverlayFS
  for dir in "${OVERLAY_DIRS[@]}"; do
    LOWER_DIR="$HOME_DIR/$dir"
    UPPER_DIR="$OVERLAY_DIR/$dir"
    WORK_DIR_SPECIFIC="$WORK_DIR/$dir"
    MERGED_DIR_SPECIFIC="$MERGED_DIR/$dir"
    
    # Create directories if they don't exist
    mkdir -p "$UPPER_DIR" "$WORK_DIR_SPECIFIC" "$MERGED_DIR_SPECIFIC"
    
    # Ensure the lower directory exists
    if [ ! -d "$LOWER_DIR" ]; then
      mkdir -p "$LOWER_DIR"
      chown $SUDO_USER:$SUDO_USER "$LOWER_DIR"
    fi
    
    # Mount OverlayFS
    echo "Mounting OverlayFS for $dir..."
    mount -t overlay overlay -o lowerdir="$LOWER_DIR",upperdir="$UPPER_DIR",workdir="$WORK_DIR_SPECIFIC" "$MERGED_DIR_SPECIFIC"
    
    # Create symbolic link to merged directory
    ln -sf "$MERGED_DIR_SPECIFIC" "$LOWER_DIR.secure"
    chown -h $SUDO_USER:$SUDO_USER "$LOWER_DIR.secure"
  done
  
  echo "OverlayFS setup completed successfully!"
}

# Function to clean up OverlayFS
cleanup_overlayfs() {
  echo "Cleaning up OverlayFS..."
  
  # Directories to unmount
  OVERLAY_DIRS=(
    "Documents"
    "Downloads"
    "Pictures"
    "Videos"
    "Music"
    "Desktop"
  )
  
  # Get user home directory
  HOME_DIR=$(eval echo ~$SUDO_USER)
  
  # Unmount each directory
  for dir in "${OVERLAY_DIRS[@]}"; do
    MERGED_DIR_SPECIFIC="$MERGED_DIR/$dir"
    SYMLINK_PATH="$HOME_DIR/$dir.secure"
    
    # Remove symbolic link
    if [ -L "$SYMLINK_PATH" ]; then
      echo "Removing symbolic link: $SYMLINK_PATH"
      rm -f "$SYMLINK_PATH"
    fi
    
    # Unmount OverlayFS
    if mount | grep -q "$MERGED_DIR_SPECIFIC"; then
      echo "Unmounting OverlayFS for $dir..."
      umount "$MERGED_DIR_SPECIFIC"
    fi
  done
  
  # Clean up directories
  if [ -d "$TEMP_DIR" ]; then
    echo "Removing temporary directories..."
    rm -rf "$TEMP_DIR"
  fi
  
  echo "OverlayFS cleanup completed successfully!"
}

# Main execution
if [ "$CLEANUP" = true ]; then
  cleanup_overlayfs
else
  setup_overlayfs
fi 
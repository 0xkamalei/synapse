#!/bin/bash

PLIST_NAME="com.synapse.open_daily_urls.plist"
SOURCE_PLIST="/Users/lei/dev/projects/synapse/scripts/$PLIST_NAME"
TARGET_PLIST="/Users/lei/Library/LaunchAgents/$PLIST_NAME"

# Check if source file exists
if [ ! -f "$SOURCE_PLIST" ]; then
    echo "Error: Source file $SOURCE_PLIST not found."
    exit 1
fi

echo "Unloading service (if exists)..."
launchctl unload "$TARGET_PLIST" 2>/dev/null

echo "Copying $PLIST_NAME to LaunchAgents..."
cp "$SOURCE_PLIST" "$TARGET_PLIST"

echo "Loading service..."
launchctl load "$TARGET_PLIST"

echo "Service reloaded successfully."

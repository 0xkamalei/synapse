#!/bin/bash

# Path to the urls file
URL_FILE="/Users/lei/dev/projects/synapse/urls.txt"

# Check if file exists
if [ ! -f "$URL_FILE" ]; then
    echo "Error: $URL_FILE not found."
    exit 1
fi

# Ensure Google Chrome is running
if ! pgrep -x "Google Chrome" > /dev/null; then
    echo "Starting Google Chrome..."
    open -a "Google Chrome"
    sleep 3 # Give it some time to initialize
fi

# Read the file and open URLs
while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines
    [[ -z "$line" ]] && continue
    
    # Skip comment lines (lines starting with #)
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    
    # Try to extract URL: 
    # If line contains 'http', take everything from 'http' to the end
    if [[ "$line" == *"http"* ]]; then
        url="http${line#*http}"
        # Trim whitespace
        url=$(echo "$url" | xargs)
        
        if [ -n "$url" ]; then
            echo "Opening: $url"
            open -a "Google Chrome" "$url"
            # Add a small delay to prevent Apple Event timeouts (-1712)
            sleep 1
        fi
    fi
done < "$URL_FILE"

#!/bin/bash

# Path to the urls file
URL_FILE="/Users/lei/dev/personal/synapse/urls.txt"

# Check if file exists
if [ ! -f "$URL_FILE" ]; then
    echo "Error: $URL_FILE not found."
    exit 1
fi

# Read the file and open URLs
while IFS= read -r line || [ -n "$line" ]; do
    # Skip empty lines
    [[ -z "$line" ]] && continue
    
    # Try to extract URL: 
    # If line contains 'http', take everything from 'http' to the end
    if [[ "$line" == *"http"* ]]; then
        url="http${line#*http}"
        # Trim whitespace
        url=$(echo "$url" | xargs)
        
        if [ -n "$url" ]; then
            echo "Opening: $url"
            open -a "Google Chrome" "$url"
        fi
    fi
done < "$URL_FILE"

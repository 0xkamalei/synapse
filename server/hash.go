package main

import (
	"crypto/sha256"
	"fmt"
)

// hashURL returns the full SHA-256 hex string of the given URL.
func hashURL(url string) string {
	h := sha256.Sum256([]byte(url))
	return fmt.Sprintf("%x", h)
}

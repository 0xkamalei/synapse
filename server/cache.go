package main

import (
	"bufio"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"sync/atomic"
)

// Cache is a thread-safe in-memory map of hash IDs to relative file paths for upsert support.
type Cache struct {
	mu    sync.RWMutex
	items map[string]string // hashID → relative path from storageRoot
}

func NewCache() *Cache {
	return &Cache{items: make(map[string]string)}
}

func (c *Cache) Has(hashID string) bool {
	c.mu.RLock()
	defer c.mu.RUnlock()
	_, ok := c.items[hashID]
	return ok
}

// GetPath returns the relative path for a given hashID, or "" if not found.
func (c *Cache) GetPath(hashID string) string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.items[hashID]
}

func (c *Cache) Add(hashID, relPath string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.items[hashID] = relPath
}

func (c *Cache) Size() int {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return len(c.items)
}

type hashPathPair struct {
	hashID  string
	relPath string
}

// BuildFromDisk walks storageRoot, extracts hash_id from every .md front matter,
// and populates the cache with hash → relative path mappings.
func (c *Cache) BuildFromDisk(storageRoot string) (int, error) {
	var files []string
	err := filepath.Walk(storageRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return nil // skip unreadable paths
		}
		if !info.IsDir() && strings.HasSuffix(path, ".md") {
			files = append(files, path)
		}
		return nil
	})
	if err != nil {
		return 0, err
	}

	numWorkers := runtime.NumCPU()
	if numWorkers > 4 {
		numWorkers = 4
	}

	jobs := make(chan string, len(files))
	for _, f := range files {
		jobs <- f
	}
	close(jobs)

	var count int64
	var mu sync.Mutex
	var collected []hashPathPair
	var wg sync.WaitGroup

	for i := 0; i < numWorkers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			var local []hashPathPair
			for path := range jobs {
				if h := extractHashIDFromFile(path); h != "" {
					relPath, err := filepath.Rel(storageRoot, path)
					if err != nil {
						relPath = path
					}
					local = append(local, hashPathPair{hashID: h, relPath: relPath})
					atomic.AddInt64(&count, 1)
				}
			}
			mu.Lock()
			collected = append(collected, local...)
			mu.Unlock()
		}()
	}
	wg.Wait()

	c.mu.Lock()
	for _, p := range collected {
		c.items[p.hashID] = p.relPath
	}
	c.mu.Unlock()

	return int(count), nil
}

// extractHashIDFromFile reads only the YAML front matter of a .md file
// and returns the value of hash_id if present.
func extractHashIDFromFile(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	lineNum := 0
	inFrontMatter := false

	for scanner.Scan() {
		line := scanner.Text()
		lineNum++

		if lineNum == 1 {
			if line == "---" {
				inFrontMatter = true
				continue
			}
			return "" // no front matter
		}

		if inFrontMatter {
			if line == "---" {
				break
			}
			if strings.HasPrefix(line, "hash_id:") {
				val := strings.TrimSpace(strings.TrimPrefix(line, "hash_id:"))
				val = strings.Trim(val, `"'`)
				return val
			}
		}
	}
	return ""
}

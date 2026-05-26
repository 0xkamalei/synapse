package main

import (
	"encoding/base64"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode"
)

// ImageData represents a single image payload sent by the extension.
type ImageData struct {
	Data        string `json:"data"`         // base64-encoded image bytes
	MimeType    string `json:"mime_type"`    // e.g. "image/jpeg"
	OriginalURL string `json:"original_url"` // source URL (for fallback reference)
}

// AuthorInfo mirrors the extension's AuthorInfo type.
type AuthorInfo struct {
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
}

// EngagementMetrics mirrors the extension's EngagementMetrics interface.
type EngagementMetrics struct {
	Likes    *int `json:"likes,omitempty"`
	Comments *int `json:"comments,omitempty"`
	Reposts  *int `json:"reposts,omitempty"`
	Reads    *int `json:"reads,omitempty"`
	Views    *int `json:"views,omitempty"`
	Collects *int `json:"collects,omitempty"`
}

// CollectedContent mirrors the Chrome extension's CollectedContent interface.
// Images are base64-encoded instead of remote URLs.
type CollectedContent struct {
	Source      string             `json:"source"` // required
	Type        string             `json:"type"`   // text|image|video|article|unknown
	Title       string             `json:"title"`  // optional, used for readable filenames
	Text        string             `json:"text"`   // required
	Images      []ImageData        `json:"images"` // base64 images
	Videos      []string           `json:"videos"` // remote video URLs (stored as refs)
	Links       []string           `json:"links"`
	Tags        []string           `json:"tags"`
	Timestamp   string             `json:"timestamp"` // required, ISO 8601
	URL         string             `json:"url"`       // required
	Author      AuthorInfo         `json:"author"`
	CollectedAt string             `json:"collectedAt"` // required
	Engagement  *EngagementMetrics `json:"engagement,omitempty"`
}

// SaveResult is returned after a successful save.
type SaveResult struct {
	ID               string
	Path             string
	ImagesDownloaded int
}

// SaveContent writes the content as a Markdown file with YAML front matter
// and saves any base64 images to the images/ sub-directory.
func SaveContent(cfg *Config, content CollectedContent, hashID string) (*SaveResult, error) {
	ts, err := time.Parse(time.RFC3339, content.Timestamp)
	if err != nil {
		// Try without timezone offset
		ts, err = time.Parse("2006-01-02T15:04:05Z", content.Timestamp)
		if err != nil {
			ts = time.Now()
		}
	}

	year := ts.Format("2006")
	month := ts.Format("01")
	day := ts.Format("02")
	shortID := hashID[:16]

	dirPath := filepath.Join(cfg.StorageRoot, year, month)
	imgDir := filepath.Join(dirPath, "images")

	if err := os.MkdirAll(imgDir, 0755); err != nil {
		return nil, fmt.Errorf("create directories: %w", err)
	}

	// Save base64 images to disk
	var localImagePaths []string
	var remoteImageFallbacks []string
	imagesDownloaded := 0

	for i, img := range content.Images {
		if img.Data == "" {
			if img.OriginalURL != "" {
				remoteImageFallbacks = append(remoteImageFallbacks, img.OriginalURL)
			}
			continue
		}

		ext := mimeToExt(img.MimeType)
		filename := fmt.Sprintf("%s_%d.%s", shortID, i, ext)
		imgPath := filepath.Join(imgDir, filename)

		decoded, decErr := base64.StdEncoding.DecodeString(img.Data)
		if decErr != nil {
			decoded, decErr = base64.RawStdEncoding.DecodeString(img.Data)
		}
		if decErr != nil {
			if img.OriginalURL != "" {
				remoteImageFallbacks = append(remoteImageFallbacks, img.OriginalURL)
			}
			continue
		}

		if writeErr := os.WriteFile(imgPath, decoded, 0644); writeErr != nil {
			if img.OriginalURL != "" {
				remoteImageFallbacks = append(remoteImageFallbacks, img.OriginalURL)
			}
			continue
		}

		localImagePaths = append(localImagePaths, fmt.Sprintf("images/%s", filename))
		imagesDownloaded++
	}

	// Build full markdown document
	mdContent := buildMarkdown(hashID, content, localImagePaths, remoteImageFallbacks)

	mdFilename := buildMarkdownFilename(day, content, shortID, dirPath)
	mdPath := filepath.Join(dirPath, mdFilename)
	if err := os.WriteFile(mdPath, []byte(mdContent), 0644); err != nil {
		return nil, fmt.Errorf("write markdown file: %w", err)
	}

	return &SaveResult{
		ID:               shortID,
		Path:             filepath.Join(year, month, mdFilename),
		ImagesDownloaded: imagesDownloaded,
	}, nil
}

// UpdateContent fully overwrites an existing Markdown file at relPath (relative to storageRoot)
// with new content, preserving the same hash_id and file location.
func UpdateContent(cfg *Config, content CollectedContent, hashID string, relPath string) (*SaveResult, error) {
	absPath := filepath.Join(cfg.StorageRoot, relPath)
	imgDir := filepath.Join(filepath.Dir(absPath), "images")

	if err := os.MkdirAll(imgDir, 0755); err != nil {
		return nil, fmt.Errorf("create images directory: %w", err)
	}

	var localImagePaths []string
	var remoteImageFallbacks []string
	imagesDownloaded := 0

	for i, img := range content.Images {
		if img.Data == "" {
			if img.OriginalURL != "" {
				remoteImageFallbacks = append(remoteImageFallbacks, img.OriginalURL)
			}
			continue
		}

		ext := mimeToExt(img.MimeType)
		shortID := hashID[:16]
		filename := fmt.Sprintf("%s_%d.%s", shortID, i, ext)
		imgPath := filepath.Join(imgDir, filename)

		decoded, decErr := base64.StdEncoding.DecodeString(img.Data)
		if decErr != nil {
			decoded, decErr = base64.RawStdEncoding.DecodeString(img.Data)
		}
		if decErr != nil {
			if img.OriginalURL != "" {
				remoteImageFallbacks = append(remoteImageFallbacks, img.OriginalURL)
			}
			continue
		}

		if writeErr := os.WriteFile(imgPath, decoded, 0644); writeErr != nil {
			if img.OriginalURL != "" {
				remoteImageFallbacks = append(remoteImageFallbacks, img.OriginalURL)
			}
			continue
		}

		localImagePaths = append(localImagePaths, fmt.Sprintf("images/%s", filename))
		imagesDownloaded++
	}

	mdContent := buildMarkdown(hashID, content, localImagePaths, remoteImageFallbacks)

	if err := os.WriteFile(absPath, []byte(mdContent), 0644); err != nil {
		return nil, fmt.Errorf("overwrite markdown file: %w", err)
	}

	return &SaveResult{
		ID:               hashID[:16],
		Path:             relPath,
		ImagesDownloaded: imagesDownloaded,
	}, nil
}

// buildMarkdown assembles the YAML front matter and body of the Markdown file.
func buildMarkdown(hashID string, c CollectedContent, localImages, remoteImages []string) string {
	shortID := hashID[:16]
	var sb strings.Builder

	// --- Front matter ---
	sb.WriteString("---\n")
	wf := func(key, val string) {
		if val != "" {
			fmt.Fprintf(&sb, "%s: %q\n", key, val)
		}
	}
	wf("id", shortID)
	wf("hash_id", hashID)
	wf("source", c.Source)
	wf("type", c.Type)
	wf("title", c.Title)
	wf("url", c.URL)
	wf("original_date", c.Timestamp)
	wf("collected_at", c.CollectedAt)
	wf("author_username", c.Author.Username)
	wf("author_display_name", c.Author.DisplayName)

	if len(c.Tags) > 0 {
		sb.WriteString("tags:\n")
		for _, t := range c.Tags {
			fmt.Fprintf(&sb, "  - %q\n", t)
		}
	}
	if len(localImages) > 0 {
		sb.WriteString("images:\n")
		for _, img := range localImages {
			fmt.Fprintf(&sb, "  - %q\n", img)
		}
	}
	if len(remoteImages) > 0 {
		sb.WriteString("images_remote_fallback:\n")
		for _, img := range remoteImages {
			fmt.Fprintf(&sb, "  - %q\n", img)
		}
	}
	if len(c.Videos) > 0 {
		sb.WriteString("videos:\n")
		for _, v := range c.Videos {
			fmt.Fprintf(&sb, "  - %q\n", v)
		}
	}
	if len(c.Links) > 0 {
		sb.WriteString("links:\n")
		for _, l := range c.Links {
			fmt.Fprintf(&sb, "  - %q\n", l)
		}
	}
	sb.WriteString("status: \"collected\"\n")
	sb.WriteString("server_version: \"1\"\n")
	if c.Engagement != nil {
		e := c.Engagement
		if e.Reads != nil {
			fmt.Fprintf(&sb, "engagement_reads: %d\n", *e.Reads)
		}
		if e.Likes != nil {
			fmt.Fprintf(&sb, "engagement_likes: %d\n", *e.Likes)
		}
		if e.Comments != nil {
			fmt.Fprintf(&sb, "engagement_comments: %d\n", *e.Comments)
		}
		if e.Reposts != nil {
			fmt.Fprintf(&sb, "engagement_reposts: %d\n", *e.Reposts)
		}
		if e.Views != nil {
			fmt.Fprintf(&sb, "engagement_views: %d\n", *e.Views)
		}
		if e.Collects != nil {
			fmt.Fprintf(&sb, "engagement_collects: %d\n", *e.Collects)
		}
	}
	sb.WriteString("---\n\n")

	// --- Body ---
	if c.Text != "" {
		sb.WriteString(c.Text)
		sb.WriteString("\n")
	}

	// Inline image references for Markdown viewers
	for _, img := range localImages {
		fmt.Fprintf(&sb, "\n![image](%s)\n", img)
	}

	return sb.String()
}

func buildMarkdownFilename(day string, content CollectedContent, shortID, dirPath string) string {
	platform := slugify(strings.ToLower(content.Source), 24)
	if platform == "" {
		platform = "unknown"
	}

	titleSource := strings.TrimSpace(content.Title)
	maxTitleRunes := 64
	if titleSource == "" {
		titleSource = firstRunes(strings.TrimSpace(content.Text), 8)
		maxTitleRunes = 8
	}

	title := slugify(titleSource, maxTitleRunes)
	if title == "" {
		title = shortID[:8]
	}

	base := fmt.Sprintf("%s-%s-%s", day, platform, title)
	filename := base + ".md"
	if _, err := os.Stat(filepath.Join(dirPath, filename)); os.IsNotExist(err) {
		return filename
	}

	return fmt.Sprintf("%s-%s.md", base, shortID[:8])
}

func slugify(value string, maxRunes int) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}

	var sb strings.Builder
	lastWasDash := false
	written := 0

	for _, r := range value {
		if maxRunes > 0 && written >= maxRunes {
			break
		}
		if unicode.IsControl(r) {
			continue
		}

		if isFilenameSeparator(r) {
			if sb.Len() > 0 && !lastWasDash {
				sb.WriteRune('-')
				lastWasDash = true
			}
			continue
		}

		sb.WriteRune(r)
		lastWasDash = false
		written++
	}

	return strings.Trim(sb.String(), "-.")
}

func isFilenameSeparator(r rune) bool {
	if unicode.IsSpace(r) {
		return true
	}
	switch r {
	case '/', '\\', ':', '*', '?', '"', '<', '>', '|', '#', '%', '&', '{', '}', '$', '!', '\'', '@', '+', '`', '=', '，', '。', '、', '；', '：', '？', '！':
		return true
	default:
		return false
	}
}

func firstRunes(value string, maxRunes int) string {
	var sb strings.Builder
	count := 0
	for _, r := range value {
		if count >= maxRunes {
			break
		}
		sb.WriteRune(r)
		count++
	}
	return sb.String()
}

func mimeToExt(mime string) string {
	switch strings.ToLower(mime) {
	case "image/jpeg", "image/jpg":
		return "jpg"
	case "image/png":
		return "png"
	case "image/gif":
		return "gif"
	case "image/webp":
		return "webp"
	default:
		return "jpg"
	}
}

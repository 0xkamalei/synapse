package main

import (
	"encoding/json"
	"net/http"
	"time"
)

// Handler holds shared server dependencies.
type Handler struct {
	cfg       *Config
	cache     *Cache
	scheduler *Scheduler
	startAt   time.Time
}

func NewHandler(cfg *Config, cache *Cache, scheduler *Scheduler) *Handler {
	return &Handler{cfg: cfg, cache: cache, scheduler: scheduler, startAt: time.Now()}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// GET / — no auth required, serves API documentation
func (h *Handler) Index(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(DocHTML))
}

// GET /health — no auth required
func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":         "ok",
		"version":        version,
		"cache_size":     h.cache.Size(),
		"uptime_seconds": int(time.Since(h.startAt).Seconds()),
		"storage_root":   h.cfg.StorageRoot,
	})
}

// POST /collect — save a single item
func (h *Handler) Collect(w http.ResponseWriter, r *http.Request) {
	var content CollectedContent
	if err := json.NewDecoder(r.Body).Decode(&content); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}

	if content.URL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing required field: url"})
		return
	}
	if content.Text == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing required field: text"})
		return
	}
	if content.Source == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing required field: source"})
		return
	}

	hashID := hashURL(content.URL)

	if h.cache.Has(hashID) {
		writeJSON(w, http.StatusConflict, map[string]any{
			"status":  "duplicate",
			"id":      hashID[:16],
			"message": "content already exists",
		})
		return
	}

	result, err := SaveContent(h.cfg, content, hashID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.cache.Add(hashID, result.Path)

	writeJSON(w, http.StatusOK, map[string]any{
		"status":            "saved",
		"id":                result.ID,
		"path":              result.Path,
		"images_downloaded": result.ImagesDownloaded,
	})
}

// BatchRequest is the body for POST /collect/batch
type BatchRequest struct {
	Items []CollectedContent `json:"items"`
}

// ItemResult is one entry in a batch response
type ItemResult struct {
	URL    string `json:"url"`
	Status string `json:"status"`
	ID     string `json:"id,omitempty"`
	Error  string `json:"error,omitempty"`
}

// POST /collect/batch — save multiple items
func (h *Handler) CollectBatch(w http.ResponseWriter, r *http.Request) {
	var req BatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	total := len(req.Items)
	saved, duplicates, errors := 0, 0, 0
	results := make([]ItemResult, 0, total)

	for _, content := range req.Items {
		if content.URL == "" || content.Text == "" || content.Source == "" {
			errors++
			results = append(results, ItemResult{URL: content.URL, Status: "error", Error: "missing required fields"})
			continue
		}

		hashID := hashURL(content.URL)

		if h.cache.Has(hashID) {
			duplicates++
			results = append(results, ItemResult{URL: content.URL, Status: "duplicate", ID: hashID[:16]})
			continue
		}

		result, err := SaveContent(h.cfg, content, hashID)
		if err != nil {
			errors++
			results = append(results, ItemResult{URL: content.URL, Status: "error", Error: err.Error()})
			continue
		}

		h.cache.Add(hashID, result.Path)
		saved++
		results = append(results, ItemResult{URL: content.URL, Status: "saved", ID: result.ID})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"total":      total,
		"saved":      saved,
		"duplicates": duplicates,
		"errors":     errors,
		"results":    results,
	})
}

// GET /check?url=<encoded-url>
func (h *Handler) Check(w http.ResponseWriter, r *http.Request) {
	url := r.URL.Query().Get("url")
	if url == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing url parameter"})
		return
	}

	hashID := hashURL(url)
	exists := h.cache.Has(hashID)

	resp := map[string]any{"exists": exists}
	if exists {
		resp["id"] = hashID[:16]
	}
	writeJSON(w, http.StatusOK, resp)
}

// CheckBatchRequest is the body for POST /check/batch
type CheckBatchRequest struct {
	URLs []string `json:"urls"`
}

// POST /check/batch
func (h *Handler) CheckBatch(w http.ResponseWriter, r *http.Request) {
	var req CheckBatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	existing := make([]string, 0)
	for _, url := range req.URLs {
		if url != "" && h.cache.Has(hashURL(url)) {
			existing = append(existing, url)
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{"existing": existing})
}

// POST /upsert — create or fully overwrite a single item
func (h *Handler) Upsert(w http.ResponseWriter, r *http.Request) {
	var content CollectedContent
	if err := json.NewDecoder(r.Body).Decode(&content); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON: " + err.Error()})
		return
	}

	if content.URL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing required field: url"})
		return
	}
	if content.Text == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing required field: text"})
		return
	}
	if content.Source == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "missing required field: source"})
		return
	}

	hashID := hashURL(content.URL)

	if h.cache.Has(hashID) {
		relPath := h.cache.GetPath(hashID)
		result, err := UpdateContent(h.cfg, content, hashID, relPath)
		if err != nil {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"status":            "updated",
			"id":                result.ID,
			"path":              result.Path,
			"images_downloaded": result.ImagesDownloaded,
		})
		return
	}

	result, err := SaveContent(h.cfg, content, hashID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	h.cache.Add(hashID, result.Path)

	writeJSON(w, http.StatusOK, map[string]any{
		"status":            "saved",
		"id":                result.ID,
		"path":              result.Path,
		"images_downloaded": result.ImagesDownloaded,
	})
}

// UpsertItemResult is one entry in an upsert batch response
type UpsertItemResult struct {
	URL    string `json:"url"`
	Status string `json:"status"` // "saved", "updated", "error"
	ID     string `json:"id,omitempty"`
	Error  string `json:"error,omitempty"`
}

// POST /upsert/batch — create or overwrite multiple items
func (h *Handler) UpsertBatch(w http.ResponseWriter, r *http.Request) {
	var req BatchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	total := len(req.Items)
	saved, updated, errors := 0, 0, 0
	results := make([]UpsertItemResult, 0, total)

	for _, content := range req.Items {
		if content.URL == "" || content.Text == "" || content.Source == "" {
			errors++
			results = append(results, UpsertItemResult{URL: content.URL, Status: "error", Error: "missing required fields"})
			continue
		}

		hashID := hashURL(content.URL)

		if h.cache.Has(hashID) {
			relPath := h.cache.GetPath(hashID)
			result, err := UpdateContent(h.cfg, content, hashID, relPath)
			if err != nil {
				errors++
				results = append(results, UpsertItemResult{URL: content.URL, Status: "error", Error: err.Error()})
				continue
			}
			updated++
			results = append(results, UpsertItemResult{URL: content.URL, Status: "updated", ID: result.ID})
			continue
		}

		result, err := SaveContent(h.cfg, content, hashID)
		if err != nil {
			errors++
			results = append(results, UpsertItemResult{URL: content.URL, Status: "error", Error: err.Error()})
			continue
		}

		h.cache.Add(hashID, result.Path)
		saved++
		results = append(results, UpsertItemResult{URL: content.URL, Status: "saved", ID: result.ID})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"total":   total,
		"saved":   saved,
		"updated": updated,
		"errors":  errors,
		"results": results,
	})
}

// GET /stats
func (h *Handler) Stats(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"total":        h.cache.Size(),
		"cache_size":   h.cache.Size(),
		"storage_root": h.cfg.StorageRoot,
	})
}

// GET /tasks
func (h *Handler) GetTasks(w http.ResponseWriter, r *http.Request) {
	tasks := h.scheduler.GetTasks()
	writeJSON(w, http.StatusOK, map[string]any{
		"tasks": tasks,
	})
}

// GET /tasks/trigger — run all enabled tasks immediately
func (h *Handler) TasksTrigger(w http.ResponseWriter, r *http.Request) {
	count := h.scheduler.TriggerAll()
	writeJSON(w, http.StatusOK, map[string]any{
		"status":          "triggered",
		"tasks_triggered": count,
	})
}

// POST /tasks
func (h *Handler) SaveTasks(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Tasks []URLTask `json:"tasks"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}

	if err := h.scheduler.SaveTasks(req.Tasks); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

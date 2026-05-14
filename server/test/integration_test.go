package test

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"
	"time"
)

const testToken = "integration-secret"

type testServer struct {
	baseURL string
	storage string
	cancel  context.CancelFunc
	done    chan error
	logs    *bytes.Buffer
}

func TestServerCollectAndDedupFlow(t *testing.T) {
	srv := startServer(t, t.TempDir())
	defer srv.stop(t)

	health := getJSON(t, srv.baseURL+"/health", "")
	assertEqual(t, http.StatusOK, health.status)
	assertEqual(t, "ok", health.body["status"])
	assertEqual(t, float64(0), health.body["cache_size"])
	assertEqual(t, srv.storage, health.body["storage_root"])

	unauthorized := getJSON(t, srv.baseURL+"/stats", "")
	assertEqual(t, http.StatusUnauthorized, unauthorized.status)
	assertEqual(t, "unauthorized", unauthorized.body["error"])

	stats := getJSON(t, srv.baseURL+"/stats", testToken)
	assertEqual(t, http.StatusOK, stats.status)
	assertEqual(t, float64(0), stats.body["total"])

	badCollect := postJSON(t, srv.baseURL+"/collect", testToken, map[string]any{
		"source": "X",
		"text":   "missing URL",
	})
	assertEqual(t, http.StatusBadRequest, badCollect.status)
	if !strings.Contains(fmt.Sprint(badCollect.body["error"]), "url") {
		t.Fatalf("expected missing URL error, got %#v", badCollect.body)
	}

	url := "https://x.com/user/status/12345"
	imageBytes := []byte("png-bytes")
	payload := map[string]any{
		"source":      "X",
		"type":        "text",
		"text":        "Post text content here.",
		"url":         url,
		"timestamp":   "2026-05-14T08:00:00Z",
		"collectedAt": "2026-05-14T15:30:00+08:00",
		"author": map[string]any{
			"username":    "kamalei",
			"displayName": "Kamal Lei",
		},
		"tags":   []string{"ai", "tools"},
		"links":  []string{"https://example.com"},
		"videos": []string{"https://video.example/video.mp4"},
		"images": []map[string]any{
			{
				"data":         base64.StdEncoding.EncodeToString(imageBytes),
				"mime_type":    "image/png",
				"original_url": "https://example.com/image.png",
			},
		},
	}

	collect := postJSON(t, srv.baseURL+"/collect", testToken, payload)
	assertEqual(t, http.StatusOK, collect.status)
	assertEqual(t, "saved", collect.body["status"])
	assertEqual(t, float64(1), collect.body["images_downloaded"])

	expectedID := shortHash(url)
	expectedFile := "14-x-Post-tex.md"
	assertEqual(t, expectedID, collect.body["id"])
	assertEqual(t, filepath.Join("2026", "05", expectedFile), collect.body["path"])

	mdPath := filepath.Join(srv.storage, "2026", "05", expectedFile)
	mdBytes, err := os.ReadFile(mdPath)
	if err != nil {
		t.Fatalf("read saved markdown: %v", err)
	}
	md := string(mdBytes)
	for _, want := range []string{
		`id: "` + expectedID + `"`,
		`source: "X"`,
		`url: "` + url + `"`,
		`author_username: "kamalei"`,
		`  - "ai"`,
		`links:`,
		"Post text content here.",
		"![image](images/" + expectedID + "_0.png)",
	} {
		if !strings.Contains(md, want) {
			t.Fatalf("saved markdown missing %q:\n%s", want, md)
		}
	}

	savedImage, err := os.ReadFile(filepath.Join(srv.storage, "2026", "05", "images", expectedID+"_0.png"))
	if err != nil {
		t.Fatalf("read saved image: %v", err)
	}
	if !bytes.Equal(imageBytes, savedImage) {
		t.Fatalf("saved image bytes = %q, want %q", savedImage, imageBytes)
	}

	check := getJSON(t, srv.baseURL+"/check?url="+url, testToken)
	assertEqual(t, http.StatusOK, check.status)
	assertEqual(t, true, check.body["exists"])
	assertEqual(t, expectedID, check.body["id"])

	duplicate := postJSON(t, srv.baseURL+"/collect", testToken, payload)
	assertEqual(t, http.StatusConflict, duplicate.status)
	assertEqual(t, "duplicate", duplicate.body["status"])
	assertEqual(t, expectedID, duplicate.body["id"])

	secondURL := "https://bilibili.com/dynamic/67890"
	batch := postJSON(t, srv.baseURL+"/collect/batch", testToken, map[string]any{
		"items": []map[string]any{
			payload,
			{
				"source":      "Bilibili",
				"type":        "text",
				"text":        "Second item",
				"url":         secondURL,
				"timestamp":   "2026-05-14T09:00:00Z",
				"collectedAt": "2026-05-14T16:00:00+08:00",
			},
			{"source": "X", "url": "https://invalid.example/no-text"},
		},
	})
	assertEqual(t, http.StatusOK, batch.status)
	assertEqual(t, float64(3), batch.body["total"])
	assertEqual(t, float64(1), batch.body["saved"])
	assertEqual(t, float64(1), batch.body["duplicates"])
	assertEqual(t, float64(1), batch.body["errors"])

	batchCheck := postJSON(t, srv.baseURL+"/check/batch", testToken, map[string]any{
		"urls": []string{url, secondURL, "https://missing.example/item"},
	})
	assertEqual(t, http.StatusOK, batchCheck.status)
	assertStringSliceEqual(t, []string{url, secondURL}, stringSlice(batchCheck.body["existing"]))

	finalStats := getJSON(t, srv.baseURL+"/stats", testToken)
	assertEqual(t, http.StatusOK, finalStats.status)
	assertEqual(t, float64(2), finalStats.body["total"])
}

func TestServerBuildsCacheFromExistingMarkdown(t *testing.T) {
	storage := t.TempDir()
	existingURL := "https://x.com/user/status/already-collected"
	hashID := fullHash(existingURL)
	shortID := hashID[:16]

	dir := filepath.Join(storage, "x", "2026", "05")
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatalf("create fixture directory: %v", err)
	}
	fixture := fmt.Sprintf("---\nid: %q\nhash_id: %q\nsource: \"X\"\n---\n\nExisting content\n", shortID, hashID)
	if err := os.WriteFile(filepath.Join(dir, shortID+".md"), []byte(fixture), 0644); err != nil {
		t.Fatalf("write fixture markdown: %v", err)
	}

	srv := startServer(t, storage)
	defer srv.stop(t)

	health := getJSON(t, srv.baseURL+"/health", "")
	assertEqual(t, http.StatusOK, health.status)
	assertEqual(t, float64(1), health.body["cache_size"])

	check := getJSON(t, srv.baseURL+"/check?url="+existingURL, testToken)
	assertEqual(t, http.StatusOK, check.status)
	assertEqual(t, true, check.body["exists"])
	assertEqual(t, shortID, check.body["id"])
}

func startServer(t *testing.T, storage string) *testServer {
	t.Helper()

	port := freePort(t)
	ctx, cancel := context.WithCancel(context.Background())
	logs := &bytes.Buffer{}
	binary := buildServer(t)

	cmd := exec.CommandContext(
		ctx,
		binary,
		"--token", testToken,
		"--storage-root", storage,
		"--host", "127.0.0.1",
		"--port", strconv.Itoa(port),
	)
	cmd.Stdout = logs
	cmd.Stderr = logs

	if err := cmd.Start(); err != nil {
		cancel()
		t.Fatalf("start server: %v", err)
	}

	srv := &testServer{
		baseURL: "http://127.0.0.1:" + strconv.Itoa(port),
		storage: storage,
		cancel:  cancel,
		done:    make(chan error, 1),
		logs:    logs,
	}

	go func() {
		srv.done <- cmd.Wait()
	}()

	waitForHealth(t, srv)
	return srv
}

func buildServer(t *testing.T) string {
	t.Helper()

	binary := filepath.Join(t.TempDir(), "synapse-server")
	cmd := exec.Command("go", "build", "-o", binary, ".")
	cmd.Dir = ".."
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("build server: %v\n%s", err, out)
	}
	return binary
}

func (s *testServer) stop(t *testing.T) {
	t.Helper()

	s.cancel()
	select {
	case <-s.done:
	case <-time.After(5 * time.Second):
		t.Fatalf("server did not stop after context cancellation; logs:\n%s", s.logs.String())
	}
}

func waitForHealth(t *testing.T, srv *testServer) {
	t.Helper()

	deadline := time.Now().Add(20 * time.Second)
	for time.Now().Before(deadline) {
		select {
		case err := <-srv.done:
			t.Fatalf("server exited before becoming healthy: %v\nlogs:\n%s", err, srv.logs.String())
		default:
		}

		resp, err := http.Get(srv.baseURL + "/health")
		if err == nil {
			_, _ = io.Copy(io.Discard, resp.Body)
			_ = resp.Body.Close()
			if resp.StatusCode == http.StatusOK {
				return
			}
		}
		time.Sleep(100 * time.Millisecond)
	}

	t.Fatalf("server did not become healthy; logs:\n%s", srv.logs.String())
}

func freePort(t *testing.T) int {
	t.Helper()

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("allocate free port: %v", err)
	}
	defer ln.Close()

	return ln.Addr().(*net.TCPAddr).Port
}

type jsonResponse struct {
	status int
	body   map[string]any
}

func getJSON(t *testing.T, url, token string) jsonResponse {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		t.Fatalf("create GET request: %v", err)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return doJSON(t, req)
}

func postJSON(t *testing.T, url, token string, body any) jsonResponse {
	t.Helper()

	data, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal request body: %v", err)
	}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		t.Fatalf("create POST request: %v", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	return doJSON(t, req)
}

func doJSON(t *testing.T, req *http.Request) jsonResponse {
	t.Helper()

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("%s %s: %v", req.Method, req.URL.String(), err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("read response body: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("decode JSON response %d %q: %v", resp.StatusCode, data, err)
	}

	return jsonResponse{status: resp.StatusCode, body: decoded}
}

func fullHash(url string) string {
	sum := sha256.Sum256([]byte(url))
	return fmt.Sprintf("%x", sum)
}

func shortHash(url string) string {
	return fullHash(url)[:16]
}

func stringSlice(v any) []string {
	raw, ok := v.([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, item := range raw {
		if s, ok := item.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

func assertEqual(t *testing.T, want, got any) {
	t.Helper()

	if !reflect.DeepEqual(want, got) {
		t.Fatalf("want %#v, got %#v", want, got)
	}
}

func assertStringSliceEqual(t *testing.T, want, got []string) {
	t.Helper()

	sort.Strings(want)
	sort.Strings(got)
	if !reflect.DeepEqual(want, got) {
		t.Fatalf("want %#v, got %#v", want, got)
	}
}

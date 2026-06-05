package main

import (
	"log"
	"net/http"
	"time"
)

// statusRecorder captures the HTTP status code for logging.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (sr *statusRecorder) WriteHeader(code int) {
	sr.status = code
	sr.ResponseWriter.WriteHeader(code)
}

// LogMiddleware logs every request with method, path, status, and duration.
func LogMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)
		log.Printf("[synapse] %s %s → %d (%v)", r.Method, r.URL.Path, rec.status, time.Since(start).Round(time.Millisecond))
	})
}

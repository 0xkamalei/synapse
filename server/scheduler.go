package main

import (
	"encoding/json"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"time"
)

type URLTask struct {
	ID      string `json:"id"`
	URL     string `json:"url"`
	Enabled bool   `json:"enabled"`
	Time    string `json:"time"` // Format: "HH:MM"
}

type Scheduler struct {
	cfg        *Config
	tasksFile  string
	tasks      []URLTask
	mutex      sync.RWMutex
	stopChan   chan struct{}
	lastRunMap map[string]time.Time
}

func NewScheduler(cfg *Config) *Scheduler {
	return &Scheduler{
		cfg:        cfg,
		tasksFile:  filepath.Join(cfg.StorageRoot, "tasks.json"),
		tasks:      []URLTask{},
		stopChan:   make(chan struct{}),
		lastRunMap: make(map[string]time.Time),
	}
}

func (s *Scheduler) LoadTasks() error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	data, err := os.ReadFile(s.tasksFile)
	if err != nil {
		if os.IsNotExist(err) {
			s.tasks = []URLTask{}
			return nil
		}
		return err
	}

	var tasks []URLTask
	if err := json.Unmarshal(data, &tasks); err != nil {
		return err
	}
	s.tasks = tasks
	return nil
}

func (s *Scheduler) SaveTasks(tasks []URLTask) error {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	data, err := json.MarshalIndent(tasks, "", "  ")
	if err != nil {
		return err
	}

	if err := os.WriteFile(s.tasksFile, data, 0644); err != nil {
		return err
	}

	s.tasks = tasks
	return nil
}

func (s *Scheduler) GetTasks() []URLTask {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	// Return a copy
	tasks := make([]URLTask, len(s.tasks))
	copy(tasks, s.tasks)
	return tasks
}

func (s *Scheduler) Start() {
	if err := s.LoadTasks(); err != nil {
		log.Printf("[scheduler] Failed to load tasks: %v", err)
	}

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ticker.C:
				s.checkAndRunTasks()
			case <-s.stopChan:
				return
			}
		}
	}()
}

func (s *Scheduler) Stop() {
	close(s.stopChan)
}

func (s *Scheduler) checkAndRunTasks() {
	s.mutex.Lock()
	defer s.mutex.Unlock()

	now := time.Now()
	currentHHMM := now.Format("15:04")

	for _, task := range s.tasks {
		if !task.Enabled {
			continue
		}

		if task.Time == currentHHMM {
			lastRun, exists := s.lastRunMap[task.ID]
			// Ensure it only runs once per minute (prevent multiple runs within the same minute)
			if !exists || now.Sub(lastRun) > 1*time.Minute {
				log.Printf("[scheduler] Triggering task %s: opening %s", task.ID, task.URL)
				s.lastRunMap[task.ID] = now

				// Run in a separate goroutine so it doesn't block the loop
				go openURL(task.URL)
			}
		}
	}
}

func (s *Scheduler) TriggerAll() int {
	s.mutex.RLock()
	defer s.mutex.RUnlock()

	count := 0
	for _, task := range s.tasks {
		if !task.Enabled {
			continue
		}
		log.Printf("[scheduler] Triggering task %s: opening %s", task.ID, task.URL)
		go openURL(task.URL)
		count++
	}
	return count
}

func openURL(url string) {
	// macOS specific command to open URL in Google Chrome
	cmd := exec.Command("open", "-a", "Google Chrome", url)
	if err := cmd.Run(); err != nil {
		log.Printf("[scheduler] Failed to open URL %s: %v", url, err)
	}
}

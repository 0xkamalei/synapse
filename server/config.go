package main

import (
	"os"

	"gopkg.in/yaml.v3"
)

// Config holds all server configuration.
type Config struct {
	Token       string `yaml:"token"`
	StorageRoot string `yaml:"storage_root"`
	Port        int    `yaml:"port"`
	Host        string `yaml:"host"`
	LogLevel    string `yaml:"log_level"`
}

// LoadFromFile merges a YAML config file into cfg, only overwriting zero-value fields.
func (c *Config) LoadFromFile(path string) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	tmp := &Config{}
	if err := yaml.Unmarshal(data, tmp); err != nil {
		return err
	}
	// Only apply file values when the flag value is still the default/zero
	if c.Token == "" && tmp.Token != "" {
		c.Token = tmp.Token
	}
	if c.StorageRoot == "" && tmp.StorageRoot != "" {
		c.StorageRoot = tmp.StorageRoot
	}
	if c.Port == 0 && tmp.Port != 0 {
		c.Port = tmp.Port
	}
	if c.Host == "" && tmp.Host != "" {
		c.Host = tmp.Host
	}
	if c.LogLevel == "" && tmp.LogLevel != "" {
		c.LogLevel = tmp.LogLevel
	}
	return nil
}

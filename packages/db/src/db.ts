import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { getDataDir, getDbPath } from "@nv/core";

let db: Database.Database | null = null;

const MIGRATIONS = `
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  nv_login_url TEXT NOT NULL,
  live_link TEXT NOT NULL DEFAULT '',
  test_link TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'Cloning',
  loi_target_minutes REAL NOT NULL DEFAULT 12,
  loi_jitter_percent REAL NOT NULL DEFAULT 15,
  max_workers INTEGER NOT NULL DEFAULT 2,
  sav_field_map TEXT NOT NULL,
  active_dataset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS datasets (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  data_path TEXT NOT NULL,
  sav_path TEXT,
  is_active INTEGER NOT NULL DEFAULT 0,
  imported_at TEXT NOT NULL,
  UNIQUE(project_id, name)
);

CREATE TABLE IF NOT EXISTS definitions (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS explore_runs (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  added TEXT,
  updated TEXT,
  conflicts TEXT,
  discovered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`;

export function getDb(): Database.Database {
  if (db) return db;

  const dataDir = getDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  db = new Database(getDbPath());
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(MIGRATIONS);
  return db;
}

export function closeDb(): void {
  db?.close();
  db = null;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "project";
}

export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function datasetDir(projectId: string, datasetId: string): string {
  return path.join(getDataDir(), "blobs", projectId, "datasets", datasetId);
}

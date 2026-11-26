'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openDb(dataDir) {
  fs.mkdirSync(path.join(dataDir, 'uploads'), { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'estudio.db'));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(`
  CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
    pass_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'user', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS sessions(
    token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS brands(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, colors TEXT NOT NULL DEFAULT '[]', fonts TEXT NOT NULL DEFAULT '{}',
    style TEXT NOT NULL DEFAULT '', socials TEXT NOT NULL DEFAULT '{}', business TEXT NOT NULL DEFAULT '{}',
    logo_asset_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS assets(
    id INTEGER PRIMARY KEY, brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
    kind TEXT NOT NULL, name TEXT NOT NULL, file TEXT NOT NULL, thumb TEXT, mime TEXT NOT NULL,
    width INTEGER, height INTEGER, bytes INTEGER, sha256 TEXT, official INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'upload', parent_id INTEGER, status TEXT NOT NULL DEFAULT 'none',
    meta TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS designs(
    id INTEGER PRIMARY KEY, brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL, name TEXT NOT NULL,
    width INTEGER NOT NULL, height INTEGER NOT NULL, format TEXT NOT NULL DEFAULT 'custom',
    json TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', is_template INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 1, preview_asset_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS design_versions(
    id INTEGER PRIMARY KEY, design_id INTEGER NOT NULL REFERENCES designs(id) ON DELETE CASCADE,
    version INTEGER NOT NULL, json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS usage_log(
    id INTEGER PRIMARY KEY, connector TEXT NOT NULL, op TEXT NOT NULL, units INTEGER NOT NULL DEFAULT 1,
    cost_usd REAL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS audit_log(
    id INTEGER PRIMARY KEY, user_id INTEGER, action TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')));
  `);
  return db;
}

const j = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
module.exports = { openDb, j };

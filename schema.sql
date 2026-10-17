-- 日新辑览 · D1 数据库建表
-- 在 Cloudflare 控制台 D1 → 控制台（Console）里整段粘贴执行，或部署时用 wrangler d1 execute 灌入。
-- 设计借鉴：分类带 parent_id 预留多级、分类与站点都带 is_private、统一 sort_order 排序。

CREATE TABLE IF NOT EXISTS category (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  parent_id  INTEGER DEFAULT 0,
  is_private INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL,
  desc        TEXT DEFAULT '',
  category_id INTEGER NOT NULL REFERENCES category(id),
  icon        TEXT DEFAULT '',
  pinned      INTEGER DEFAULT 0,
  is_private  INTEGER DEFAULT 0,
  sort_order  INTEGER DEFAULT 0,
  origin      TEXT DEFAULT 'manual',
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sites_category ON sites(category_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sites_url ON sites(url);

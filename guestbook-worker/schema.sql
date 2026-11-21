-- 留言表：新留言 approved = 0（待审核），审核通过后改为 1 才会公开
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  content    TEXT    NOT NULL,
  reply      TEXT,                          -- 站长回复（可选）
  approved   INTEGER NOT NULL DEFAULT 0,
  ip_hash    TEXT    NOT NULL,              -- IP 的加盐哈希，只用来限流，不存原始 IP
  created_at INTEGER NOT NULL               -- Unix 毫秒
);
CREATE INDEX IF NOT EXISTS idx_messages_public ON messages (approved, id DESC);
CREATE INDEX IF NOT EXISTS idx_messages_ip     ON messages (ip_hash, created_at);

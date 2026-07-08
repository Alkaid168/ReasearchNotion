export const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  dify_dataset_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(parent_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS papers (
  id TEXT PRIMARY KEY,
  folder_id TEXT NOT NULL,
  title TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK(file_type IN ('pdf', 'markdown')),
  file_path TEXT NOT NULL,
  dify_document_id TEXT,
  index_status TEXT NOT NULL CHECK(index_status IN ('local-only', 'indexing', 'indexed', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS paper_cards (
  id TEXT PRIMARY KEY,
  paper_id TEXT NOT NULL UNIQUE,
  authors TEXT NOT NULL,
  year TEXT NOT NULL,
  one_sentence_summary TEXT NOT NULL,
  research_problem TEXT NOT NULL,
  method_summary TEXT NOT NULL,
  contributions_json TEXT NOT NULL,
  keywords_json TEXT NOT NULL,
  reading_status TEXT NOT NULL CHECK(reading_status IN ('unread', 'reading', 'finished')),
  updated_at TEXT NOT NULL,
  FOREIGN KEY(paper_id) REFERENCES papers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  folder_id TEXT,
  context_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(folder_id) REFERENCES folders(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  citations_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

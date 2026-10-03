const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const databasePath = path.resolve(
  __dirname,
  process.env.DATABASE_PATH || "../data/hackathons.db"
);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS hackathons (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    organizer TEXT DEFAULT '',
    city TEXT DEFAULT '',
    venue TEXT DEFAULT '',
    format TEXT DEFAULT 'physical',
    event_date TEXT DEFAULT '',
    deadline TEXT DEFAULT '',
    registration_url TEXT DEFAULT '',
    eligibility TEXT DEFAULT '',
    team_size TEXT DEFAULT '',
    description TEXT DEFAULT '',
    status TEXT DEFAULT 'draft',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );
`);

// Add team_size to older databases that were created before this field existed.
const columns = db.prepare("PRAGMA table_info(hackathons)").all();

if (!columns.some((column) => column.name === "team_size")) {
  db.exec(`
    ALTER TABLE hackathons
    ADD COLUMN team_size TEXT DEFAULT '';
  `);
}

module.exports = db;
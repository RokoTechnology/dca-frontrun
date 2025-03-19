import { Database } from 'bun:sqlite';


export default function initDb() {
  // Create/connect to a database
  const db = new Database('db.sqlite');
  // Create a table
  db.run(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      raw TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Insert data
  const insertEvent = db.prepare(`INSERT INTO events (type, raw) VALUES ($type, $raw)`)
  const getEvents = db.prepare(`SELECT * FROM events`)

  return {
    insert: (raw) => {
      return insertEvent.run({
        $type: raw.type,
        $raw: JSON.stringify(raw)
      })
    },
    query: (type) => {
      return getEvents.all()
    }
  }
}

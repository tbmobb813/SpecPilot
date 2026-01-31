const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const schemaPath = path.join(__dirname, '..', 'src-tauri', 'src', 'database', 'schema.sql');
const dbPath = path.join(__dirname, '..', 'src-tauri', 'intelligence.db');

function main() {
  if (!fs.existsSync(schemaPath)) {
    console.error('Schema file not found:', schemaPath);
    process.exit(2);
  }

  const sql = fs.readFileSync(schemaPath, 'utf8');

  const db = new Database(dbPath);
  try {
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(sql);

    const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
    console.log('Created/ensured tables:');
    row.forEach(r => console.log(' -', r.name));

    console.log('Database initialized at', dbPath);
  } catch (err) {
    console.error('Failed to initialize DB:', err);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();

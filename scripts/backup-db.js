const fs = require('fs').promises;
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const root = path.join(__dirname, '..');
const dbPath = process.env.DB_PATH || path.join(root, 'data', 'streambox.db');
const backupDir = process.env.BACKUP_DIR || path.join(root, 'backups');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function run(db, sql) {
  return new Promise((resolve, reject) => db.run(sql, (err) => (err ? reject(err) : resolve())));
}

async function main() {
  await fs.mkdir(backupDir, { recursive: true });
  const target = path.join(backupDir, `streambox-${stamp()}.db`);
  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE);

  try {
    await run(db, 'PRAGMA wal_checkpoint(FULL)');
    await run(db, `VACUUM INTO '${target.replace(/'/g, "''")}'`);
    console.log(JSON.stringify({ ok: true, backup: target }));
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});

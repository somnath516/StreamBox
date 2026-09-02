const fs = require('fs').promises;
const path = require('path');

const root = path.join(__dirname, '..');
const dbPath = process.env.DB_PATH || path.join(root, 'data', 'streambox.db');
const backupDir = process.env.BACKUP_DIR || path.join(root, 'backups');
const source = process.argv[2];
const confirmed = process.argv.includes('--confirm');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!source || !confirmed) {
    console.error('Usage: node scripts/restore-db.js <backup.db> --confirm');
    process.exit(2);
  }

  const fullSource = path.resolve(source);
  if (!(await exists(fullSource))) throw new Error('Backup file not found');

  await fs.mkdir(path.dirname(dbPath), { recursive: true });
  await fs.mkdir(backupDir, { recursive: true });

  if (await exists(dbPath)) {
    await fs.copyFile(dbPath, path.join(backupDir, `pre-restore-${stamp()}.db`));
  }

  await Promise.allSettled([
    fs.rm(`${dbPath}-wal`, { force: true }),
    fs.rm(`${dbPath}-shm`, { force: true }),
  ]);
  await fs.copyFile(fullSource, dbPath);
  console.log(JSON.stringify({ ok: true, restored: dbPath }));
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});

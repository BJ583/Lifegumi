const fs = require("node:fs");
const path = require("node:path");

function backupDatabaseIfDue(databasePath) {
  if (!fs.existsSync(databasePath)) return;
  const backupDirectory = path.join(path.dirname(databasePath), "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(backupDirectory, `lifegumi-${today}.sqlite`);
  if (!fs.existsSync(backupPath)) fs.copyFileSync(databasePath, backupPath, fs.constants.COPYFILE_EXCL);
  const backups = fs.readdirSync(backupDirectory)
    .filter((name) => /^lifegumi-\d{4}-\d{2}-\d{2}\.sqlite$/.test(name))
    .sort();
  for (const name of backups.slice(0, -7)) fs.unlinkSync(path.join(backupDirectory, name));
}

function writeDatabaseAtomically(databasePath, bytes) {
  const temporaryPath = `${databasePath}.tmp`;
  const file = fs.openSync(temporaryPath, "w");
  try {
    fs.writeFileSync(file, bytes);
    fs.fsyncSync(file);
  } finally {
    fs.closeSync(file);
  }
  fs.renameSync(temporaryPath, databasePath);
}

module.exports = { backupDatabaseIfDue, writeDatabaseAtomically };

export function getDefaultDatabasePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return `${home}/.corivo/corivo.db`;
}

export function getPidFilePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return `${home}/.corivo/heartbeat.pid`;
}

export function getConfigDir(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '.';
  return `${home}/.corivo`;
}

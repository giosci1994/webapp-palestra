// Generates src-tauri/icons/ (not in git) from the web app's icon.
// frontend/public/icons/icon-512.png is a JPEG with a .png name, and
// `tauri icon` decodes by the extension: it gets a copy named .jpg.
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const sorgente = new URL('../frontend/public/icons/icon-512.png', import.meta.url);
const cartella = mkdtempSync(join(tmpdir(), 'gymmaster-icona-'));
const copia = join(cartella, 'icona.jpg');
try {
  copyFileSync(sorgente, copia);
  const tauri = createRequire(import.meta.url).resolve('@tauri-apps/cli/tauri.js');
  execFileSync(process.execPath, [tauri, 'icon', copia], { stdio: 'inherit' });
} finally {
  rmSync(cartella, { recursive: true, force: true });
}

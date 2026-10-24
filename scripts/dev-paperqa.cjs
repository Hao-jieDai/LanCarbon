const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const config = path.join(root, '.dev-workspace', 'paperqa-python.txt');
const python = process.env.LANCARBON_PAPERQA_PYTHON || (fs.existsSync(config) ? fs.readFileSync(config, 'utf8').trim() : '');
if (!python || !fs.existsSync(python)) { console.error('Run npm run setup:paperqa once before opening this development build.'); process.exit(1); }
if (!process.argv.includes('--no-build')) {
  const npm = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  const result = spawnSync(process.execPath, [npm, 'run', 'build'], { stdio: 'inherit', windowsHide: true });
  if (result.status !== 0) process.exit(1);
}
const app = spawn(path.join(root, 'node_modules', 'electron', 'dist', 'electron.exe'), [root], {
  stdio: 'ignore', windowsHide: true, detached: true,
  env: { ...process.env, LANCARBON_PAPERQA_DEV: '1', LANCARBON_PAPERQA_PYTHON: python, LANCARBON_PAPERQA_TEST_ROOT: '', E2E_USER_DATA_DIR: '', VITE_DEV_SERVER_URL: '', LANCARBON_ROOT: '' }
});
app.on('error', () => console.error('The development application could not start.'));
app.unref();

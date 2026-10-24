// Bundle a relocatable, local-only Python/PaperQA runtime. Never use a user's
// system Python or pip at application startup, and never bundle credentials.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const target = path.join(root, 'build', 'paperqa-runtime');
const python = path.join(root, '.dev-workspace', 'paperqa-runtime', 'Scripts', 'python.exe');
const zip = path.join(root, '.builder-cache', 'python', 'python-3.13.14-embed-amd64.zip');
const url = 'https://www.python.org/ftp/python/3.13.14/python-3.13.14-embed-amd64.zip';
// Published by https://www.python.org/downloads/release/python-31314/
const zipHash = '90B4E5B9898B72D744650524BFF92377C367F44BD5FBD09E3148656C080AD907';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
function run(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: 'utf8', windowsHide: true, timeout: 120000, ...options });
  if (result.error || result.status !== 0) throw Error(result.stderr || result.error?.message || 'PaperQA runtime preparation failed.');
  return result.stdout;
}
async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Build this runtime on Windows x64.');
  if (!fs.existsSync(python)) throw Error('Run npm run setup:paperqa with Python 3.13.14 first.');
  const source = JSON.parse(run(python, ['-I', '-c', 'import sys,sysconfig,json,importlib.metadata as m; print(json.dumps({"version":sys.version.split()[0],"site":sysconfig.get_paths()["purelib"],"packages":{d.metadata["Name"].lower().replace("_","-"):d.version for d in m.distributions() if d.metadata["Name"]}}))']));
  if (source.version !== '3.13.14') throw Error('The source runtime must use Python 3.13.14.');
  const requirements = fs.readFileSync(path.join(__dirname, 'paperqa-runtime-lock.txt'), 'utf8').replace(/^\uFEFF/, '').trim().split(/\r?\n/);
  const packages = {};
  for (const line of requirements) {
    const match = /^([\w.-]+)==([\w.+-]+)$/.exec(line);
    if (!match) throw Error('Runtime lock must contain only pinned public package versions.');
    const name = match[1].toLowerCase().replaceAll('_', '-');
    if (source.packages[name] !== match[2]) throw Error(`Runtime dependency mismatch: ${name}. Install scripts/paperqa-runtime-lock.txt in the development environment.`);
    packages[name] = match[2];
  }
  if (Object.keys(source.packages).some(name => name !== 'pip' && !packages[name])) throw Error('Source environment contains untracked packages.');
  if (fs.readdirSync(source.site).some(name => /editable|\.egg-link$/i.test(name))) throw Error('Editable dependencies cannot be bundled.');
  fs.mkdirSync(path.dirname(zip), { recursive: true });
  if (!fs.existsSync(zip)) {
    // requests uses the setup environment's normal HTTPS/proxy configuration.
    run(python, ['-I', '-c', 'import requests,sys,pathlib; r=requests.get(sys.argv[1],timeout=90); r.raise_for_status(); pathlib.Path(sys.argv[2]).write_bytes(r.content)', url, zip]);
  }
  if (hash(fs.readFileSync(zip)) !== zipHash) throw Error('Official Python archive checksum mismatch.');
  // Only the generated build directory may be replaced. Reject junctions.
  if (path.dirname(target) !== path.join(root, 'build') || path.basename(target) !== 'paperqa-runtime' || (fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink())) throw Error('Unsafe runtime destination.');
  if (fs.existsSync(target)) fs.rmSync(target, { recursive: true });
  fs.mkdirSync(target, { recursive: true });
  run(python, ['-I', '-c', 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])', zip, target]);
  fs.writeFileSync(path.join(target, 'python313._pth'), 'python313.zip\n.\nLib/site-packages\nimport site\n');
  fs.cpSync(source.site, path.join(target, 'Lib', 'site-packages'), { recursive: true, filter: item => {
    const relative = path.relative(source.site, item), parts = relative.split(path.sep);
    if (parts.some(p => p === '__pycache__') || /\.pyc$/i.test(item)) return false;
    if (/^pip(?:-|$)/i.test(parts[0])) return false;
    if (fs.lstatSync(item).isSymbolicLink()) throw Error('Runtime dependencies must not contain links.');
    return true;
  } });
  const adapter = path.join(target, 'adapter'); fs.mkdirSync(adapter);
  for (const name of ['paperqa_prompt.py', 'paperqa_full_context.py', 'paperqa_evidence.py']) fs.copyFileSync(path.join(__dirname, name), path.join(adapter, name));
  const sample = { question: 'Who was included?', passages: [{ label: 'S1', sourceId: 'note:packaging', fingerprint: 'a'.repeat(64), title: 'Runtime sample', location: 'Lines 1–1', text: 'Both adults and children were included.' }] };
  const env = { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, PATH: '', PYTHONUTF8: '1' };
  const output = JSON.parse(run(path.join(target, 'python.exe'), ['-I', '-B', path.join(adapter, 'paperqa_prompt.py')], { cwd: process.env.TEMP, input: JSON.stringify(sample), env }));
  if (output.engine !== 'paperqa' || !output.messages?.[1]?.content.includes(sample.passages[0].text)) throw Error('Bundled native adapter did not preserve the source.');
  const files = [];
  function list(directory) { for (const item of fs.readdirSync(directory, { withFileTypes: true })) { const full = path.join(directory, item.name); if (item.isDirectory()) list(full); else files.push({ path: path.relative(target, full).replaceAll('\\', '/'), sha256: hash(fs.readFileSync(full)) }); } }
  list(target);
  fs.writeFileSync(path.join(target, 'runtime-manifest.json'), JSON.stringify({ python: source.version, pythonArchive: url, pythonArchiveSHA256: zipHash, packages, files }, null, 2));
  console.log(`Bundled PaperQA runtime verified offline: ${files.length} files; no model calls.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

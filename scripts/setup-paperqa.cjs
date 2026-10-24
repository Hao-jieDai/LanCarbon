const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
process.chdir(root);
const runtime = path.join(root, '.dev-workspace', 'paperqa-runtime');
let python = process.env.LANCARBON_PAPERQA_PYTHON;
function run(file, args) {
  const result = spawnSync(file, args, { stdio: 'inherit', windowsHide: true });
  if (result.error || result.status !== 0) throw Error('PaperQA setup failed. Check Python 3.11+ and dependency installation.');
}
if (!python) {
  run('python', ['-m', 'venv', runtime]);
  python = path.join(runtime, process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
  run(python, ['-m', 'pip', 'install', '-r', 'scripts/paperqa-requirements.txt']);
}
python = path.resolve(python);
const sample = { question: 'What is the scope?', passages: [{ label: 'S1', sourceId: 'note:setup', fingerprint: 'a'.repeat(64), title: 'Setup sample', location: 'Lines 1–1', text: 'The study covers adults.' }] };
const checked = spawnSync(python, ['-I', 'scripts/paperqa_prompt.py'], { input: JSON.stringify(sample), encoding: 'utf8', windowsHide: true, timeout: 60000, env: { ...process.env, PYTHONUTF8: '1', LITELLM_LOCAL_MODEL_COST_MAP: 'True' } });
if (checked.status !== 0 || !JSON.parse(checked.stdout).messages?.length) throw Error('The pinned native PaperQA adapter could not run. No model was called.');
fs.mkdirSync(path.join(root, '.dev-workspace'), { recursive: true });
fs.writeFileSync(path.join(root, '.dev-workspace', 'paperqa-python.txt'), python);
console.log('PaperQA development runtime is ready. No model requests were sent.');

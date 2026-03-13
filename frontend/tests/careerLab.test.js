import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const careerLabPath = path.join(__dirname, '..', 'src', 'pages', 'dashboard', 'CareerLab.jsx');
const routerPath = path.join(__dirname, '..', 'src', 'router.jsx');

function read(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

test('career lab is mounted in router', () => {
  const routerSource = read(routerPath);
  assert.match(routerSource, /path:\s*"career-lab"/);
  assert.match(routerSource, /CareerLab/);
});

test('career lab wires high-use tool endpoints', () => {
  const source = read(careerLabPath);
  assert.match(source, /"\/api\/career-tools\/ats-analysis"/);
  assert.match(source, /"\/api\/career-tools\/role-fit"/);
  assert.match(source, /"\/api\/career-tools\/interview-prep"/);
});

test('career lab separates tools into grouped sections', () => {
  const source = read(careerLabPath);
  assert.match(source, /Core Analysis Tools/);
  assert.match(source, /Market & Strategy Tools/);
  assert.match(source, /Interview & Job Search Execution/);
  assert.match(source, /ToolActionCard/);
});

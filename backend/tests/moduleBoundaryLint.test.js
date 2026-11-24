// PLATFORM-014: the boundary lint must see CommonJS requires. Sources are linted
// in memory under file names inside modules/; no files are written.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

require('./support/isolate');

const { ESLint } = require('eslint');

const backendRoot = path.join(__dirname, '..');
const eslint = new ESLint({
  cwd: backendRoot,
  overrideConfigFile: path.join(backendRoot, 'eslint.config.cjs'),
});

async function lint(code, file = 'modules/billing/services/sample.js') {
  const [result] = await eslint.lintText(code, { filePath: path.join(backendRoot, file) });
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  return result.messages.map(({ ruleId, severity }) => ({ ruleId, severity }));
}

const VIOLATION = [{ ruleId: 'boundaries/no-cross-module-imports', severity: 2 }];

for (const [label, code] of Object.entries({
  'require of a file': "const x = require('../../identity/services/contracts');",
  'require of a bare module folder': "const x = require('../../identity');",
  'require with a template literal': 'const x = require(`../../identity/index.js`);',
  'module.require': "const x = module.require('../../identity');",
  'require.resolve': "const x = require.resolve('../../identity');",
  'require inside a function': "function load() { return require('../../admin'); }",
  'a path that leaves and re-enters modules/': "const x = require('../../../modules/admin');",
  'import': "import x from '../../identity/index.js';",
  'dynamic import': "const x = import('../../identity/index.js');",
  're-export': "export { x } from '../../identity/index.js';",
  're-export of everything': "export * from '../../identity/index.js';",
})) {
  test(`boundary lint flags a cross-module ${label}`, async () => {
    assert.deepEqual(await lint(code), VIOLATION);
  });
}

test('boundary lint covers every module and .cjs and .mjs files', async () => {
  const modules = ['identity', 'billing', 'documents', 'career-intelligence', 'admin'];
  for (const [index, from] of modules.entries()) {
    const to = modules[(index + 1) % modules.length];
    assert.deepEqual(await lint(`require('../../${to}');`, `modules/${from}/services/sample.js`), VIOLATION, from);
  }
  assert.deepEqual(await lint("require('../../admin');", 'modules/billing/services/sample.cjs'), VIOLATION);
  assert.deepEqual(await lint("import '../../admin/index.js';", 'modules/billing/services/sample.mjs'), VIOLATION);
  assert.deepEqual(await lint("require('../admin');", 'modules/billing/index.js'), VIOLATION);
});

for (const [label, code] of Object.entries({
  'a sibling folder': "const x = require('../repositories/subscriptionRepository');",
  'its own index': "const x = require('..');",
  'its own module by a longer path': "const x = require('../../billing/schemas/billingSchemas');",
  'shared code': "const x = require('../../../shared/http/validators');",
  'a top-level implementation': "const x = require('../../../routes/billingRoutes');",
  'a package': "const x = require('express');",
  'a package named like a module': "const x = require('identity');",
})) {
  test(`boundary lint allows a module to load ${label}`, async () => {
    assert.deepEqual(await lint(code), []);
  });
}

test('boundary lint does not restrict files outside modules/', async () => {
  assert.deepEqual(await lint("require('./modules/identity'); require('./modules/billing');", 'app.js'), []);
});

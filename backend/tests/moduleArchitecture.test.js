const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const modulesRoot = path.join(__dirname, '..', 'modules');
const requiredDirs = ['controllers', 'services', 'repositories', 'schemas', 'routes'];
const requiredModules = ['identity', 'billing', 'documents', 'career-intelligence', 'admin'];

test('module architecture: required modules exist', () => {
  const existing = fs.readdirSync(modulesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);

  for (const moduleName of requiredModules) {
    assert.ok(existing.includes(moduleName), `Missing module: ${moduleName}`);
  }
});

test('module architecture: each module has required subdirectories and index.js', () => {
  for (const moduleName of requiredModules) {
    const modulePath = path.join(modulesRoot, moduleName);
    const indexPath = path.join(modulePath, 'index.js');
    assert.ok(fs.existsSync(indexPath), `Missing index.js for module: ${moduleName}`);

    for (const dirName of requiredDirs) {
      const dirPath = path.join(modulePath, dirName);
      assert.ok(fs.existsSync(dirPath), `Missing ${dirName}/ in module ${moduleName}`);
      assert.ok(fs.statSync(dirPath).isDirectory(), `${dirName} is not a directory in module ${moduleName}`);
    }
  }
});

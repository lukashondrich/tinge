#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function fail(message) {
  console.error(message);
  process.exit(1);
}

const root = process.cwd();
const packageJsonPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const scripts = pkg.scripts || {};

if (pkg.jest) {
  fail('Root package.json must not define a top-level "jest" config. Keep test ownership explicit by scripts.');
}

const requiredScripts = [
  'test',
  'test:backend',
  'test:frontend',
  'test:embedding',
  'test:integration'
];

const missing = requiredScripts.filter((name) => !scripts[name]);
if (missing.length > 0) {
  fail(`Root test contract missing required scripts: ${missing.join(', ')}`);
}

const testScript = String(scripts.test);
const requiredReferences = ['test:backend', 'test:frontend', 'test:embedding', 'test:integration'];
const missingRefs = requiredReferences.filter((name) => !testScript.includes(name));
if (missingRefs.length > 0) {
  fail(`Root "test" script must include: ${missingRefs.join(', ')}`);
}

const integrationScript = String(scripts['test:integration']);
if (!integrationScript.includes('tests/integration.test.js')) {
  fail('Root "test:integration" script must explicitly target tests/integration.test.js.');
}

console.log('Root test contract check passed.');

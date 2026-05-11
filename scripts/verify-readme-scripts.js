#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = process.cwd();
const readmePath = path.join(root, 'README.md');
const packageJsonPath = path.join(root, 'package.json');

const readme = fs.readFileSync(readmePath, 'utf8');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
const scripts = new Set(Object.keys(packageJson.scripts || {}));

const commands = [...readme.matchAll(/npm run\s+([a-zA-Z0-9:_-]+)/g)].map((m) => m[1]);
const uniqueCommands = [...new Set(commands)].sort();

const missing = uniqueCommands.filter((command) => !scripts.has(command));

if (missing.length > 0) {
  console.error('README references npm scripts that are missing from root package.json:');
  missing.forEach((name) => console.error(`- ${name}`));
  process.exit(1);
}

console.log(`README script check passed (${uniqueCommands.length} npm run commands verified).`);

#!/usr/bin/env node
/**
 * Auto-increment patch version and add build timestamp to package.json
 *
 * Usage: node scripts/bump-version.js [--major|--minor|--patch]
 * Default: --patch (increments patch number, e.g. 0.2.0 -> 0.2.1)
 *
 * Also sets a buildInfo object with:
 * - buildNumber: auto-incrementing build count
 * - buildDate: ISO timestamp of build
 */

const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

const currentVersion = pkg.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

const type = process.argv[2] || '--patch';

let newVersion;
switch (type) {
  case '--major':
    newVersion = `${major + 1}.0.0`;
    break;
  case '--minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case '--patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

// Update version
pkg.version = newVersion;

// Update build info
const buildNumber = (pkg.buildInfo?.buildNumber || 0) + 1;
const buildDate = new Date().toISOString();

pkg.buildInfo = {
  buildNumber,
  buildDate,
  builtFrom: currentVersion
};

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`Version: ${currentVersion} -> ${newVersion}`);
console.log(`Build: #${buildNumber} at ${buildDate}`);

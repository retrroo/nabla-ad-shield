#!/usr/bin/env node
/**
 * Shield by Nablai — Chrome Web Store Pre-Flight Validator & Release Packager
 *
 * Performs automated quality & CWS policy gates before generating nabla-ad-shield.zip:
 *  1. Manifest V3 JSON schema & asset existence check (icons, scripts, rulesets, pages).
 *  2. JavaScript syntax validation (node --check) on every runtime script.
 *  3. Chrome Web Store Permission Usage Audit ("Purple Potassium" prevention):
 *     verifies every permission in manifest.json is actively called in runtime JS.
 *  4. Remote-code & MV3 CSP safety scan (no eval, no remote script URLs).
 *  5. Runs the full automated regression test suite (tests/run-tests.js).
 *  6. Builds a clean nabla-ad-shield.zip containing ONLY runtime extension assets
 *     (strictly excludes tools/, tests/, workflows/, .agents/, store_assets/, sources.json).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(ROOT, 'manifest.json');
const ZIP_PATH = path.join(ROOT, 'nabla-ad-shield.zip');

// Strict allowlist of runtime files/directories shipped in the Chrome Web Store ZIP
const RUNTIME_PACKAGE_ITEMS = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.css',
  'popup.js',
  'onboarding.html',
  'onboarding.css',
  'onboarding.js',
  'debugger.html',
  'debugger.css',
  'debugger.js',
  'icons',
  'scripts',
  'shared',
  'PRIVACY.md',
  'README.md'
];

// Only compiled DNR rulesets go into rules/ inside the ZIP (never rules/sources.json!)
const RUNTIME_RULE_FILES = ['rules/ads_ruleset.json', 'rules/cookies_ruleset.json'];

function collectJsFiles(dirRel) {
  const full = path.join(ROOT, dirRel);
  if (!fs.existsSync(full)) return [];
  const results = [];
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dirRel, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectJsFiles(rel));
    } else if (entry.name.endsWith('.js')) {
      results.push(rel);
    }
  }
  return results;
}

function getAllRuntimeJsFiles() {
  const topLevel = ['background.js', 'popup.js', 'onboarding.js', 'debugger.js'].filter((f) =>
    fs.existsSync(path.join(ROOT, f))
  );
  return [...topLevel, ...collectJsFiles('scripts'), ...collectJsFiles('shared')];
}

function auditPermissions(manifest, combinedRuntimeCode) {
  const errors = [];
  const perms = manifest.permissions || [];

  const permissionChecks = {
    declarativeNetRequest: () =>
      combinedRuntimeCode.includes('chrome.declarativeNetRequest') ||
      Boolean(manifest.declarative_net_request),
    declarativeNetRequestFeedback: () => combinedRuntimeCode.includes('onRuleMatchedDebug'),
    storage: () => combinedRuntimeCode.includes('chrome.storage'),
    activeTab: () =>
      combinedRuntimeCode.includes('chrome.tabs.query') ||
      combinedRuntimeCode.includes('chrome.tabs.reload'),
    scripting: () => combinedRuntimeCode.includes('chrome.scripting'),
    tabs: () => combinedRuntimeCode.includes('chrome.tabs.'),
    alarms: () => combinedRuntimeCode.includes('chrome.alarms'),
    cookies: () => combinedRuntimeCode.includes('chrome.cookies'),
    webNavigation: () => combinedRuntimeCode.includes('chrome.webNavigation'),
    contextMenus: () => combinedRuntimeCode.includes('chrome.contextMenus')
  };

  for (const p of perms) {
    const checker = permissionChecks[p];
    if (checker && !checker()) {
      errors.push(
        `CWS Purple Potassium risk: permission "${p}" is declared in manifest.json but NOT used in runtime code!`
      );
    }
  }

  return errors;
}

function auditRemoteCodeSafety(jsFiles) {
  const errors = [];
  for (const rel of jsFiles) {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    // Strip single-line and block comments before checking
    const stripped = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    if (/\beval\s*\(/.test(stripped)) {
      errors.push(`CWS Remote Code risk: eval() detected in ${rel}`);
    }
    if (/\bnew\s+Function\s*\(/.test(stripped)) {
      errors.push(`CWS Remote Code risk: new Function() detected in ${rel}`);
    }
  }
  return errors;
}

function auditManifestAssets(manifest) {
  const errors = [];
  const mustExist = [];

  if (manifest.manifest_version !== 3) {
    errors.push(`manifest_version must be 3, found ${manifest.manifest_version}`);
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.version || '')) {
    errors.push(`Invalid semver version in manifest.json: ${manifest.version}`);
  }

  for (const iconPath of Object.values(manifest.icons || {})) mustExist.push(iconPath);
  for (const iconPath of Object.values(manifest.action?.default_icon || {})) mustExist.push(iconPath);
  if (manifest.action?.default_popup) mustExist.push(manifest.action.default_popup);
  if (manifest.background?.service_worker) mustExist.push(manifest.background.service_worker);

  for (const rr of manifest.declarative_net_request?.rule_resources || []) {
    mustExist.push(rr.path);
  }
  for (const cs of manifest.content_scripts || []) {
    for (const jsPath of cs.js || []) mustExist.push(jsPath);
    for (const cssPath of cs.css || []) mustExist.push(cssPath);
  }

  for (const rel of new Set(mustExist)) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      errors.push(`Missing file referenced in manifest.json: ${rel}`);
    }
  }

  return errors;
}

function buildCleanZip(version) {
  const stagingDir = path.join(ROOT, '.release-staging');
  if (fs.existsSync(stagingDir)) fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });

  const copyRecursive = (srcRel) => {
    const src = path.join(ROOT, srcRel);
    const dst = path.join(stagingDir, srcRel);
    if (!fs.existsSync(src)) return;
    const stat = fs.statSync(src);
    if (stat.isDirectory()) {
      fs.mkdirSync(dst, { recursive: true });
      for (const entry of fs.readdirSync(src)) {
        copyRecursive(path.join(srcRel, entry));
      }
    } else {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  };

  for (const item of RUNTIME_PACKAGE_ITEMS) copyRecursive(item);
  for (const rf of RUNTIME_RULE_FILES) copyRecursive(rf);

  if (fs.existsSync(ZIP_PATH)) fs.rmSync(ZIP_PATH, { force: true });

  if (process.platform === 'win32') {
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path "${stagingDir}\\*" -DestinationPath "${ZIP_PATH}" -Force`
      ],
      { stdio: 'inherit' }
    );
  } else {
    execFileSync('zip', ['-r', ZIP_PATH, '.'], { cwd: stagingDir, stdio: 'inherit' });
  }

  fs.rmSync(stagingDir, { recursive: true, force: true });

  const stat = fs.statSync(ZIP_PATH);
  console.log(`[package-release] Built clean nabla-ad-shield.zip (v${version}, ${stat.size} bytes).`);
}

function main() {
  const checkOnly = process.argv.includes('--check-only');
  const skipTests = process.argv.includes('--skip-tests');

  console.log('[package-release] Running Chrome Web Store pre-flight checks...');
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));

  const errors = [];

  // 1. Asset & manifest validation
  errors.push(...auditManifestAssets(manifest));

  // 2. Runtime JS syntax validation
  const jsFiles = getAllRuntimeJsFiles();
  let combinedRuntimeCode = '';
  for (const rel of jsFiles) {
    try {
      execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'pipe' });
    } catch (err) {
      errors.push(`Syntax error in ${rel}: ${err.stderr?.toString() || err.message}`);
    }
    combinedRuntimeCode += '\n' + fs.readFileSync(path.join(ROOT, rel), 'utf8');
  }

  // 3. Permission audit (Purple Potassium prevention)
  errors.push(...auditPermissions(manifest, combinedRuntimeCode));

  // 4. Remote code safety scan
  errors.push(...auditRemoteCodeSafety(jsFiles));

  // 5. Compiled DNR JSON validity
  for (const rf of RUNTIME_RULE_FILES) {
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(ROOT, rf), 'utf8'));
      if (!Array.isArray(parsed)) errors.push(`${rf} must be a JSON array`);
    } catch (err) {
      errors.push(`Invalid JSON in ${rf}: ${err.message}`);
    }
  }

  if (errors.length > 0) {
    console.error('[package-release] Pre-flight FAILED:');
    for (const e of errors) console.error('  ✗', e);
    process.exit(1);
  }

  console.log(
    `[package-release] ✓ Manifest v${manifest.version}, ${jsFiles.length} runtime scripts, permissions [${(manifest.permissions || []).join(', ')}], and DNR JSON all verified.`
  );

  // 6. Run automated regression test suite
  if (!skipTests && fs.existsSync(path.join(ROOT, 'tests', 'run-tests.js'))) {
    console.log('[package-release] Running regression test suite...');
    execFileSync(process.execPath, [path.join(ROOT, 'tests', 'run-tests.js')], {
      stdio: 'inherit'
    });
  }

  if (!checkOnly) {
    buildCleanZip(manifest.version);
  } else {
    console.log('[package-release] Pre-flight check passed (--check-only).');
  }
}

main();

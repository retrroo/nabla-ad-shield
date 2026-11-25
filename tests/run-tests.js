#!/usr/bin/env node
/**
 * Shield by Nablai — Automated Multi-Site Regression & Safety Test Suite
 *
 * Zero-dependency Node.js test runner covering:
 *  1. X.com Tailwind root-wrapper black screen regression
 *  2. Sugargoo / Gmail / Discord non-cookie Decline/Reject button safety
 *  3. Accept-only cookie walls & React/Vue SPA DOM safety (zero .remove() crashes)
 *  4. Multi-language (EN/NL/DE/FR/ES/IT/PT/PL/TR) & Shadow DOM CMP reject coverage
 *  5. Cosmetic CSS & Heuristic AI false-positive protection (download-banner, head-container, dialogs)
 *  6. YouTube integrity & zero auto-mute regression
 *  7. Modular site-adapter registry safety (X.com, Reddit, Twitch)
 *  8. MV3 DNR rulesets & Chrome Web Store permission compliance
 */

'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const manifest = JSON.parse(read('manifest.json'));
const adsRules = JSON.parse(read('rules/ads_ruleset.json'));
const cookieRules = JSON.parse(read('rules/cookies_ruleset.json'));
const cosmeticSrc = read('scripts/cosmetic.js');
const cosmeticCode = stripComments(cosmeticSrc);
const heuristicSrc = read('scripts/heuristic_ai.js');
const heuristicCode = stripComments(heuristicSrc);
const ytShieldSrc = read('scripts/youtube_shield.js');
const ytShieldCode = stripComments(ytShieldSrc);
const ytMainSrc = read('scripts/youtube_main_world.js');
const adaptersSrc = read('scripts/site_adapters.js');
const adaptersCode = stripComments(adaptersSrc);

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n    -> ${err.message}`);
  }
}

console.log('\nShield by Nablai — Multi-Site Regression Test Suite\n');

// Extract production regexes from cosmetic.js & heuristic_ai.js
const rejectRegexMatch = cosmeticSrc.match(/const REJECT_TEXT_REGEX =\s*(\/[\s\S]*?\/i);/);
const tokenRegexMatch = cosmeticSrc.match(/const STRICT_COOKIE_CLASS_TOKEN =\s*(\/[\s\S]*?\/i);/);
const heuristicIdMatch = heuristicSrc.match(/(\/\(\?:[\s\S]*?ad-container[\s\S]*?\/i)\.test\(idStr\)/);

assert(rejectRegexMatch, 'Could not extract REJECT_TEXT_REGEX from scripts/cosmetic.js');
assert(tokenRegexMatch, 'Could not extract STRICT_COOKIE_CLASS_TOKEN from scripts/cosmetic.js');
assert(heuristicIdMatch, 'Could not extract word-bounded ID regex from scripts/heuristic_ai.js');

const REJECT_TEXT_REGEX = eval(rejectRegexMatch[1]);
const STRICT_COOKIE_CLASS_TOKEN = eval(tokenRegexMatch[1]);
const HEURISTIC_ID_REGEX = eval(heuristicIdMatch[1]);

// --- Group 1: X.com Black Screen Regression ---
test('1.1 X.com Tailwind root wrapper class NEVER triggers cookie container matcher', () => {
  const xComClass =
    'mx-auto flex min-h-(--x-page-height) w-full max-w-[1024px] flex-col overflow-x-clip pr-(--safe-area-right) pb-[max(0px,calc(var(--x-cookie-banner-clearance)-var(--safe-area-bottom)))] pl-(--safe-area-left) [--x-main-column-width:600px] [--x-sidebar-wide:0] has-[[data-bottom-bar]]:pb-[max(0px,calc(max(var(--x-bottom-bar-offset),var(--x-cookie-banner-clearance))-var(--safe-area-bottom)))] xl:max-w-[1280px] xl:[--x-sidebar-wide:1]';

  for (const tok of xComClass.split(/\s+/)) {
    if (tok.includes('[') || tok.includes('--')) continue;
    assert.strictEqual(
      STRICT_COOKIE_CLASS_TOKEN.test(tok),
      false,
      `X.com token falsely matched STRICT_COOKIE_CLASS_TOKEN: ${tok}`
    );
  }
});

test('1.2 X.com BottomBar "Refuse non-essential cookies" IS matched by REJECT_TEXT_REGEX', () => {
  assert.strictEqual(REJECT_TEXT_REGEX.test('Refuse non-essential cookies'), true);
  assert.strictEqual(REJECT_TEXT_REGEX.test('Niet-essentiële cookies weigeren'), true);
});

test('1.3 cosmetic.js contains zero dangerous broad substring selectors', () => {
  for (const forbidden of [
    '[class*="cookie-banner"',
    '[class*="consent-banner"',
    '[class*="ad-banner"',
    '[id*="ad-banner"'
  ]) {
    assert.strictEqual(cosmeticCode.includes(forbidden), false, `Forbidden selector found: ${forbidden}`);
  }
});

// --- Group 2: Non-Cookie Button Safety (Sugargoo / Gmail / Discord / GitHub) ---
test('2.1 No global generic aria-label decline/reject or positional :last-child clickers', () => {
  for (const forbidden of [
    'button[aria-label*="decline"',
    'button[aria-label*="reject"',
    'button[aria-label*="refuse"',
    'button[aria-label*="ablehnen"',
    '.qc-cmp2-buttons-desktop button:last-child'
  ]) {
    assert.strictEqual(
      cosmeticCode.includes(forbidden),
      false,
      `Unsafe global clicker selector found: ${forbidden}`
    );
  }
});

// --- Group 3: Accept-Only Cookie Walls & SPA DOM Integrity ---
test('3.1 Zero .remove() calls on .modal-backdrop or third-party SPA nodes (prevents React/Vue crashes)', () => {
  assert.strictEqual(cosmeticCode.includes('.modal-backdrop'), false);
  assert.strictEqual(cosmeticCode.includes('backdrops[b].remove()'), false);
  // Only our own injected <style> element (existing.remove()) may call .remove()
  const adapterRemoves = adaptersCode.match(/\b\w+\.remove\s*\(/g) || [];
  for (const call of adapterRemoves) {
    assert.strictEqual(
      call.trim().startsWith('existing.remove'),
      true,
      `Unexpected .remove() call on non-style element in site_adapters.js: ${call}`
    );
  }
});

test('3.2 Accept-only / navigation / preference buttons are NEVER clicked as Reject', () => {
  const nonRejectLabels = [
    'Accept all',
    'Accept',
    'Akkoord',
    'Alles accepteren',
    'OK',
    'Got it',
    'I understand',
    'Sign in',
    'Manage preferences',
    'Instellingen beheren',
    'Cancel',
    'Close'
  ];
  for (const label of nonRejectLabels) {
    assert.strictEqual(REJECT_TEXT_REGEX.test(label), false, `Falsely matched non-reject button: "${label}"`);
  }
});

// --- Group 4: Multi-Language & Shadow DOM CMP Support ---
test('4.1 Multi-language Reject / Essential-Only buttons match cleanly', () => {
  const rejectLabels = [
    'Reject all',
    'Reject',
    'Decline all',
    'Decline',
    'Refuse all',
    'Necessary cookies only',
    'Essential only',
    'Continue without accepting',
    'Alles weigeren',
    'Weigeren',
    'Alleen noodzakelijke cookies',
    'Alleen functionele cookies',
    'Doorgaan zonder te accepteren',
    'Alle ablehnen',
    'Nur notwendige Cookies',
    'Tout refuser',
    'Continuer sans accepter',
    'Rechazar todo',
    'Rifiuta tutto',
    'Rejeitar tudo',
    'Odrzuć wszystkie',
    'Tümünü reddet'
  ];
  for (const label of rejectLabels) {
    assert.strictEqual(REJECT_TEXT_REGEX.test(label), true, `Failed to match reject button: "${label}"`);
  }
});

test('4.2 Shadow DOM CMP hosts & 2-step Google Funding Choices are supported', () => {
  assert(cosmeticCode.includes('SHADOW_CMP_HOSTS'), 'Missing SHADOW_CMP_HOSTS');
  assert(cosmeticCode.includes('#usercentrics-root'), 'Missing Usercentrics Shadow DOM host');
  assert(cosmeticCode.includes('handleTwoStepFundingChoices'), 'Missing 2-step Funding Choices handler');
});

// --- Group 5: Cosmetic & Heuristic False-Positive Protection ---
test('5.1 Non-ad wrapper classes & IDs never match cookie token or heuristic ID regex', () => {
  for (const safeTok of [
    'has-cookie-banner',
    'with-cookie-banner',
    'cookie-banner-open',
    'download-banner',
    'upload-banner',
    'head-banner'
  ]) {
    assert.strictEqual(STRICT_COOKIE_CLASS_TOKEN.test(safeTok), false, `False match: ${safeTok}`);
  }
  for (const safeId of [
    'head-container',
    'download-container',
    'upload-container',
    'thread-container',
    'lead-unit'
  ]) {
    assert.strictEqual(HEURISTIC_ID_REGEX.test(safeId), false, `Heuristic ID false match: ${safeId}`);
  }
  for (const realAdId of ['dfp-ad-top', 'gpt-ad-1', 'ad-slot-hero', 'ad-container', 'google_ads_iframe_1']) {
    assert.strictEqual(HEURISTIC_ID_REGEX.test(realAdId), true, `Heuristic missed real ad ID: ${realAdId}`);
  }
});

test('5.2 Heuristic AI protects dialogs, modals, forms, SPA roots, and near-fullscreen wrappers', () => {
  assert(heuristicCode.includes("'DIALOG'"), 'DIALOG missing from PROTECTED_TAGS');
  assert(heuristicCode.includes("role === 'dialog'"), 'role="dialog" guard missing');
  assert(heuristicCode.includes("getAttribute('aria-modal') === 'true'"), 'aria-modal guard missing');
  assert(heuristicCode.includes('window.innerWidth * 0.75'), 'Near-fullscreen guard missing');
});

// --- Group 6: YouTube Integrity & Zero Auto-Mute ---
test('6.1 YouTube shield NEVER forces video.muted = true (zero muted-video regression)', () => {
  assert.strictEqual(/video\.muted\s*=\s*true/.test(ytShieldCode), false, 'Found forbidden video.muted = true!');
  assert(ytMainSrc.includes('muteOnStart'), 'youtube_main_world.js must strip muteOnStart');
  assert(ytMainSrc.includes('clearPersistentMute'), 'youtube_main_world.js must clear stale yt-player-volume mute');
});

test('6.2 General content scripts exclude YouTube completely in manifest.json', () => {
  const generalEntry = manifest.content_scripts.find((c) => c.matches.includes('<all_urls>'));
  assert(generalEntry, 'Missing general <all_urls> content_scripts entry');
  assert(
    (generalEntry.exclude_matches || []).includes('*://*.youtube.com/*'),
    'manifest.json must exclude *://*.youtube.com/* from general content scripts'
  );
  assert(
    generalEntry.js.includes('scripts/site_adapters.js'),
    'manifest.json must register scripts/site_adapters.js'
  );
});

// --- Group 7: Modular Site-Adapter Registry ---
test('7.1 Site-adapter registry isolates X.com, Reddit, and Twitch safely', () => {
  assert(adaptersCode.includes("id: 'x-twitter'"), 'Missing x-twitter adapter');
  assert(adaptersCode.includes("id: 'reddit'"), 'Missing reddit adapter');
  assert(adaptersCode.includes("id: 'twitch'"), 'Missing twitch adapter');
  assert(adaptersCode.includes('placementTracking'), 'Missing X.com promoted placementTracking rule');
  assert(adaptersCode.includes('shreddit-ad-post'), 'Missing Reddit shreddit-ad-post rule');
});

// --- Group 8: MV3 DNR Rulesets & CWS Compliance ---
test('8.1 cookies_ruleset.json NEVER blocks CMP runtime scripts or subframes', () => {
  for (const r of cookieRules) {
    const rt = r.condition?.resourceTypes || [];
    assert.strictEqual(rt.includes('script'), false, `Rule ${r.id} illegally blocks script`);
    assert.strictEqual(rt.includes('sub_frame'), false, `Rule ${r.id} illegally blocks sub_frame`);
  }
});

test('8.2 ads_ruleset.json excludes YouTube on all block rules and keeps Rule 101 thirdParty-only', () => {
  const r101 = adsRules.find((r) => r.id === 101);
  assert(r101, 'Missing consolidated Rule 101');
  assert.strictEqual(r101.condition.domainType, 'thirdParty', 'Rule 101 must be thirdParty-only');

  const protectedCheck = ['optimizely.com', 'spot.im', 'verizonmedia.com', 'quantcast.com', 'segment.io'];
  for (const d of protectedCheck) {
    assert.strictEqual(
      r101.condition.requestDomains.includes(d),
      false,
      `Protected non-ad domain found in Rule 101: ${d}`
    );
  }

  for (const r of adsRules) {
    if (r.action?.type === 'block') {
      assert(
        (r.condition?.excludedInitiatorDomains || []).includes('youtube.com'),
        `Block rule ${r.id} missing youtube.com exclusion`
      );
    }
  }

  const ytAllow = adsRules.find(
    (r) => r.action?.type === 'allow' && (r.condition?.initiatorDomains || []).includes('youtube.com')
  );
  assert(ytAllow, 'Missing high-priority YouTube initiator allow rule');
});

test('8.3 manifest.json has no unused scripting permission (Purple Potassium guard)', () => {
  assert.strictEqual(
    (manifest.permissions || []).includes('scripting'),
    false,
    'Unused "scripting" permission found in manifest.json'
  );
});

console.log(`\nResult: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) {
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Shield by Nablai — Automated MV3 DeclarativeNetRequest Filter Compiler
 *
 * Compiles rules/sources.json (+ optional upstream hosts sync via --sync)
 * into clean, deduplicated, Chrome MV3-compliant rules/ads_ruleset.json and
 * rules/cookies_ruleset.json while enforcing all universal site-safety invariants:
 *   - Never blocks CMP runtimes, auth, payment, A/B anti-flicker, or major site roots
 *   - Enforces domainType: "thirdParty" on broad domain block rules
 *   - Automatically excludes YouTube initiator domains on all block rules
 *   - Enforces zero "script" or "sub_frame" blocking in cookies_ruleset.json
 *   - Validates unique positive rule IDs and Chrome MV3 rule limits
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES_PATH = path.join(ROOT, 'rules', 'sources.json');
const ADS_OUT_PATH = path.join(ROOT, 'rules', 'ads_ruleset.json');
const COOKIES_OUT_PATH = path.join(ROOT, 'rules', 'cookies_ruleset.json');

const DOMAIN_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const MAX_DOMAINS_PER_RULE = 500;
const CHROME_MAX_STATIC_RULES = 30000;

const RESOURCE_TYPES_ALL_SUB = [
  'script',
  'xmlhttprequest',
  'sub_frame',
  'image',
  'media',
  'websocket',
  'other'
];

function isBlockedBySafetyList(domain, neverBlockSet) {
  if (neverBlockSet.has(domain)) return true;
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const parent = parts.slice(i).join('.');
    if (neverBlockSet.has(parent)) return true;
  }
  return false;
}

function parseHostsText(text) {
  const domains = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line.startsWith('#') || line.startsWith('!')) continue;
    const hashIdx = line.indexOf('#');
    if (hashIdx !== -1) line = line.slice(0, hashIdx).trim();
    const parts = line.split(/\s+/);
    let candidate = parts.length >= 2 && /^(0\.0\.0\.0|127\.0\.0\.1|::1?)$/.test(parts[0])
      ? parts[1]
      : parts.length === 1
      ? parts[0]
      : null;
    if (!candidate) continue;
    candidate = candidate.toLowerCase().replace(/^\.+|\.+$/g, '');
    if (candidate === 'localhost' || candidate === 'localhost.localdomain') continue;
    if (DOMAIN_REGEX.test(candidate)) {
      domains.push(candidate);
    }
  }
  return domains;
}

async function fetchUpstreamDomains(upstreamLists, neverBlockSet, maxExtra = 1500) {
  const collected = new Set();
  for (const list of upstreamLists || []) {
    if (!list.enabled || !list.url) continue;
    try {
      const res = await fetch(list.url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        console.warn(`[compile-rules] Upstream ${list.name} returned HTTP ${res.status}, skipping.`);
        continue;
      }
      const text = await res.text();
      const parsed = parseHostsText(text);
      let added = 0;
      for (const d of parsed) {
        if (collected.size >= maxExtra) break;
        if (!isBlockedBySafetyList(d, neverBlockSet)) {
          collected.add(d);
          added++;
        }
      }
      console.log(`[compile-rules] Synced ${added} safe domains from ${list.name}`);
    } catch (err) {
      console.warn(`[compile-rules] Failed to sync ${list.name}: ${err.message}`);
    }
  }
  return Array.from(collected);
}

function compileRules(sources, syncedDomains = []) {
  const ytExclude = Array.from(new Set(sources.youtubeExcludedInitiators || []));
  const neverBlockSet = new Set(
    (sources.neverBlockDomains || []).map((d) => d.trim().toLowerCase())
  );

  const adsRules = [];
  const seenPrimaryDomains = new Set();
  let nextId = 1;

  // 1. Primary named ad-network rules (IDs 1..N)
  for (const rawDomain of sources.primaryDomains || []) {
    const domain = rawDomain.trim().toLowerCase();
    if (!DOMAIN_REGEX.test(domain) || isBlockedBySafetyList(domain, neverBlockSet)) continue;
    if (seenPrimaryDomains.has(domain)) continue;
    seenPrimaryDomains.add(domain);

    const extraExcluded =
      domain === 'doubleclick.net' ||
      domain === 'googlesyndication.com' ||
      domain === 'googleadservices.com'
        ? ['tpc.googlesyndication.com', 'googlesyndication.com']
        : [];

    adsRules.push({
      id: nextId++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: `||${domain}^`,
        excludedInitiatorDomains: Array.from(new Set([...extraExcluded, ...ytExclude])),
        resourceTypes: RESOURCE_TYPES_ALL_SUB
      }
    });
  }

  // 2. Consolidated third-party domain rules (strictly domainType: "thirdParty")
  const mergedThirdParty = new Set();
  for (const raw of [...(sources.consolidatedThirdPartyDomains || []), ...syncedDomains]) {
    const domain = raw.trim().toLowerCase();
    if (!DOMAIN_REGEX.test(domain)) continue;
    if (seenPrimaryDomains.has(domain)) continue;
    if (isBlockedBySafetyList(domain, neverBlockSet)) continue;
    mergedThirdParty.add(domain);
  }

  const sortedThirdParty = Array.from(mergedThirdParty).sort();
  let chunkRuleId = Math.max(nextId, 101);
  for (let i = 0; i < sortedThirdParty.length; i += MAX_DOMAINS_PER_RULE) {
    const chunk = sortedThirdParty.slice(i, i + MAX_DOMAINS_PER_RULE);
    adsRules.push({
      id: chunkRuleId++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        requestDomains: chunk,
        domainType: 'thirdParty',
        excludedInitiatorDomains: ytExclude,
        resourceTypes: RESOURCE_TYPES_ALL_SUB
      }
    });
  }

  // 3. Targeted third-party ad path rules
  let pathRuleId = Math.max(chunkRuleId, 500);
  for (const pr of sources.pathRules || []) {
    adsRules.push({
      id: pathRuleId++,
      priority: pr.priority || 2,
      action: { type: 'block' },
      condition: {
        urlFilter: pr.urlFilter,
        ...(pr.domainType ? { domainType: pr.domainType } : {}),
        excludedInitiatorDomains: ytExclude,
        resourceTypes: pr.resourceTypes || ['script', 'xmlhttprequest', 'sub_frame', 'other']
      }
    });
  }

  // 4. High-priority allow rules (IDs 9000+)
  let allowRuleId = 9000;
  for (const ar of sources.allowRules || []) {
    adsRules.push({
      id: allowRuleId++,
      priority: ar.priority || 100,
      action: { type: 'allow' },
      condition: ar.condition
    });
  }

  // 5. Safe cookie telemetry rules (NEVER blocks script or sub_frame)
  const cookiesRules = [];
  let cookieRuleId = 1001;
  for (const cr of sources.cookieTelemetryRules || []) {
    const safeTypes = (cr.resourceTypes || ['ping', 'image']).filter(
      (t) => t !== 'script' && t !== 'sub_frame' && t !== 'main_frame'
    );
    if (safeTypes.length === 0) continue;
    cookiesRules.push({
      id: cookieRuleId++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: cr.urlFilter,
        domainType: 'thirdParty',
        resourceTypes: safeTypes
      }
    });
  }

  return { adsRules, cookiesRules, totalDomains: seenPrimaryDomains.size + sortedThirdParty.length };
}

function validateCompiledRules(adsRules, cookiesRules, sources) {
  const errors = [];
  const neverBlockSet = new Set(
    (sources.neverBlockDomains || []).map((d) => d.trim().toLowerCase())
  );

  if (adsRules.length + cookiesRules.length > CHROME_MAX_STATIC_RULES) {
    errors.push(`Total rules (${adsRules.length + cookiesRules.length}) exceed Chrome MV3 limit (${CHROME_MAX_STATIC_RULES}).`);
  }

  const validateSet = (name, rules) => {
    const ids = new Set();
    for (const r of rules) {
      if (!Number.isInteger(r.id) || r.id <= 0) {
        errors.push(`${name}: invalid rule ID ${r.id}`);
      }
      if (ids.has(r.id)) {
        errors.push(`${name}: duplicate rule ID ${r.id}`);
      }
      ids.add(r.id);

      if (r.action?.type === 'block') {
        if (name === 'ads_ruleset') {
          const ex = r.condition?.excludedInitiatorDomains || [];
          if (!ex.includes('youtube.com')) {
            errors.push(`${name}: rule ${r.id} missing youtube.com in excludedInitiatorDomains`);
          }
          for (const d of r.condition?.requestDomains || []) {
            if (isBlockedBySafetyList(d, neverBlockSet)) {
              errors.push(`${name}: rule ${r.id} blocks protected domain ${d}`);
            }
          }
        }
        if (name === 'cookies_ruleset') {
          const rt = r.condition?.resourceTypes || [];
          if (rt.includes('script') || rt.includes('sub_frame') || rt.includes('main_frame')) {
            errors.push(`${name}: rule ${r.id} illegally blocks script/frame resources`);
          }
        }
      }
    }
  };

  validateSet('ads_ruleset', adsRules);
  validateSet('cookies_ruleset', cookiesRules);

  const hasYtAllow = adsRules.some(
    (r) => r.action?.type === 'allow' && (r.condition?.initiatorDomains || []).includes('youtube.com')
  );
  if (!hasYtAllow) {
    errors.push('ads_ruleset: missing high-priority YouTube initiator allow rule');
  }

  return errors;
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const checkOnly = args.has('--check');
  const doSync = args.has('--sync');

  if (!fs.existsSync(SOURCES_PATH)) {
    console.error(`[compile-rules] Missing ${SOURCES_PATH}`);
    process.exit(1);
  }

  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, 'utf8'));

  if (checkOnly) {
    const diskAds = JSON.parse(fs.readFileSync(ADS_OUT_PATH, 'utf8'));
    const diskCookies = JSON.parse(fs.readFileSync(COOKIES_OUT_PATH, 'utf8'));
    const errors = validateCompiledRules(diskAds, diskCookies, sources);
    if (errors.length > 0) {
      console.error('[compile-rules] Validation FAILED:');
      for (const e of errors) console.error('  -', e);
      process.exit(1);
    }
    console.log(
      `[compile-rules] OK: ads_ruleset (${diskAds.length} rules) & cookies_ruleset (${diskCookies.length} rules) pass all MV3 & safety checks.`
    );
    return;
  }

  const syncedDomains = doSync
    ? await fetchUpstreamDomains(
        sources.upstreamLists,
        new Set((sources.neverBlockDomains || []).map((d) => d.toLowerCase())),
        sources.maxSyncedDomains || 1500
      )
    : [];

  const { adsRules, cookiesRules, totalDomains } = compileRules(sources, syncedDomains);
  const errors = validateCompiledRules(adsRules, cookiesRules, sources);
  if (errors.length > 0) {
    console.error('[compile-rules] Compilation validation FAILED:');
    for (const e of errors) console.error('  -', e);
    process.exit(1);
  }

  fs.writeFileSync(ADS_OUT_PATH, JSON.stringify(adsRules, null, 2) + '\n', 'utf8');
  fs.writeFileSync(COOKIES_OUT_PATH, JSON.stringify(cookiesRules, null, 2) + '\n', 'utf8');

  console.log(
    `[compile-rules] Compiled ${adsRules.length} ads rules (${totalDomains} unique domains) + ${cookiesRules.length} safe cookie telemetry rules.`
  );
}

main().catch((err) => {
  console.error('[compile-rules] Fatal error:', err);
  process.exit(1);
});

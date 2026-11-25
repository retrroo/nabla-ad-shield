---
trigger: always_on
description: Core safety, universal website compatibility, and Chrome Web Store compliance rules for Shield by Nablai.
---

# Shield by Nablai — Coding & Compatibility Rules

1. **Always verify before finishing any code change**:
   - Run `node tests/run-tests.js` and `node tools/package-release.js --check-only`.
   - If you edited `rules/sources.json`, run `node tools/compile-rules.js` first.
   - If bumping the release version in `manifest.json`, rebuild `nabla-ad-shield.zip` via `node tools/package-release.js`.

2. **Cosmetic & Heuristic Safety**:
   - Never add substring class/id selectors that can match Tailwind utility classes (`[...]`, `--var`) or common UI words (`download-banner`, `head-container`, `has-cookie-banner`).
   - Always exclude `[role="dialog"]`, `[role="alertdialog"]`, `[aria-modal="true"]`, `<dialog>`, `<form>`, and SPA roots from heuristic collapsing.

3. **DNR Ruleset Safety**:
   - Broad domain blocklists MUST set `"domainType": "thirdParty"` and exclude YouTube initiators (`youtube.com`, `www.youtube.com`, `m.youtube.com`, `music.youtube.com`, `youtu.be`, `googlevideo.com`).
   - `rules/cookies_ruleset.json` MUST NOT block `"script"` or `"sub_frame"` resources of CMP vendors.
   - Never block A/B-testing anti-flicker, comment engines, auth, or payment domains (e.g., `optimizely.com`, `visualwebsiteoptimizer.com`, `spot.im`, `stripe.com`, `paypal.com`, `accounts.google.com`).

4. **Chrome Web Store Strictness**:
   - No unused permissions in `manifest.json` (verified automatically by `tools/package-release.js`).
   - No remote code execution (`eval`, remote `<script src>` injection, `new Function` from remote text).
   - No keyword stuffing in `manifest.json` or `store_assets/STORE_LISTING.md`.

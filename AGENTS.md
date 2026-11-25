# Shield by Nablai — Engineering & Multi-Agent Team Constitution

This repository contains **Shield by Nablai**, a Manifest V3 Chromium ad blocker, stealth YouTube shield, and site-safe cookie consent auto-rejecter.

Every agent working in this repository (standalone, subagent, workflow agent, or `/teamwork` swarm worker) MUST follow these non-negotiable engineering invariants and role boundaries.

---

## 1. Team Roles & Ownership

| Role | Roster Name | Primary Scope | Owns |
| :--- | :--- | :--- | :--- |
| **Coordinator** | `coordinator` | Architecture, roadmap, merging, release approval | `manifest.json`, `background.js`, final sign-off |
| **Research** | `researcher` | Upstream filter intelligence (`uAssets`, `AdGuardFilters`, `EasyList`, `Autoconsent`), YouTube & CMP anti-adblock tracking, site breakage root-cause analysis | Research reports, `rules/sources.json` proposals |
| **Infrastructure** | `infra` | MV3 DNR compiler, modular site-adapters, CWS pre-flight validator, zero-dependency release packager | `tools/*`, `rules/*`, `scripts/site_adapters.js`, `package.json` |
| **Testing Team** | `qa-unit` / `qa-sites` | Automated DOM/CSS/DNR regression tests, live multi-site compatibility matrix (YouTube, X.com, Reddit, Twitch, news, webshops, CMP popups) | `tests/*`, verification reports |

---

## 2. Non-Negotiable Safety Invariants (Universal Site Compatibility)

1. **Zero Black/White Screens on SPAs (X.com, Next.js, Tailwind, React, Vue)**:
   - NEVER use broad substring selectors like `[class*="cookie-banner"]`, `[class*="consent-banner"]`, or `[class*="ad-banner"]` (Tailwind CSS variables like `pb-[...--x-cookie-banner-clearance...]` and classes like `download-banner`/`head-banner` will match and hide entire pages).
   - NEVER call `.remove()` on third-party SPA DOM nodes (causes React/Vue `NotFoundError: removeChild` crashes).
   - ALWAYS guard container operations against `html`, `body`, `main`, `nav`, `header`, `footer`, `article`, `form`, `dialog`, SPA mount roots (`#root`, `#app`, `#__next`, `#react-root`), and containers wrapping those landmarks.
2. **Site-Safe Cookie Consent Handling**:
   - NEVER hard-block CMP runtime JavaScript (`cdn.cookielaw.org`, `consent.cookiebot.com`, `didomi.io`, `usercentrics.eu`, etc.) in `rules/cookies_ruleset.json` — blocking CMP runtimes breaks site callbacks (`__tcfapi`, `OneTrust`, `Cookiebot`, `UC_UI`) and stalls checkouts, logins, and videos.
   - NEVER click generic `[aria-label*="decline"]` or `[aria-label*="reject"]` buttons globally outside strictly verified cookie dialogs.
   - NEVER hide Accept-only cookie walls or required popups with `display: none` — leave them interactive so the website remains 100% usable.
3. **YouTube Playback Integrity**:
   - Keep general cosmetic/heuristic/adapter scripts excluded from `youtube.com` (`exclude_matches` + `ancestorOrigins` guard).
   - Keep `excludedInitiatorDomains` for YouTube and Rule `9003` (`allow` for YouTube initiators) intact in `rules/ads_ruleset.json` so YouTube never triggers `ERR_BLOCKED_BY_CLIENT` grey screens.
   - NEVER force-mute `<video>` elements (`video.muted = true`), which persists into YouTube's `yt-player-volume` storage.
4. **Chrome Web Store Compliance (`Purple Potassium` Prevention)**:
   - Every permission in `manifest.json` MUST have active runtime `chrome.<api>` usage.
   - NEVER bundle `tools/`, `tests/`, `workflows/`, `.agents/`, `store_assets/`, or `package.json` into `nabla-ad-shield.zip`.
   - ALWAYS run `npm run preflight` (which runs `tools/compile-rules.js --check`, `tests/run-tests.js`, and `tools/package-release.js --check-only`) before any commit or release.

---

## 3. Standard Commands

```bash
npm run compile-rules   # Compile rules/sources.json -> rules/ads_ruleset.json & cookies_ruleset.json
npm test                # Run full automated multi-site regression test suite
npm run preflight       # Syntax + DNR schema + CWS permission audit + test suite
npm run package         # Run full preflight and build clean nabla-ad-shield.zip
```

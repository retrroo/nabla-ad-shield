# Shield by Nablai — Engineering & Multi-Agent Team Constitution

This repository contains **Shield by Nablai**, a Manifest V3 Chromium ad blocker, stealth YouTube shield, and site-safe cookie consent auto-rejecter.

Every agent working in this repository (standalone, subagent, workflow agent, or `/teamwork` swarm worker) MUST follow these non-negotiable engineering invariants and role boundaries.

---

## 1. Team Roles, Ownership & Hybrid Model Strategy

To stay fast and token-efficient, every `/swarm` session and workflow uses **Hybrid Model Routing** (lightweight models by default, escalating to larger models ONLY when a task requires deep reasoning):

| Role | Roster Name | Default Model Tier | Escalate to Large Model When... | Owns |
| :--- | :--- | :--- | :--- | :--- |
| **Coordinator** | `coordinator` | Standard / Pro | Always handles architecture, reviews, merges, and escalation decisions | `manifest.json`, `background.js`, final sign-off |
| **Research** | `researcher` | **Fast / Light (Flash)** | Complex YouTube Botguard/SSAI reverse-engineering or obfuscated anti-adblock scripts | Research reports, `rules/sources.json` proposals |
| **Infrastructure** | `infra` | **Fast / Light (Flash)** | Tricky `MAIN`-world YouTube proxies, Shadow DOM race conditions, or subtle SPA breakage | `tools/*`, `rules/*`, `scripts/site_adapters.js`, `package.json` |
| **QA-Unit** | `qa-unit` | **Fastest / Lightest (Flash-Lite / Flash)** | Designing complex mock DOM harnesses | `tests/*`, `npm run preflight` |
| **QA-Sites** | `qa-sites` | **Fastest / Lightest (Flash-Lite / Flash)** | Deep root-cause debugging of a failing live website | Multi-site compatibility audits |

**Swarm Cost Rules**:
- Check available models first (`swarm(action="models")`) and pin lightweight workers to the fastest economical Flash/Lite model.
- Only switch a waiting worker to a larger model (`swarm(action="model", name="...", model="...")`) when it hits a genuinely complex problem, and explain why.
- Avoid noisy `@all` broadcasts; @mention only the exact worker needed, and `kill` workers once their work is landed.

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

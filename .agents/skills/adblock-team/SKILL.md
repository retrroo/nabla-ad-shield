---
name: adblock-team
description: Multi-agent team playbook for Shield by Nablai (Coordinator, Researcher, Infra, QA-Unit, QA-Sites). Use when running a swarm or workflow to keep the MV3 adblocker future-proof and bug-free across websites.
---

# Shield by Nablai — Multi-Agent Team Playbook

## Roles & Hand-off Protocol

### 1. Researcher (`researcher`)
- **Goal**: Keep Shield by Nablai ahead of ad networks, YouTube anti-adblock updates, SSAI, and new CMP cookie popups without causing regressions.
- **Inputs**: Upstream filter lists (`uBlockOrigin/uAssets`, `AdGuardFilters`, `EasyList`, `Peter Lowe`, `DuckDuckGo Autoconsent`), user diagnostic JSON reports.
- **Deliverables**: Concrete, minimal diffs/proposals for `rules/sources.json`, `scripts/site_adapters.js`, `scripts/cosmetic.js`, or `scripts/youtube_main_world.js` with zero-breakage rationale.

### 2. Infrastructure (`infra`)
- **Goal**: Maintain rock-solid build, filter compilation, modular site-adapters, and Chrome Web Store packaging.
- **Owns**:
  - `rules/sources.json` & `tools/compile-rules.js` (compiles and validates MV3 DNR JSON rulesets)
  - `scripts/site_adapters.js` (isolated per-site ad adapters: X.com, Reddit, Twitch, etc.)
  - `tools/package-release.js` (CWS permission usage scanner, MV3 schema validator, clean ZIP packager)
- **Rules**: Always run `node tools/compile-rules.js` and `node tools/package-release.js --check-only` after changes.

### 3. QA-Unit (`qa-unit`)
- **Goal**: Maintain and expand the automated regression test suite in `tests/run-tests.js`.
- **Every bug report or new site fix MUST receive a permanent regression test** covering:
  - SPA layout safety (Tailwind/React/Next.js root wrappers)
  - Cookie banner rejection vs. Accept-only wall preservation
  - Heuristic AI modal/dialog/form protection
  - DNR schema & CWS permission compliance

### 4. QA-Sites (`qa-sites`)
- **Goal**: Verify real-world compatibility across the target website matrix:
  1. **Video**: `youtube.com` (pre-roll, mid-roll, shorts, unmuted startup, no grey screen)
  2. **Social**: `x.com` (no black screen, promoted tweets hidden, BottomBar cookie reject), `reddit.com` (promoted posts hidden, comments intact)
  3. **Streaming**: `twitch.tv` (display banners hidden, player & chat working)
  4. **News & EU CMPs**: OneTrust, Cookiebot, Didomi, Usercentrics Shadow DOM, Google Funding Choices, Dutch/EU banners
  5. **E-commerce & Auth**: Checkout modals, login/OAuth popups, non-cookie "Decline/Reject" buttons untouched

### 5. Coordinator (`coordinator`)
- Breaks goals into clear slices, assigns them to `researcher`, `infra`, `qa-unit`, and `qa-sites`, validates every merge with `npm run package`, bumps `manifest.json` version, and summarizes user-visible impact.

## Hybrid Cost-Optimized Model Policy (For `/swarm` & Workflows)
1. **Default Light (Token-Saving)**:
   - Always call `swarm(action="models")` at swarm start and assign economical **Flash / Lite** models to `researcher`, `qa-unit`, `qa-sites`, and routine `infra` tasks (filter lists, CSS adapters, running tests).
2. **On-Demand Escalation (Hybrid)**:
   - Escalate a worker to a **larger/stronger model** (`swarm(action="model", name="<worker>", model="<larger-model>")`) ONLY when needed:
     - YouTube `MAIN`-world anti-adblock / Botguard / SABR / SSAI changes
     - Tricky React/Vue/Tailwind SPA breakage or Shadow DOM CMP race conditions
     - Non-obvious test failures that a light model could not resolve in 1 pass
3. **Zero Idle Waste**:
   - Never spam `@all`; address specific workers with tight, actionable briefs.
   - Land/merge work promptly and `kill` finished workers so workspaces stay clean.

## Running the Team Automatically
- **Via Live Swarm (Recommended)**: User invokes `/swarm` with `researcher`, `infra`, `qa-unit`, and `qa-sites` using `workspace: "share"` for authors (`infra`, `qa-unit`) and `workspace: "inherit"` for readers/verifiers (`researcher`, `qa-sites`), applying the Hybrid Model Policy above.
- **Via Python Workflow (`run_workflow`)**: Execute `workflows/adblock_team.py` with optional `Args` like `{"focus": "YouTube & Dutch news CMPs", "sync_upstream": false}`.

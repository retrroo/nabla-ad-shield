"""
Shield by Nablai — Multi-Agent Adblock Team Orchestration Workflow

Runs the full 4-role engineering team (Researcher -> Infra + Site-Adapters -> QA-Unit + QA-Sites -> Coordinator)
via Antigravity's `run_workflow` tool.

Optional Args (JSON object):
  - focus: str (e.g. "YouTube, X.com, and Dutch news cookie banners")
  - sites: list[str] (websites to audit in QA-Sites phase)
  - sync_upstream: bool (whether Infra should test upstream filter sync)
"""

focus = args.get("focus", "General multi-site compatibility, YouTube stability, and CMP cookie banners")
sites = args.get(
    "sites",
    [
        "youtube.com",
        "x.com",
        "reddit.com",
        "twitch.tv",
        "nu.nl / European news CMPs",
        "webshops & login/checkout modals",
    ],
)
sync_upstream = bool(args.get("sync_upstream", False))

# ==============================================================================
# PHASE 1: RESEARCHER
# ==============================================================================
phase("1. Research & Threat Intelligence")
log(f"Starting Shield by Nablai team workflow | Focus: {focus}")

research_report = await agent(
    f"""You are the Researcher for Shield by Nablai (a Chrome MV3 adblocker in this workspace).
Read AGENTS.md and .agents/rules/shield-standards.md first.
Focus area: {focus}

Audit our current rules/sources.json, scripts/cosmetic.js, scripts/site_adapters.js,
scripts/heuristic_ai.js, and scripts/youtube_main_world.js against modern ad/CMP/anti-adblock
patterns (uBlockOrigin/uAssets, AdGuardFilters, EasyList, DuckDuckGo Autoconsent).

Return a concise, prioritized list of concrete, zero-breakage improvements split into:
- infra_tasks (DNR rules, compiler, packaging)
- adapter_tasks (site-specific adapters or CMP selectors)
- risks_to_avoid (false positives that could cause black screens or broken popups)
""",
    schema={
        "type": "object",
        "properties": {
            "summary": {"type": "string"},
            "infra_tasks": {"type": "array", "items": {"type": "string"}},
            "adapter_tasks": {"type": "array", "items": {"type": "string"}},
            "risks_to_avoid": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["summary", "infra_tasks", "adapter_tasks", "risks_to_avoid"],
    },
    role="Researcher",
    type_name="research",
    model="flash",
)
log("Research complete:", research_report["summary"])

# Escalate Infra/Adapter to stronger model ONLY if Researcher flags complex anti-adblock / SPA risks
needs_heavy_model = any(
    any(k in t.lower() for k in ("youtube", "botguard", "ssai", "sabr", "main world", "shadow dom", "react", "black screen"))
    for t in (research_report["infra_tasks"] + research_report["adapter_tasks"])
)
eng_model = "pro" if needs_heavy_model else "flash"
log(f"Hybrid model routing -> Engineering tier: {eng_model}")

# ==============================================================================
# PHASE 2: PARALLEL ENGINEERING (INFRA + SITE ADAPTERS)
# ==============================================================================
phase("2. Infrastructure & Site-Adapter Audit")

eng_specs = [
    {
        "role": "Infra Engineer",
        "prompt": f"""You are the Infrastructure Engineer for Shield by Nablai.
Read AGENTS.md and .agents/rules/shield-standards.md.
Review the Researcher's infra_tasks: {research_report["infra_tasks"]}
Risks to avoid: {research_report["risks_to_avoid"]}

Run `node tools/compile-rules.js --check` and `node tools/package-release.js --check-only`
(and if sync_upstream={sync_upstream}, report what `tools/compile-rules.js` checks).
Verify MV3 DNR limits, CWS permission compliance, and list exact next actions or patches verified.""",
    },
    {
        "role": "Site-Adapter Engineer",
        "prompt": f"""You are the Site-Adapter & CMP Engineer for Shield by Nablai.
Read AGENTS.md, scripts/cosmetic.js, scripts/site_adapters.js, and scripts/heuristic_ai.js.
Review the Researcher's adapter_tasks: {research_report["adapter_tasks"]}
Risks to avoid: {research_report["risks_to_avoid"]}

Audit every adapter and CMP selector for SPA safety (Tailwind arbitrary values, React/Vue DOM stability,
Accept-only cookie wall preservation, and Shadow DOM CMP coverage). Report concrete verified findings.""",
    },
]

eng_results = await parallel(
    eng_specs,
    lambda spec: agent(
        spec["prompt"],
        schema={
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["OK", "CHANGES_NEEDED"]},
                "findings": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["status", "findings"],
        },
        role=spec["role"],
        workspace="inherit",
        model=eng_model,
    ),
)
for spec, res in zip(eng_specs, eng_results):
    log(f"{spec['role']} -> {res['status']} ({len(res['findings'])} findings)")

# ==============================================================================
# PHASE 3: PARALLEL QA TEAM (QA-UNIT + QA-SITES FAN-OUT)
# ==============================================================================
phase("3. QA Team & Multi-Site Verification")

qa_unit_task = agent(
    """You are QA-Unit for Shield by Nablai.
Run `npm run preflight` (which executes compile-rules --check, package-release --check-only, and tests/run-tests.js).
Report exact pass/fail counts and any missing regression test coverage.""",
    schema={
        "type": "object",
        "properties": {
            "passed": {"type": "boolean"},
            "details": {"type": "string"},
            "coverage_gaps": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["passed", "details", "coverage_gaps"],
    },
    role="QA-Unit",
    model="flash_lite",
)

qa_sites_task = parallel(
    sites,
    lambda site: agent(
        f"""You are QA-Sites auditing Shield by Nablai compatibility for: {site}.
Inspect manifest.json, rules/ads_ruleset.json, rules/cookies_ruleset.json, scripts/cosmetic.js,
scripts/site_adapters.js, scripts/heuristic_ai.js, and (if YouTube) scripts/youtube_*.js.
Check specifically for:
1. Any selector or heuristic that could cause a black/white screen or hide content on {site}
2. Any cookie popup / CMP / login / checkout modal that could stop working on {site}
3. Any network rule that could break essential assets on {site}
Reply concisely with status PASS or WARN and specific findings.""",
        schema={
            "type": "object",
            "properties": {
                "site": {"type": "string"},
                "status": {"type": "string", "enum": ["PASS", "WARN"]},
                "notes": {"type": "string"},
            },
            "required": ["site", "status", "notes"],
        },
        role=f"QA-Sites ({site})",
        type_name="research",
        model="flash",
    ),
)

qa_unit_result, qa_sites_results = await parallel(
    [qa_unit_task, qa_sites_task],
    lambda t: t,
)

log("QA-Unit:", "PASS" if qa_unit_result["passed"] else "FAIL", "-", qa_unit_result["details"])
for sr in qa_sites_results:
    log(f"QA-Sites [{sr['site']}]: {sr['status']} - {sr['notes']}")

# ==============================================================================
# PHASE 4: COORDINATOR SIGN-OFF
# ==============================================================================
phase("4. Coordinator Sign-Off")

final_summary = await agent(
    f"""You are the Coordinator for Shield by Nablai.
Synthesize the results from all 4 team roles into a clear, actionable release readiness summary (in Dutch):
- Research: {research_report}
- Engineering: {eng_results}
- QA-Unit: {qa_unit_result}
- QA-Sites: {qa_sites_results}

State clearly whether the extension is ready to ship (`npm run package`) or which exact items must be fixed first.""",
    schema={"type": "string"},
    role="Coordinator",
)

log("Coordinator Sign-Off complete.")
print(final_summary)

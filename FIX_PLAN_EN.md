# Fix plan for the coding agent — Context Graph review follow-up

## Objective

Repair the existing Bob Context Graph extension and MCP server so that context freshness, change impact, cache reuse, and the UI agree on the same source revision. Preserve working functionality, finish the incomplete fixes, and validate the newly added features. Deliver a rebuilt, installable VSIX and an evidence-backed completion report.

This is an implementation handoff, not a request for another proposal. Work through the phases below and verify each one. Do not treat passing the current unit suite as completion.

## Candidate and authoritative evidence

- Repository: `/Users/ahmadfariz/Projects/github/context-graph-extension`
- Reviewed source commit: `124ec0d226f94b11f1f5cd6ef9a62e96b954e3ed`
- Review directory: `/Users/ahmadfariz/Projects/codex/context-graph-review-20260927`
- Review report: `/Users/ahmadfariz/Projects/codex/context-graph-review-20260927/REPORT.md`
- Evidence: `evidence/results.json`, `evidence/mcp-results.json`, `evidence/extra-results.json`, `evidence/mcp-trace.json`, and UI screenshots in that review directory.
- Reproduction scripts: `review.cjs`, `mcp.cjs`, and `extra.cjs` in the review directory.
- Original requirements and references: repository `REQUIREMENTS.md`, `FIX_REQUEST_EN.md`, and `QA_CHECKLIST.md`.
- Read-only polyglot evaluation target: `/Users/ahmadfariz/Projects/codex/microservices-demo`.

The reviewed candidate built and installed successfully. Its 20 existing tests passed, but additional checks produced 19 PASS and 28 FAIL across 47 assertions. These are assertion counts, not 28 independent bugs. Live watsonx and live Ollama inference were not tested. Mock success is not proof that a model is available.

There are existing changes to tracked `dist` files from the review build. Inspect and preserve unrelated work; do not reset the repository to make it clean. Do not modify the demo's source merely to make extraction assertions pass. Use independent temporary fixtures for mutations.

## Scope and order

Complete phases 1–6 for correctness and release readiness. Phase 7 is the separate five-language demo enhancement: assess it explicitly and implement it after the core is reliable. Do not silently claim full polyglot support if it remains incomplete. Do not add unrelated features before the failing acceptance scenarios are repaired.

Suggested commit boundaries: regression fixtures; Git/snapshot/cache lifecycle; shared change-impact pipeline; parser dispatch; UI/AI lifecycle; packaging/docs; broader polyglot support. Adapt boundaries if dependencies require it.

## Phase 1 — Establish regression coverage and shared state semantics

### 1.1 Preserve the failures as tests

Port the audit's meaningful failing scenarios into the repository test suite. Assertions must cause a nonzero exit when they fail. The external audit scripts currently record FAIL as data and may exit 0; do not copy that behavior into CI.

Cover both core and real MCP stdio integration. Add extension-host tests or a controlled VS Code API mock where useful, and retain live UI acceptance for graph interactions. Test public behavior rather than mirroring implementation details.

Keep the existing successes: 3 Spring demo services, 18 APIs, 5 tables, 3 databases, 2 service-to-service edges, warm cache reuse, parser annotation fixes, targeted refresh, clean MCP transport, and safe graph rendering.

### 1.2 Define one source snapshot contract

Distinguish:

- Current observed repository identity, branch, HEAD, and dirty content revision.
- Last indexed snapshot and provenance of reused payloads.
- Comparison baseline for the latest meaningful change.
- Version of parser/cache schema and analysis configuration.

Required invariants:

1. First clean analysis establishes an indexed snapshot without inventing a prior change.
2. A subsequent commit or dirty edit is comparable against that snapshot before an explicit refresh.
3. Indexing, reading context, or refreshing the same revision does not consume the pending comparison baseline.
4. Repeated reads of the same revision retain the same meaningful impact range. On the next distinct revision, apply and document a consistent baseline-advance rule.
5. Refreshing a target preserves comparison history for it and unrelated services.
6. Restarting the server preserves the meaningful before/after range.
7. `unknown` is never treated as a valid Git commit for a diff.
8. An empty scoped changeset produces no fabricated impact.
9. Clean cache entries never contain an unlabeled dirty overlay.

Implement this as a shared core path used by both MCP and VSIX. Avoid separate handlers that reconstruct inconsistent ChangeSets.

## Phase 2 — Repair Git detection, discovery, and cache correctness

### 2.1 Parse dirty paths correctly and fingerprint content — P1

Primary file: `packages/core/src/git/GitAnalyzer.ts`.

Observed failures: trimming the entire porcelain output removes the first unstaged status space; `order-service/...` becomes `rder-service/...`. The dirty hash includes only path/status, so a second edit of the same file retains the same hash.

Use argument-based Git execution and a robust machine-readable format, preferably NUL-delimited. Preserve status columns and correctly handle staged, unstaged, untracked, deleted, and renamed files. Include both old and new rename paths where needed for service ownership. Fingerprint actual relevant contents, not merely names, sizes, or timestamps. Cache internal files must not dirty the analyzed source snapshot.

Acceptance:

- Unstaged `/orders` → `/orders-v2` immediately refreshes order APIs; other services stay cached.
- A second same-length edit `/orders-v2` → `/orders-v3` changes the revision and refreshes again.
- Staging, unstaging, reverting, deletion, renames, spaces, and Unicode filenames behave correctly.
- Moving a file between services updates both affected owners.
- Restoring source returns to the correct clean snapshot.
- Dirty impact works after a single initial clean analysis.

Evidence IDs: `DIRTY-path`, `DIRTY-first`, `DIRTY-hash`, `DIRTY-second`, `DIRTY-impact`, `M-dirty`, `M-dirty2`.

### 2.2 Correct monorepo reuse and branch freshness — P1

Primary files: `ContextGraphEngine.ts`, `WorkspaceScanner.ts`.

Currently an order-only commit reports 0 cached / 3 refreshed. Scoped filtering exists, but unchanged contexts are still labeled Changed. Cached discovery also restores an old branch when a checkout points to the same HEAD.

Read current branch and HEAD independently of cached discovery metadata. Reuse unaffected payloads without rerunning parsers or marking them changed. Record the new observed workspace revision while preserving payload provenance. Share repository diff work within one analysis cycle.

Acceptance: one service commit gives 1 refreshed / 2 cached, with parser spies confirming only relevant parsing; branch checkout at the same SHA reports the new branch. New/removed services are detected, including after an initially empty workspace. Do not equate a fingerprint log message with zero filesystem traversal.

Evidence IDs: `F02`, `BRANCH`.

### 2.3 Make identity and cache invalidation reliable — P1

Primary files: `WorkspaceScanner.ts`, `ContextCache.ts`, MCP freshness path.

- Replace lossy path flattening as the sole ID scheme. `team-a/order-service` and `team/a-order-service` currently collide. Use a stable canonical namespace/path representation or readable label plus collision-resistant suffix.
- Include workspace/repository identity when cache directories can be shared; validate cached root paths.
- Enforce schema/parser compatibility on reads. Migrate or reject old entries explicitly; adding a version field without checking it is insufficient.
- Avoid guessing a branch/dirty slot by returning the first loosely matching filename.
- Make MCP freshness sensitive to source changes in non-Git workspaces and service topology changes, not just known repository HEADs.
- Make cross-process metadata updates safe against lost writes and temporary-file collisions. Sequential re-reading alone is not a concurrency guarantee.
- Surface corrupt cache/write failures as diagnostics and safely reanalyze; do not silently claim success.

Acceptance: unique canonical IDs for collision fixtures; old schema rejected/migrated; non-Git MCP reflects edits; two writer processes preserve distinct entries; VSIX/MCP readers observe new metadata and consistent baselines; corrupt/partial JSON recovers visibly. Cover migration from existing cache files.

Evidence IDs: `F09-collision`, `CACHE-schema`, `F10-MCP`; sequential cross-instance reading already passes and must remain working.

## Phase 3 — Unify change analysis, dependency updates, and impact facts

### 3.1 Fix MCP and engine baseline handling — P1

Primary files: `packages/mcp-server/src/index.ts`, `packages/core/src/ContextGraphEngine.ts`.

`handleAnalyzeChange()` calls `getOrAnalyze()` and then compares HEAD with the newly updated last-indexed commit, returning No changes. `refreshService()` invalidates baseline metadata. The engine cannot detect the first post-index commit before refresh because its baseline is null.

Route MCP and UI through the phase-1 shared comparison pipeline. Preserve history during refresh. Remove duplicated unscoped ChangeSet construction. Deduplicate concurrent analysis for the same snapshot, and prevent older async completions from overwriting newer state.

Acceptance sequence:

1. Initial query, no changes: report no changes accurately.
2. Commit a controller/DTO/entity change.
3. `analyze_change` directly returns the change.
4. `get_system_context` followed by `analyze_change` returns the same range.
5. Targeted refresh, full refresh, and server restart preserve that meaningful range.
6. Unaffected services return no impact.
7. Repeated warm requests report truthful reuse/freshness instead of replaying stale cold-run counters.

Evidence IDs: `F03-before`, `F03-refresh`, `M-impact`, `M-impact-refresh`, `M-warm`.

### 3.2 Resolve names without ambiguity — P1/P2

Canonical ID matches take precedence. For display-name or substring lookup, collect all candidates; reject multiple matches with their canonical IDs. Do not use `.find()` for an ambiguous exact display name.

Acceptance: both `service` and duplicate `order-service` names are rejected; an exact canonical ID selects the intended service. Evidence: `F23-exact`; preserve `F23-partial` success.

### 3.3 Replace stale dependency facts — P1

Datasource rename currently retains both `orders_db` and `orders_v2`. Recompute the affected dependency category from its source, preserving unrelated categories. Deleting a datasource must remove its former evidence-backed edge; distinguish inferred fallback DB names from confirmed configuration.

Acceptance: rename removes the old DB and edge, preserves REST dependencies, and creates only the new DB relationship. Verify delete and `.yaml` cases. Evidence: `F08`.

### 3.4 Supply structured change facts and evidence-based severity — P1

Primary files: core models/parsers, `WatsonxRuntime.ts`, graph builder.

Build structured before/after changes using the appropriate source revisions, including field name, type, affected endpoint/table, and available evidence. Read actual old/new snapshots; do not present the current working tree as both sides. Distinguish additive DTO changes from breaking field changes and internal DTOs from exposed contracts.

Feed these facts into deterministic explanations and the AI prompt. Connect `describeApi` to changed/new API artifacts and cache results by artifact/model/prompt version. Never send full source files or credential-bearing configuration merely to obtain a summary.

Do not mark every REST consumer HIGH for an internal DB-only change. Use demonstrated contract exposure for strong severity; represent potential/transitive impact separately. Include reasoning source and uncertainty. Keep transitive traversal, handle cycles, and report truncation.

Graph impact must use canonical component IDs/types and aggregate the maximum severity deterministically. A database-only entry must not accidentally match a service through a substring.

Acceptance:

- Prompt and report include `customerId/customer_id: Integer → UUID` from verified snapshots.
- Relevant API descriptions are generated; unchanged warm requests make no new generation calls.
- DB-only change without contract evidence does not blindly give a consumer HIGH.
- `[LOW,HIGH]` and `[HIGH,LOW]` produce the same HIGH result.
- Database impact highlights only its intended DB node unless a separate service impact exists.
- Malformed or unavailable AI returns a labeled deterministic result.

Evidence: `F13-facts`, `F13-api`, `F12`, `F17-order`, `F17-target`. Preserve successful shared-table aggregation and A→B→C traversal.

## Phase 4 — Finish the newly introduced parser features

### 4.1 Dispatch incremental analysis across supported stacks — P1

Cold parsing supports Node/Python/Go, but incremental paths invoke API parsers only for Spring. Centralize stack-to-parser dispatch and use it for full, committed incremental, and dirty incremental analysis. Recognize common entry files as potentially containing routes instead of relying solely on controller-like filenames.

Acceptance: for Node, Python, and Go, `/old` → `/new` appears after both committed and uncommitted edits; deletion removes the endpoint; untouched services remain cached. Preserve Spring results. Evidence: `POLY-node`, `POLY-python`, `POLY-go`.

### 4.2 Make the semantic model honest and inspectable — P1/P2

Address F24 with structured request/response schema references, proven API/model/entity/dependency associations, and provenance. Represent unsupported or unknown information distinctly from a confirmed empty list. Provide a labeled deterministic summary when no AI is configured. Do not fabricate mappings or events to populate fields. Update cache version, MCP serializers, and UI consumers together.

## Phase 5 — Synchronize the extension and finish AI setup behavior

Primary files: `extension.ts`, providers, `GraphWebviewProvider.ts`, `graphHtml.ts`, `ai/AiSetup.ts`.

### 5.1 Keep one coherent UI snapshot — P1

Observe relevant saves, Git HEAD/ref/branch changes, and configuration changes. Debounce/coalesce updates; dispose watchers and subscriptions. Handle repository paths correctly, including multi-root workspaces or explicitly documented scope limits. Analyze Changes must first obtain current context without consuming its comparison baseline.

Update sidebar, graph, and impact panel from the same revision. Clear stale highlights when switching branches or publishing a clean refreshed graph. Prevent overlapping clicks and stale async results. Apply workspace/cache/provider setting changes with a controlled engine/client lifecycle.

Acceptance: commit and saved dirty edits update the UI within a documented bound (target <=1 second after debounce on the small demo); branch checkout clears incompatible impact state; rapid clicks do not duplicate work; refresh updates an already-open graph. Verify actual displayed commit and endpoint values, not just a notification.

Evidence: `ui-no-changes.png`, `ui-no-changes.txt`; baseline `aa581d8` remained visible after HEAD `a212dc5`.

### 5.2 Complete details and preserve webview safety — P2

- Replace the three-endpoint summary limitation with browsable complete API details.
- Add table/column detail navigation.
- Fix template-string escaping of the whitespace regex so `service` does not render as `ervice`.
- Keep explicit loading, empty, and error states.
- Preserve CSP nonce and textContent-based rendering; restrict local resource roots appropriately and validate incoming message shapes.

Acceptance: all 18 demo endpoints are accessible, all 5 tables have inspectable columns, labels are intact, malicious label/impact strings render literally, and graph commands still work with CSP.

### 5.3 Repair AI provider lifecycle — P2

Persist “setup completed” independently from provider value `none`. Skipping must survive reload without reopening the wizard. Do not block basic context views indefinitely behind optional AI setup. Switching to none must clear the engine's injected client; cancellation must have explicit, consistent behavior.

Verify the actual Ollama model tag before documenting it as installable; do not assume `granite4.2-3b` exists from the current constant alone. Make endpoint/model configuration practical and handle missing model/server with a labeled fallback. Keep secrets in SecretStorage and out of logs/webviews. State clearly whether provider configuration also applies to MCP; avoid implying the extension's SecretStorage is automatically available to the separate MCP process.

Acceptance: skip/reload, active-provider→none, canceled setup, unavailable Ollama, mock response parsing, and configuration change tests. Live cloud/local inference is optional only when credentials/runtime are unavailable; record Not run, not PASS.

## Phase 6 — Release verification, documentation, and handoff

1. Run build and meaningful unit/integration tests on the final source.
2. Re-run the audit scenarios against newly compiled candidate output, not the old audit build.
3. Complete a real MCP golden path: cold context → commit/dirty change → fresh context → impact → refresh → repeated read → restart.
4. Build VSIX; install and verify activation, graph, details, and Analyze Changes in IBM Bob or a compatible VS Code host. Verify the installed bundle matches the candidate.
5. Retain screenshots and machine-readable MCP traces. Do not mark a Bob chat/migration-plan integration as tested unless Bob actually invoked the tools.
6. Add an explicit packaging allowlist or `.vscodeignore`; exclude development-only content where appropriate. Supply accurate package metadata. Do not invent a license; use the project's chosen license or flag the unresolved decision.
7. Address tracked build artifacts deliberately: inspect existing policy, stop tracking generated output if appropriate, and ensure a fresh clone can build without it. Never hand-edit generated bundles as the fix.
8. Correct README cache storage (JSON, not SQLite), API counts, environment loading instructions, supported stacks, AI behavior, and demo limitations. Keep `QA_CHECKLIST.md` evidence-based; do not weaken acceptance simply to mark items complete.
9. Record final commit, environment, commands/exit results, VSIX path/SHA-256, and installed bundle identity. If uncommitted implementation changes remain, record the diff/source fingerprint rather than identifying the candidate by HEAD alone.
10. Measure cold/warm median with at least 5 runs and independent cold caches. Measure dirty latency only after correctness passes. Do not claim improvement over a previous version without comparable baseline measurements.

The release gate is correct golden-path behavior and regression coverage, not merely successful compilation or packaging.

## Phase 7 — Separate enhancement: complete the five-language demo

The evaluation workspace contains 12 applications in JavaScript, Python, Go, Java, and PHP, plus 3 infrastructure containers. The current extension discovers 8 applications and no edges. Missing applications are Java non-Spring pricing/payment and PHP audit/shipping; discovered Node services currently expose zero extracted routes.

Implement source- and configuration-backed adapters for the actual frameworks/patterns in this workspace. Extend discovery beyond current manifests where appropriate. Extract service calls, PostgreSQL/Redis usage, and API routes from evidence, including Compose/environment references. Distinguish application services from infrastructure and unsupported projects from genuinely empty APIs.

Acceptance:

- Discover all 12 actual applications without hardcoded project-name special cases.
- Cover all five implementation languages and relevant routing patterns.
- Validate representative edges and storage links against inspected source/Compose configuration; do not invent a target edge count.
- Preserve update correctness after edits for every newly supported adapter.
- Report any remaining gap explicitly if this enhancement is deferred. Do not use that deferral to excuse regressions in the already-added Node/Python/Go features.

## Reproduction commands

Run from the repository after inspecting local instructions and installing dependencies:

```sh
npm ci
npm run build
npm test
npm run build:vsix

export BCG_REVIEW_OUT="$(mktemp -d /tmp/bcg-review.XXXXXX)"
node /Users/ahmadfariz/Projects/codex/context-graph-review-20260927/review.cjs
node /Users/ahmadfariz/Projects/codex/context-graph-review-20260927/mcp.cjs
node /Users/ahmadfariz/Projects/codex/context-graph-review-20260927/extra.cjs
```

Inspect `BCG_REVIEW_OUT/evidence/*results.json`; audit script exit 0 alone does not mean success. Use a fresh output directory for each run. If the public contract legitimately changes, adapt the harness with a written rationale while preserving the original behavior being tested. Avoid tests tied to obsolete ID formatting when uniqueness and resolvability are the actual requirement.

## Required final response from the coding agent

Provide:

- Concise verdict and concrete behavior now working.
- F01–F25 status table: Fixed / Partial / Deferred, evidence, and remaining limitations.
- Separate status for dirty edits, discovery fingerprint optimization, Node/Python/Go incremental updates, AI setup, and five-language enhancement.
- Test commands, totals, failures, and Not run cases; distinguish mocks from real integrations.
- Reproduction evidence for the formerly failing MCP and UI golden paths.
- Final VSIX location, checksum, candidate identity, and installation verification.
- Remaining risks and exact next steps. Do not claim “all fixed” while acceptance failures or unverified claims remain.

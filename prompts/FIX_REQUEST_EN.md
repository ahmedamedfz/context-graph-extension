# FIX REQUEST — Bob Context Graph: P0 corrections, state consistency, and optimization

Document ready to be handed to the agent responsible for fixing the extension. Final report language: English. Make reviewable changes, include regression tests, and do not declare completion just because the build succeeds.

## 1. Mandate for the receiving agent

Fix findings F01–F25 according to the priorities and acceptance criteria below, based on the source and audit evidence. Reproduce on the candidate checkout first, since the source may have changed since the audit. Use the same finding IDs in commits/PRs/reports to preserve traceability. The recommended solutions are design guidance, not an obligation to use a specific implementation; alternatives are acceptable if they satisfy the invariants and their tradeoffs are explained.

This document is only a **fix request**, not a report that fixes have already been applied. The author of this document did not modify the extension source. The receiving agent must work in a fix branch/worktree and respect the user's changes. Do not reset or overwrite the user's repository/demo to reproduce issues; use a clone/temp fixture. Do not publish a release, push to remote, or install credentials just because the task is to fix code.

## 2. Baseline and locations

- Extension repository: `/Users/ahmadfariz/Projects/github/context-graph-extension`.
- Audited commit: `b51ac1724e80e03c0d1af4157bdebae7a8fc79db`, version 0.1.0.
- [Original requirements](/Users/ahmadfariz/Projects/github/context-graph-extension/REQUIREMENTS.md).
- [Full audit report](/Users/ahmadfariz/Projects/codex/context-graph-audit-20260926/REPORT.md).
- Audit folder: `/Users/ahmadfariz/Projects/codex/context-graph-audit-20260926`.
- Original demo: `/Users/ahmadfariz/Projects/github/context-graph-extension/demo`.
- New Git lab: `/Users/ahmadfariz/Projects/codex/bcg-git-lab` (catalog, billing, checkout; separate Git per service).
- Polyglot capability probe: `/Users/ahmadfariz/Projects/codex/microservices-demo`.
- [Demo recording](/Users/ahmadfariz/Projects/codex/context-graph-audit-20260926/recordings/demo-ui-test.mp4) and [Git lab recording](/Users/ahmadfariz/Projects/codex/context-graph-audit-20260926/recordings/git-lab-test.mp4).
- [Rerun results](/Users/ahmadfariz/Projects/codex/context-graph-audit-20260926/evidence/latest-rerun.json): 43 checks, 14 PASS, 29 FAIL. Some tests overlap; the 29 FAILs are not 29 unique bugs. One FAIL is the polyglot probe, out of P0 scope.

Absolute paths in this document point to the audit machine; for an agent on a different machine, transfer the evidence directory or remap the root path. Line numbers refer to the audited commit, not a guaranteed location on the latest candidate.

### What already works and must be preserved

- Package build and VSIX installation in IBM Bob succeed.
- Original demo: 3 services, 18 endpoints (6 each), 5 tables, 3 databases, 5 total edges.
- Warm cache on an unchanged commit: 3 cached, 0 refreshed.
- Independent Git lab: one service changed → 2 cached, 1 refreshed on the engine.
- The graph opens, nodes are clickable, pan/zoom/reset work.
- Four MCP tools are callable; Bob can use the skill and pull context from the cache.
- The three lab services build successfully with Maven, with 3 health checks + 1 HTTP 200 integration call.

### Evidence boundaries and scope

- Live watsonx has **not been tested** because credentials are unavailable. Prompt/wiring was tested with a stub; don't equate this with real IAM/model validation.
- The webview sentinel proves dangerous HTML interpolation, **not** proof of host code execution.
- Polyglot 0/12 is the Spring/JPA support boundary that is explicitly stated in the requirements. Do not turn Node/FastAPI/Go/PHP/plain-Java support into a P0 bugfix requirement. The unsupported UX message still needs to be fixed.
- GitHub Release/public availability has not been verified; do not record it as a confirmed bug.
- The P1/P2 labels on the Fxx items are audit-finding priorities, distinct from the **P0/P1/P2** feature terms in REQUIREMENTS.md. The work waves below are used for sequencing.

## 3. Bug/gap list and priority

| ID | Audit priority | Issue | Main area |
|---|---|---|---|
| F01 | P1 | Discovery from the repository root fails | Discovery |
| F02 | P1 | Monorepo does not scope diffs per service | Git/incremental |
| F03 | P1 | Baseline impact lost after analysis or refresh | Baseline lifecycle |
| F04 | P1 | MCP context stale after a new commit | MCP freshness |
| F05 | P1 | Refreshing one service analyzes all services | Targeted refresh |
| F06 | P1 | MCP transport mixed with non-JSON logs | MCP transport |
| F07 | P1 | DTO contract does not trigger API impact | DTO/contracts |
| F08 | P1 | Dependency refresh deletes database information | Dependencies/config |
| F09 | P1 | Service identity and cache collide | Identity/cache |
| F10 | P1 | Cache without Git never invalidates | Non-Git cache |
| F11 | P1 | VSIX engine and MCP don't sync cache metadata | Multi-process cache |
| F12 | P1 | Golden path does not prove the promised payment HIGH | Impact semantics |
| F13 | P1 | Impact prompt does not include the actual value/type change | watsonx facts/wiring |
| F14 | P2 | Blast radius covers only direct dependencies | Graph traversal |
| F15 | P2 | API extraction loses common contracts | Spring parser |
| F16 | P2 | JPA extraction is wrong on adjacent annotations | JPA parser |
| F17 | P2 | Database graph loses tables owned by other services and highlights incorrectly | DB graph/impact IDs |
| F18 | P1 | The Analyze Changes button in the webview is not wired up | Webview command |
| F19 | P1 | UI does not auto-follow Git and the graph does not follow refresh | UI state synchronization |
| F20 | P2 | Offered extension settings are not applied | Configuration |
| F21 | P2 | Empty UI shows an endless loading state; limited detail | UX/detail rendering |
| F22 | P1 | Webview HTML does not safely escape dynamic data | Webview security |
| F23 | P2 | Ambiguous MCP lookup silently picks the first service | MCP resolution |
| F24 | P1 | Context/semantic model checklist is too optimistic | Context model |
| F25 | P2 | Test suite and documentation do not represent actual behavior | Tests/demo/docs |

### Implementation order

1. **Wave 0 — regression harness and shared contracts:** meaningful tests from F25, baseline reproduction, define the identity/snapshot/change/impact DTOs and compatibility policy (F09/F03/F24). No need to finish all model enrichment before quick fixes.
2. **Wave 1 — correctness and security:** F02–F06, F09–F11, F18, F22. F06/F18 can become small PRs early; don't let them be held up by a large redesign.
3. **Wave 2 — parser facts and impact:** F01, F07/F08, F12–F17, F23/F24. Implement structured facts before adding prompt/LLM reasoning.
4. **Wave 3 — integration and user experience:** F19–F21, finalize F25, build the candidate VSIX, retest Bob/MCP end-to-end.
5. **Wave 4 — measured optimization:** only after the correctness gate is stable; profile and compare metrics per §6. Polyglot is a separate proposal in §8.

## 4. Fix request detail per finding

Format for each item: audit/reproduction facts → recommended solution → acceptance. Named evidence with no prefix lives in the `evidence/` folder at the audit root, unless `logs/` or a video is explicitly named. The external audit script provides fixtures and full steps for the listed test IDs.

### F01 — Discovery from the repository root fails

**Priority:** P1. **Area:** Discovery.

**Audit facts / reproduction:** Open the extension root as instructed in the README: result is 0 services; open demo/: 3 services. The scanner only checks two levels deep, while demo/microservices/<service> is three levels. The Maven aggregator is also treated as a single service and stops the recursion.

Evidence: D01, D07; demo-baseline.json. Location: [WorkspaceScanner.ts:24](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/scanner/WorkspaceScanner.ts:24).

**Recommended solution:** Use controlled traversal with a configurable depth limit and an exclude list (Git metadata, node_modules, target, build, cache). Distinguish the Maven aggregator/library from a service. Read the modules for the aggregator; descend into the application modules. Don't stop just because a pom.xml was found. Avoid symlink loops and treat unreadable folders as a diagnostic.

**Acceptance criteria:** From the original repository root, find exactly 3 demo services. An aggregator with service modules finds the modules, instead of merging all controllers into one service. Build/cache directories don't become services; the result order is deterministic.

### F02 — Monorepo does not scope diffs per service

**Priority:** P1. **Area:** Git/incremental.

**Audit facts / reproduction:** A single Order.java commit produces refreshed=3, cached=0, and an ENTITY change is attached to inventory and payment as well. The UI produces 5 HIGH results from a single order change. In separate repos, cached=2/refreshed=1 works correctly.

Evidence: I04; monorepo-after-commit.json; 04-demo-false-impacts.png. Location: [ContextGraphEngine.ts:206](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/ContextGraphEngine.ts:206).

**Recommended solution:** Group discovery by repository. Read HEAD and diff once per repository; map the diff's old/new paths to the repository-relative serviceRoot. Account for cross-service renames and shared modules/config that have a genuine impact. Services with no artifact changes reuse the existing payload; update the observed repository commit without re-parsing. Separate the observed commit from the last artifact version that actually changed.

**Acceptance criteria:** A single order-entity commit on the monorepo: only order is re-parsed; the 2 other services use the cache, but all report the current repository HEAD with clear provenance. No order change is attributed to inventory/payment. Rename/delete and shared-module changes each have their own tests.

### F03 — Baseline impact lost after analysis or refresh

**Priority:** P1. **Area:** Baseline lifecycle.

**Audit facts / reproduction:** engine.analyze stores the latest commit; detectAndAnalyzeChanges then compares it to the same HEAD and returns null. MCP refresh_context also drops the previous impact. The previousCommit metadata exists but isn't used for that detection.

Evidence: I05, M08; git-lab-after-refresh-ax.txt. Location: [ContextGraphEngine.ts:271](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/ContextGraphEngine.ts:271).

**Recommended solution:** Separate the latest indexed snapshot from the comparison baseline and the immutable ChangeSet/ImpactReport. Store the from/to commit pair and the analysis revision. A refresh may update the snapshot, but must not automatically delete the report or advance a baseline that hasn't been consumed yet. Define the baseline policy explicitly, including first-run, repeated refreshes, restart, branch checkout, and two consecutive commits. Don't just swap the comparison target to previousCommit without defining the lifecycle.

**Acceptance criteria:** Analyze→commit→refresh→analyze_change still returns the correct commit-pair change. A refresh with no changes doesn't corrupt the baseline; restart and repeated queries are consistent. First-run is marked as no baseline, not a misleading claim of no changes.

### F04 — MCP context stale after a new commit

**Priority:** P1. **Area:** MCP freshness.

**Audit facts / reproduction:** get_system_context and get_service_context use cachedResult without checking HEAD again. The commit in the query result stays old until a forced refresh/restart.

Evidence: M05; mcp-transcript.json. Location: [index.ts:51](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/mcp-server/src/index.ts:51).

**Recommended solution:** Before returning cachedResult, check a cheap per-repo workspace/Git fingerprint. Invalidate only the context that changed. Separate the freshness check from the full parse, and use single-flight for concurrent requests. The GET context endpoint should still follow the F03 baseline policy so that reading the latest context doesn't wipe out the impact.

**Acceptance criteria:** Within a single MCP process: query the baseline, make a commit, query again without restart/force refresh. The commit and relevant data are up to date. A subsequent query with no changes doesn't call the parser or watsonx again.

### F05 — Refreshing one service analyzes all services

**Priority:** P1. **Area:** Targeted refresh.

**Audit facts / reproduction:** refresh_context(order-service) invalidates one cache entry but then runs getOrAnalyze(true) for all of them; actual result is refreshed=3/cached=0.

Evidence: M07. Location: [index.ts:375](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/mcp-server/src/index.ts:375).

**Recommended solution:** Provide a refreshService(serviceId) operation that discovers the latest target metadata, updates only the target, then rebuilds the graph from the combined context. Don't pass force=true to a full-workspace analysis. Explicitly define invalidation of derived relations/shared artifacts, without re-parsing unaffected services.

**Acceptance criteria:** refresh_context(exact service) gives refreshed=1 and cached=2 on an independent fixture; a parser spy proves the other two services weren't parsed. refresh_context() with no service still updates everything. Baseline impact remains available.

### F06 — MCP transport mixed with non-JSON logs

**Priority:** P1. **Area:** MCP transport.

**Audit facts / reproduction:** Full/incremental analysis uses console.log on the MCP stdio stdout. The official SDK throws a SyntaxError for [BCG] lines. The SDK still accepted the next response in testing; don't interpret this as a total failure for all clients.

Evidence: M11; mcp-transcript.json protocolErrors. Location: [ContextGraphEngine.ts:134](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/ContextGraphEngine.ts:134).

**Recommended solution:** Inject a logger into core/runtime and route MCP diagnostics to stderr. Reserve stdout exclusively for the JSON-RPC transport, including at startup, on errors, during full/incremental analysis, and for the watsonx fallback. Avoid a global console monkey-patch as the primary fix.

**Acceptance criteria:** An SDK client runs all four tools on cold cache, warm cache, a new commit, and the error path with no onerror JSON parse failures. Every stdout line emitted by the server is valid per the MCP transport framing.

### F07 — DTO contract does not trigger API impact

**Priority:** P1. **Area:** DTO/contracts.

**Audit facts / reproduction:** Changing Integer customerId → UUID on the DTO is classified as DTO, but affectsApi only covers the API category. The checkout-lab DTO produces affectsApi=false and empty impacts.

Evidence: I07; git-lab-dto-change.json. Location: [ContextGraphEngine.ts:214](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/ContextGraphEngine.ts:214).

**Recommended solution:** Build a DTO/model→consuming-endpoint index, including nested types and schema fields. Changes to an exposed DTO trigger endpoint schema recomputation and a semantic contract diff. An unexposed internal DTO shouldn't automatically mark all endpoints as breaking. DTO rename/delete must also invalidate its references.

**Acceptance criteria:** Integer→UUID on a request DTO used by an endpoint produces affectsApi=true, the related endpoint, and the before/after field change. An internal DTO doesn't cause a global false positive. Additive/removal/type-change fields are distinguished.

### F08 — Dependency refresh deletes database information

**Priority:** P1. **Area:** Dependencies/config.

**Audit facts / reproduction:** The incremental SERVICE/CONFIG branch only runs analyzeDependencies, without detectDatabaseUsage or preserving DATABASE entries. Renaming orders_db → orders_v2 drops the DATABASE dependency; the graph can then infer the wrong DB name. application.yaml is also classified as UNKNOWN.

Evidence: I06, I10; monorepo-config-change.json; git-lab-config-change.json. Location: [ContextGraphEngine.ts:244](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/ContextGraphEngine.ts:244).

**Recommended solution:** Unify the dependency-extraction pipeline for full and incremental runs: merge REST, DATABASE and other types by identity, instead of overwriting the whole array with REST-only results. Parse .properties, .yml, .yaml consistently. Add detection for datasource changes and config removal; don't silently replace an explicit DB with an old inferred DB.

**Acceptance criteria:** Renaming orders_db→orders_v2 via config updates the dependency and the DB node/edge while still keeping REST. A SERVICE-only edit doesn't delete the DB. application.yaml is classified as CONFIG and gives results equivalent to application.yml.

### F09 — Service identity and cache collide

**Priority:** P1. **Area:** Identity/cache.

**Audit facts / reproduction:** serviceId is just the basename. Two folders, team-a/order-service and team-b/order-service, produce the same ID; the second service's cache even returns the rootPath belonging to the first service. The cache key doesn't include the repository even though the requirements recommend it.

Evidence: D06; duplicate-services.json. Location: [WorkspaceScanner.ts:141](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/scanner/WorkspaceScanner.ts:141).

**Recommended solution:** Separate displayName/alias from the canonical serviceId. Use repository namespace + service-relative path; for non-Git, use a documented workspace/path namespace. Store a schemaVersion in the cache and perform safe migration/invalidation. Dependency resolution uses the canonical ID or a unique alias; ID changes must not break an otherwise-correct graph/MCP.

**Acceptance criteria:** Two order-services in different locations have different IDs and caches, and the rootPath is never swapped. An ambiguous short name requires a specific ID. Old cache entries aren't read as the new service; branch-name and two-checkout cases are tested.

### F10 — Cache without Git never invalidates

**Priority:** P1. **Area:** Non-Git cache.

**Audit facts / reproduction:** An unknown commitHash is treated as valid cache. Changing an entity in a service with no Git, then re-analyzing, still returns cached=3 with the old schema — contrary to the README, which states it should always be re-analyzed.

Evidence: C02. Location: [ContextGraphEngine.ts:100](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/ContextGraphEngine.ts:100).

**Recommended solution:** Don't use the literal "unknown" as proof of freshness. Choose re-analysis on every request for non-Git as the minimum implementation per the README, or a controlled content fingerprint with clearly labeled sourceState metadata. Apply a similar policy for an unborn HEAD/unavailable Git; don't silently report Cached.

**Acceptance criteria:** Change a file in a service with no .git; the next query shows the latest schema. Status/provenance explains the non-Git state. Git breakage doesn't cause an old payload to be treated as valid.

### F11 — VSIX engine and MCP don't sync cache metadata

**Priority:** P1. **Area:** Multi-process cache.

**Audit facts / reproduction:** ContextCache only reads the index in the constructor. Two instances on the same cache folder: the second instance still sees a null last commit even after the first instance has saved context. The context file can be read as up to date, but the index metadata stays stale.

Evidence: C03. Location: [ContextCache.ts:29](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/cache/ContextCache.ts:29).

**Recommended solution:** Choose a single owner of shared state, or implement a proper multi-process cache. If it stays JSON-based: lock read-modify-write of metadata, reload the index under the lock, write a temp file then atomic-rename, and validate generation/version. Atomic rename alone doesn't prevent lost updates. An alternative transactional store must come with migration and rationale, not be an obligation to switch storage.

**Acceptance criteria:** Two engine processes on the same cache see the latest commit and can write different services without losing metadata. Add concurrent-write, stale-reader, interruption-recovery and corrupt-cache tests. I/O errors become visible diagnostics.

### F12 — Golden path does not prove the promised payment HIGH

**Priority:** P1. **Area:** Impact semantics.

**Audit facts / reproduction:** For an order.customerId change, the deterministic impact only covers the order-service Database. Payment is an outbound dependency of order, not a caller of order, so the reverse-dependency search doesn't find it. On the monorepo, payment can become HIGH because the diff was wrongly attached to payment, not because of valid field reasoning.

Evidence: I02; golden-impact.json. Location: [WatsonxRuntime.ts:190](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/watsonx/src/WatsonxRuntime.ts:190).

**Recommended solution:** Model data/contract relations in addition to call direction. order→payment doesn't prove payment depends on order's DB field. Trace a provable request/response field mapping; if the fixture provides no evidence, state unknown/potential and correct the scenario/demo. Don't hardcode payment HIGH or reverse all edges just to make old tests pass.

**Acceptance criteria:** Every impact includes the relation path and the relevant contract facts. A fixture with a genuine customerId contract change flags the correct consumer. An internal DB-only change doesn't automatically become HIGH across all services. The old I02 expectation is reviewed based on semantics, not forced to pass.

### F13 — Impact prompt does not include the actual value/type change

**Priority:** P1. **Area:** watsonx facts/wiring.

**Audit facts / reproduction:** The Git diff used is name-status only. The watsonx prompt receives the category, file count, table name, and endpoint — not customer_id INTEGER→UUID, the diff content, or the before/after schema. oldValue/newValue are not populated. API descriptions are also never called: summary spy=3, describeApi=0.

Evidence: I03, W01, W02; watsonx-captured-prompts.json. Location: [WatsonxRuntime.ts:45](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/watsonx/src/WatsonxRuntime.ts:45).

**Recommended solution:** Compute a structured before/after diff from the matching commit snapshots and send scoped facts to watsonx: field/path, old/new type, endpoint/model, dependency evidence. Limit context to relevant components. Wire describeApi to changed API artifacts and cache the output by artifact hash + model/prompt version. Validate the output schema; expose reasoningMode=deterministic/watsonx and error/fallback provenance. Don't fabricate facts when data is missing.

**Acceptance criteria:** The captured prompt includes customer_id INTEGER→UUID from the actual change, not the whole repository or unrelated services. The API semantic description isn't empty when the runtime is available, and isn't regenerated on a warm cache. Malformed/error output falls back to a labeled fallback. Live watsonx is only claimed to pass if it was actually run with real credentials.

### F14 — Blast radius covers only direct dependencies

**Priority:** P2. **Area:** Graph traversal.

**Audit facts / reproduction:** Fixture A→B→C: a change to C flags B but not A. All other services are sent as relatedServices, rather than being the result of a relevance-bounded graph traversal.

Evidence: I09. Location: [WatsonxRuntime.ts:191](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/watsonx/src/WatsonxRuntime.ts:191).

**Recommended solution:** Traverse reverse dependencies with BFS/DFS, a visited set, cycle protection and an explicit limit. Separate direct impact from transitive candidates. Propagate severity only with evidence; a transitive dependency alone doesn't prove a breaking change. Use the traversal result to scope the prompt and store the evidence path.

**Acceptance criteria:** A→B→C: a change to C lists B as direct and A as transitive/potential, per the evidence. Cycles don't cause a loop. Nodes outside the subgraph aren't labeled affected; the traversal limit is reported when truncated.

### F15 — API extraction loses common contracts

**Priority:** P2. **Area:** Spring parser.

**Audit facts / reproduction:** ResponseEntity<List<OrderResponse>> becomes List<OrderResponse with no closing bracket. @RequestMapping(path="/v1") loses the prefix. @RequestBody present on a following line isn't read. Multiline requests also occur in the demo's InventoryController.

Evidence: P02–P04; parser-api.json. Location: [SpringApiParser.ts:51](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/parser/SpringApiParser.ts:51).

**Recommended solution:** Replace the single-line search with a Java declaration tokenizer/parser that understands annotations, multiline statements and balanced generics, or a structured parser scoped to Spring's needs. Correctly handle the value/path alias, class vs method mapping, array mappings and annotation comments. Avoid adding regexes that merely patch a fixture.

**Acceptance criteria:** ResponseEntity<List<OrderResponse>> is represented without truncation; the /v1 prefix from path= is present; a multiline RequestBody is recognized. Formatting-variant fixtures produce the same semantic model. Unsupported input produces a clear diagnostic/unknown, not a fake contract.

### F16 — JPA extraction is wrong on adjacent annotations

**Priority:** P2. **Area:** JPA parser.

**Audit facts / reproduction:** A three-line window causes the field after @Id to be included in the primary key, and @Column attaches to the next field, producing duplicate column names. @Transient is still extracted correctly. The original demo, with particular spacing, passes the uniqueness check, so additional fixtures are needed.

Evidence: P05, P06; parser-jpa.json. Location: [JpaEntityParser.ts:75](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/parser/JpaEntityParser.ts:75).

**Recommended solution:** Bind annotations to the exact field/getter declaration, not a three-line window. Respect @Transient, static/transient fields, and the JPA access strategies that are stated as supported. Distinguish relationships from scalar columns; store provenance and nullable/PK correctly.

**Acceptance criteria:** An adjacent-annotation fixture has only the id PK, no duplicate column from bleed, and @Transient is excluded. Add whitespace variations, single-line annotations, relationships, and property-access if promised. The 5-table demo doesn't regress.

### F17 — Database graph loses tables owned by other services and highlights incorrectly

**Priority:** P2. **Area:** DB graph/impact IDs.

**Audit facts / reproduction:** Two services share a database: the node only contains tables from the first service. An impact named "order-service Database" matches the order-service node, but not db:orders_db, so the DB isn't marked HIGH.

Evidence: G01, G02; golden-highlight.json. Location: [ContextGraphBuilder.ts:33](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/graph/ContextGraphBuilder.ts:33).

**Recommended solution:** Represent the DB with an identity that distinguishes genuinely different datasources/schemas; don't merge just because the short names match. For a genuinely shared DB, merge tables with provenance and ownerServiceIds. Use componentId/nodeId in ImpactEntry, not a label substring; aggregate severity deterministically for multiple impacts on the same node.

**Acceptance criteria:** An explicit shared-DB fixture shows all tables and owners; differently-named DBs aren't wrongly merged. A DATABASE impact highlights the correct DB node, not a similarly-named service. The result doesn't depend on service/impact order.

### F18 — The Analyze Changes button in the webview is not wired up

**Priority:** P1. **Area:** Webview command.

**Audit facts / reproduction:** The webview sends an analyzeChanges message; the extension handler only handles nodeSelected. Clicking the graph button does nothing; the sidebar command produces a notification/result.

Evidence: 02-webview-analyze-noop.png; demo-ui-test.mp4. Location: [GraphWebviewProvider.ts:46](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/vscode-extension/src/webview/GraphWebviewProvider.ts:46).

**Recommended solution:** Add a webview message dispatcher with clear typing/validation; delegate analyzeChanges to the same command/controller used by the sidebar. Show progress/error and prevent double-submit; dispose the listener along with the panel.

**Acceptance criteria:** Clicking the webview button and the sidebar run exactly the same flow exactly once. Result/no-changes/error appear without a manual refresh. Unrecognized messages are safely ignored.

### F19 — UI does not auto-follow Git and the graph does not follow refresh

**Priority:** P1. **Area:** UI state synchronization.

**Audit facts / reproduction:** There is no Git watcher/poll. A new commit still shows the old state until refresh. runAnalysis only updates two tree providers; the graph and old impact aren't reset. After refresh+analyze: the sidebar shows "No impact data," the graph stays red with the old report.

Evidence: 07-git-lab-stale-graph.png; git-lab-after-refresh-ax.txt. Location: [extension.ts:127](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/vscode-extension/src/extension.ts:127).

**Recommended solution:** Use a shared state observer for the sidebar, graph and impact, all sharing the same revision. Watch for HEAD/ref changes via a Git integration or a watcher that supports branch refs, packed refs and worktrees; debounce and revalidate. All async results use a generation/cancellation scheme so old results can't overwrite newer ones. Show historical reports only when clearly labeled with the commit pair.

**Acceptance criteria:** A new commit is detected within the documented time target; the commit label, sidebar, graph and impact stay consistent. A refresh doesn't leave a stale highlight labeled as the latest result. Successive commits, branch checkout, and two concurrent refresh requests don't cause a race.

### F20 — Offered extension settings are not applied

**Priority:** P2. **Area:** Configuration.

**Audit facts / reproduction:** bcg.cacheDir in the manifest is ignored because activate always uses <workspaceRoot>/.context-graph-cache; it's proven the cache folder is created in the demo source even though the audit workspace supplied an override. bcg.mcpServerPath is also not read. The VSIX only reads the API key/project ID, not a custom base URL/model the way MCP does.

Evidence: Original workspace config and evidence/original-demo-ui-cache; source review. Location: [extension.ts:25](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/vscode-extension/src/extension.ts:25).

**Recommended solution:** Unify the VSIX/MCP configuration resolver with explicit priority: workspace setting/env/default. Respect bcg.cacheDir, modelId and baseUrl. Define the bcg.mcpServerPath function; implement it if it's part of the product contract, or deprecate/remove it with documentation. Safely reinitialize the engine when settings change, without leaking secrets to logs.

**Acceptance criteria:** A custom cacheDir receives all cache data and the workspace folder gets no unwanted cache. A spy client receives the custom model/baseUrl. Setting changes take effect without an undocumented restart requirement; unused settings are no longer advertised as active.

### F21 — Empty UI shows an endless loading state; limited detail

**Priority:** P2. **Area:** UX/detail rendering.

**Audit facts / reproduction:** microservices-demo finishes analyzing with 0 services but the sidebar keeps showing "Analyzing workspace." The graph detail is only counts/identity; it doesn't show the endpoint/table list promised in the README. The API tree only shows the first three and isn't expandable. The service label becomes "er vice/ervice" due to a regex-escaping bug in a template; HEAD shows the generatedAt time instead.

Evidence: 08-microshop-zero-services.png; 01-demo-graph.png; UI inspection. Location: [SystemOverviewProvider.ts:34](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/vscode-extension/src/providers/SystemOverviewProvider.ts:34).

**Recommended solution:** Use explicit idle/analyzing/ready-empty/ready/error states. Show unsupported/no-services along with the parser's coverage. Provide a fully expandable list of endpoints/tables and a clearly labeled dependency count. Avoid inline JS templating for label rendering where possible; separate the actual HEAD from the generated timestamp. Avoid an absolute SAFE label when the analysis hasn't covered all contracts.

**Acceptance criteria:** A polyglot project settles into ready-empty, not endless loading. The demo's 18 endpoints can be inspected, not just three per service. Service labels are intact, HEAD shows a hash or a correctly labeled time, and database detail is browsable.

### F22 — Webview HTML does not safely escape dynamic data

**Priority:** P1. **Area:** Webview security.

**Audit facts / reproduction:** getGraphHtml inserts raw JSON into a script and dynamic data into innerHTML; a `</script><script>` sentinel gets through unescaped, and there's no CSP. The reproduction only inspects the generated HTML, without executing the payload or proving host access.

Evidence: G03. Location: [graphHtml.ts:4](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/vscode-extension/src/webview/graphHtml.ts:4).

**Recommended solution:** Avoid interpolating repository/LLM data into executable script or innerHTML. Send data via postMessage and render via textContent/DOM properties; if embedded JSON is required, properly escape HTML delimiters. Apply a CSP with a nonce, remove inline event handlers, restrict localResourceRoots, and validate messages. There's no need to execute the payload on a user's machine to prove the regression fix.

**Acceptance criteria:** The `</script>` sentinel, quotes, and HTML from label/summary/impact render as literal text in an isolated test. CSP is in place, the graph/actions still work, and no extra script executes from data. Don't claim host compromise from an audit finding that only proves unsafe HTML.

### F23 — Ambiguous MCP lookup silently picks the first service

**Priority:** P2. **Area:** MCP resolution.

**Audit facts / reproduction:** get_service_context("service") returns inventory-service without rejecting the ambiguity. An exact ID succeeds and a nonexistent ID is correctly rejected.

Evidence: M09, M10. Location: [index.ts:198](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/mcp-server/src/index.ts:198).

**Recommended solution:** Use a consistent resolver across all MCP tools: exact canonical ID; alias/name only if unique; otherwise InvalidParams with a safe list of candidate IDs. Validate the input type, don't coerce an arbitrary object to a string and pick the first substring match.

**Acceptance criteria:** get_service_context("service") is rejected as ambiguous. Exact ID, unique alias, unknown, and wrong input type are tested for get/analyze/refresh. The refresh target and the context target always match.

### F24 — Context/semantic model checklist is too optimistic

**Priority:** P1. **Area:** Context model.

**Audit facts / reproduction:** ApiEndpoint only stores the request/response model name; there's no requestSchemas/responseSchemas, API→entity mapping, or API→dependency mapping. Dependencies aren't yet split into upstream/downstream. semanticDescription has property/method info but it isn't connected; semanticSummary isn't generated at all when the runtime isn't injected.

Evidence: models/types.ts; W02; mcp-transcript.json. Location: [types.ts:14](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/src/models/types.ts:14).

**Recommended solution:** Evolve ServiceContext with a schemaVersion, structured model schemas, upstream/downstream references, API↔model/entity/dependency associations, and provenance/confidence. Populate only relations that can be proven. Provide a deterministic summary with a label distinct from watsonx. Sync the core types, MCP serializer, graph and docs; empty events can still be acceptable for P0.

**Acceptance criteria:** An endpoint using a DTO has a valid schema/reference and a proven association. Consumers can distinguish unknown from empty. A labeled fallback summary is available; old cache versions are migrated/invalidated safely. No fabricated events or model fields just to fill out the checklist.

### F25 — Test suite and documentation do not represent actual behavior

**Priority:** P2. **Area:** Tests/demo/docs.

**Audit facts / reproduction:** npm test just echoes "ok." The README lists API counts of 5+4+3, while the actual source is 6+6+6. The diagram mentions SQLite even though the cache is JSON. .gitignore contains an invalid Windows glob. The README's .env instructions come with no dotenv/loader. The bundled demo has no SpringBootApplication entry point, and the order service is just an interface, so it isn't sufficient as a runnable application.

Evidence: logs/npm-test.log; source review; 18 APIs verified. Location: [package.json:10](/Users/ahmadfariz/Projects/github/context-graph-extension/packages/core/package.json:10).

**Recommended solution:** Replace "echo ok" with meaningful unit/integration/UI acceptance tests and a nonzero exit on failed assertions. Correct the API counts, cache format, gitignore, and env instructions. For a runnable demo, add the necessary entry point/implementation within the demo's scope and test the startup; if it remains a parsing fixture, label it honestly and don't check off "working runnable demo." Sync the requirements with the evidence, rather than lowering the requirement to close out the bug.

**Acceptance criteria:** npm test genuinely tests core regressions and fails when a bug is reintroduced. Fresh-clone setup/build/package/install is documented and tested; no credentials in Git. A demo labeled runnable starts and passes its health check. The README matches the latest results, and test/build artifacts don't pollute Git.

## 5. Cross-area design contract

Agree on this contract before multiple agents edit shared types. The field names below are proposed semantics, not an already-available API.

| Concept | Required invariant |
|---|---|
| Service identity | Unique per repository namespace + service path; the display name is not the sole cache key |
| Source snapshot | Has repository/branch/observed commit, content provenance, schema/parser version; data isn't claimed to come from a commit if it actually came from a dirty working tree |
| Working tree | Choose committed-only or a labeled dirty overlay; don't store uncommitted source as a "clean HEAD" snapshot |
| Baseline vs indexed | The latest indexed context and the comparison baseline are distinct states; read/refresh must not silently discard change history |
| ChangeSet | from/to identity, changed paths scoped per service, structured artifact before/after, evidence and affected IDs |
| ImpactEntry | canonical component ID/type, reason/evidence path, confidence/known-unknown, evidence-backed severity, reasoning source |
| Context response | Clear revision/freshness and source-state; a consistent snapshot for services+graph+impact |
| Cache | Versioned, isolated, consistent across runs/processes; a failed write is not disguised as a successful cache |
| Unknown vs none | Not found by the parser ≠ proven not to exist; unknown must be distinguished from empty/SAFE |
| Async lifecycle | Old analysis results don't overwrite a newer revision; cancellation/disposal and error states are managed |

For monorepos, a new HEAD may be propagated to every service's identity without counting unchanged services as parsed/refreshed. Store the origin of reused payloads so cache reuse isn't misleading. Tests should check parser calls, not just status counters.

For migration reasoning, don't use the working-tree source as the before/after commit without verification. Read the matching snapshot, including deletes/renames. Don't send full source, secret configuration, or credentials in the watsonx prompt.

## 6. Optimization recommendations and how to measure them

The following targets are **proposed acceptance criteria**, not performance numbers already measured in the audit. Record the environment and baseline before claiming something is faster.

| Optimization | Recommendation | Acceptance evidence |
|---|---|---|
| Git operations | One discovery/HEAD/diff per repo per analysis cycle; reuse results for services in the same repo | Git invocation counter + monorepo fixture; service-scoped correctness still passes |
| Parsing | Cache per file/artifact hash; index model/config references for targeted invalidation | Warm run: 0 parser calls; a single entity change only invalidates the relevant artifacts |
| Targeted refresh | Isolate the target; no full-workspace parse to rebuild the graph | 1 refreshed/2 cached + parser spy on an independent fixture |
| Cache I/O | Avoid re-serializing the same large payload; atomic/transactional consistency matters more than reducing I/O | Two writer processes don't lose state; bytes/read/write and latency are reported |
| Watsonx | Scope to relevant facts only; cache by artifact+model+prompt version; bounded concurrency; explicit timeout/fallback | Warm run: 0 generation calls; prompt size/call count reported; no stale response after a model/prompt change |
| UI updates | Debounce per repository, publish one immutable revision, avoid re-rendering all nodes when data is unchanged | One event batch for a commit burst; stale-result race tests and a responsive UI |
| Repeated requests | Deduplicate in-flight analysis per repo/version; don't merge different input versions | Two parallel queries don't trigger duplicate work and don't return a mixed snapshot |
| Discovery | Exclude dependency/build/cache dirs, bounded traversal, diagnostics for limits/permission errors | Nested fixtures + large/generated folders are still found at a measurable cost with no silent omission |
| Observability | Report cache hit/miss reason, files parsed, Git calls, LLM calls, duration and analysis revision | Reuse can be proven without reading free-form logs on MCP stdout |

Report cold runs and warm runs separately. For p50/p95, use an adequate sample size and state n; don't compute p95 from one or two runs. Token savings should stay labeled as an estimate with the method explained, not presented as an empirical savings figure without measurement.

## 7. Test plan and definition of done

### Important: don't test the old binary and then claim the candidate is fixed

The [rerun-audit.py](/Users/ahmadfariz/Projects/codex/context-graph-audit-20260926/rerun-audit.py) runner points at the original audit's `build/` snapshot. The audit script also embeds absolute source paths and some result assumptions. **Running that runner as-is only reproduces the 0.1.0 baseline.**

The agent must move the relevant tests to the candidate test suite, or set up a copy of the runner with sourceRoot/buildRoot parameters pointing at the candidate. Don't overwrite historical build/evidence. Record the candidate commit, source diff if dirty, the MCP/VSIX executable path, dependency versions, and the artifact checksum. Make sure Bob uses the same candidate VSIX and candidate MCP.

The old harness logs FAIL but can exit 0 if the script completes. The candidate's CI gate must fail on a failed assertion; don't use the old harness's exit status as proof that all tests passed.

### Old test expectations that must be legitimately corrected

- **S01 polyglot:** change it to an expected unsupported/coverage probe for P0 scope, rather than forcing discovery of 12 services.
- **I02 payment HIGH:** evaluate data-flow/contract evidence. Don't hardcode colors or add fake edges just to satisfy the old demo's expectation.
- **I09 transitive:** distinguish proven affected nodes from transitive candidates; not all transitive nodes need to be severity HIGH.
- **M10 ambiguity:** in the old harness the assertion was written as a baseline-observation failure. Change it to expect InvalidParams/candidates on the candidate, rather than copying the old hardcoded-false assertion.
- The API-description wiring test shouldn't force exactly one LLM call per endpoint; batching/dedup is valid if the semantic output is correct and the relevant APIs are covered.
- If public APIs/types change, port the harness to the new contract while preserving the tested behavior. Record the reason for each expectation change; don't lower an assertion just to make it pass.

### Minimum regression matrix

| Area | Required scenarios |
|---|---|
| Discovery | Demo repo root, nested Spring service, Maven aggregator, duplicate names, unsupported workspace |
| Cache | Cold/warm, non-Git, two checkouts, branch switch, corrupted entry, concurrent reader/writer |
| Git | Monorepo vs multi-repo, one-service commit, rename/delete, shared module, dirty/untracked policy, baseline after refresh/restart |
| Parser | Multiline annotation/signature, nested generic, value/path, field annotation scope, @Transient, DTO↔endpoint references |
| Impact | DB/API/DTO before-after; direct/transitive relations; unrelated services; shared DB; unknown evidence; deterministic/watsonx fallback |
| MCP | Four tools, cold/warm/change, stdout framing, input type, unknown/ambiguous ID, targeted refresh, simultaneous calls |
| VSIX | Sidebar + graph same revision, graph Analyze Changes, commit notification, refresh reset/history semantics, detail completeness, empty/error state |
| Security | Untrusted label/summary/impact text, script delimiters, CSP, validated webview messages, no credentials in logs |
| Packaging | Fresh install of the candidate VSIX, MCP dependencies available, config override, package version/checksum matching the source |

Key acceptance scenarios:

1. Fresh workspace, original demo → 3 services/18 endpoints/5 tables/3 databases; dependencies correct.
2. Re-query with no changes → measurable reuse without re-parsing/re-running the LLM.
3. Clone/temp monorepo, baseline analysis, one entity commit → only the relevant service is re-parsed; Git identity and impact are accurate.
4. Clone/temp each Git lab at baseline tags, re-commit schema/API/config/DTO changes separately. Preserve the user's repository and historical tags.
5. Run GET context, refresh, and analyze_change in different orders and after a restart → the baseline lifecycle follows the contract and doesn't discard change evidence.
6. Test a Bob architecture question and an impact/migration question → verify the correct tool is actually invoked, not just an answer from memory/the model alone.
7. On a polyglot workspace → honestly show unsupported, with no endless spinner.
8. Build/package/install the candidate, re-record the UI, and save a machine-readable trace for all key claims.

### Definition of done

- [ ] Every F01–F25 has a Fixed / Partially fixed / Deferred status with a rationale and a link to the commit/test.
- [ ] Blocker findings within the agreed scope are done; deferred items are not silently marked as passed.
- [ ] The meaningful test suite and CI gate no longer echo "ok"; candidate artifact provenance is recorded.
- [ ] Cache/identity migration is tested; existing users get safe, documented behavior.
- [ ] No false impact from cross-service diffs or substring node matching.
- [ ] Parser facts are distinguished from LLM inference/reasoning; unknown is not disguised as SAFE.
- [ ] Sidebar, graph, MCP and reports reference a consistent revision/snapshot.
- [ ] Configuration, docs, skill and the requirements checklist match the final behavior.
- [ ] Recordings/video, screenshots, test summary, JSON trace and remaining limitations are attached.
- [ ] Live watsonx is marked Not run if credentials are unavailable; the stub is not recorded as a live PASS.
- [ ] No credentials, caches, temporary build results, or user changes are unintentionally overwritten/committed.

## 8. Separate scope enhancement: microservices-demo polyglot

Not automatically included in the P0 bugfix acceptance. If the user requests expanded support, create a separate milestone with a coverage matrix, fixtures, and per-stack acceptance:

1. Define a plugin/provider analysis contract so the Spring scanner/parser stays reusable.
2. Add discovery manifests for Node, Python, Go, PHP and non-Spring Java; don't label every folder as a service without evidence.
3. Implement API extractors matching the frameworks actually in use, SQL schema where relevant, and static dependencies with evidence.
4. Distinguish application services, infrastructure, libraries and unsupported files. Don't infer Redis runtime/live topology from the file name alone.
5. Measure correctly detected applications/endpoints/dependencies across the 12 services; show partial coverage and unknowns explicitly.
6. Compose/OpenAPI can be an additional source if the scope expands, but doesn't replace verification against the source, and isn't part of the old P0 feature set.

Don't turn 0/12 into 12/12 just by creating empty nodes. The target capability should cover useful, verifiable facts, not a node count.

## 9. Responsibility split for the receiving agent(s)

The split below is a work recommendation, not a statement that the agents have already been run by the author of this document.

| Owner | Scope | Dependencies / shared-file boundaries |
|---|---|---|
| Integrator | Shared type contracts, cache schema migration, candidate provenance, final integration | Establish ownership of `models/types.ts` and public core APIs before parallel work begins |
| Git/cache agent | F01–F05, F09–F11 | Coordinate F03/F09 with the integrator; the service identity contract is used across all areas |
| Parser/context agent | F07/F08, F15/F16/F24 | The DTO/schema model and dependency artifacts must be available to the impact agent |
| Impact/watsonx agent | F12–F14/F17 | Consumes canonical IDs and structured before/after; doesn't change relation direction without evidence |
| MCP/UI agent | F06/F18–F23 | Uses the agreed core API; resolver/config/revision shared with the integrator |
| Validation/docs agent | F25 + retest of every area | Keeps an independent fixture oracle; doesn't change expected results just to make an implementation pass |

If working in parallel, use separate worktrees, small PRs and interface contracts; avoid multiple agents editing the same types/cache-lifecycle files without an owner. The number of agents depends on capacity; the work can also be done sequentially by a single agent.

## 10. Final report format for the fixing agent

Include the following table along with a summary of results:

| Finding | Status | Root cause | Change/commit | Tests & results | UI/MCP evidence | Risk/limitations |
|---|---|---|---|---|---|---|
| Fxx | Fixed/Partial/Deferred | ... | ... | ... | ... | ... |

Add the candidate commit/VSIX checksum, the test commands used, cold/warm benchmark results, cache migration notes, the Bob setup used, and a list of unresolved findings. Tie any optimization claims to actual measurements. Don't close out the work with an "everything's done" statement if live watsonx, other platforms, or other scope items haven't been tested; state the limitations specifically.

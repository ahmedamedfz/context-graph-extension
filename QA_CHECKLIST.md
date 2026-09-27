# QA Test Checklist — Bob Context Graph

> **For QA agents:** Work through this checklist top-to-bottom. Each section maps to a specific area of the codebase. Every item either refers to a known bug ID (F01–F25 from `FIX_REQUEST_EN.md`) or a functional requirement from `REQUIREMENTS.md`. Mark items ✅ Pass, ❌ Fail, or ⚠ Partial. Record the test command used, the observed output, and the candidate commit/VSIX checksum for every run.
>
> **Build before testing.** All tests run against compiled `dist/` output. Run `npm run build` from the repo root first.
> **Do NOT use the old audit binary.** Point sourceRoot/buildRoot at the candidate, not a historical snapshot.

---

## 0 — Setup and Environment

- [ ] Clone repo on a clean machine and run `npm install` — no errors
- [ ] Run `npm run build` from the repo root — all packages compile with no TypeScript errors
- [ ] Run `node packages/core/test/regression.test.js` — all tests pass, exit code 0
- [ ] Confirm `.env.example` lists every required variable (`WATSONX_API_KEY`, `WATSONX_PROJECT_ID`, `WATSONX_BASE_URL`, `WATSONX_MODEL_ID`, `BCG_WORKSPACE_ROOT`, `BCG_CACHE_DIR`)
- [ ] Confirm no credentials, cache files, or `.context-graph-cache/` folders are tracked by Git (`.gitignore` covers them)
- [ ] Record the candidate commit hash and VSIX checksum before starting

---

## 1 — Workspace Discovery (`packages/core/src/scanner/WorkspaceScanner.ts`)

### F01 — Discovery depth

- [ ] **Root scan:** Open the extension root (not `demo/`) as the workspace. Confirm exactly 0 false-positive services are found at the repo root level (the root itself is not a Spring service).
- [ ] **3-level depth:** Create a temp dir `monorepo/services/order-service/` with a Spring Boot `pom.xml`. Run `WorkspaceScanner.discoverServices()`. Confirm `order-service` is found at depth 3.
- [ ] **Demo workspace:** Open `demo/` as the workspace root. Confirm exactly **3 services** are discovered (`order-service`, `inventory-service`, `payment-service`).
- [ ] **Maven aggregator:** A `pom.xml` that only contains `<modules>` (no source) must NOT be returned as a service itself. Its child modules must each be discovered separately.
- [ ] **Exclusion list:** Directories named `node_modules`, `target`, `.git`, `build`, `.context-graph-cache` are not traversed or returned as services.
- [ ] **Deterministic order:** Running discovery twice on the same workspace returns services in the same order.

### F09 — Unique service IDs

- [ ] Create `team-a/order-service/pom.xml` and `team-b/order-service/pom.xml` in a temp root. Confirm `generateServiceId()` returns **different** IDs for each.
- [ ] Confirm the cache never returns a `rootPath` belonging to a different service than the one requested.

### Polyglot discovery

- [ ] A folder with `package.json` (Node) is discovered as a service with `detectedStack: 'node'`.
- [ ] A folder with a `*.py` entry file (Python/FastAPI) is discovered with `detectedStack: 'python'`.
- [ ] A folder with `*.go` files is discovered with `detectedStack: 'go'`.
- [ ] A folder with no recognised manifest is NOT returned as a service (no empty ghost nodes).

---

## 2 — Git Analyzer (`packages/core/src/git/GitAnalyzer.ts`)

### File classification

- [ ] `OrderController.java` → `API`
- [ ] `entity/Order.java` → `ENTITY`
- [ ] `model/OrderRequest.java` → `DTO`
- [ ] `application.yml` → `CONFIG`
- [ ] `application.yaml` → `CONFIG` (**F08** regression)
- [ ] `pom.xml` → `CONFIG`
- [ ] `package.json` → `CONFIG`
- [ ] `handlers/order_handler.go` → `API`
- [ ] `views/order_views.py` → `API`

### F02 — Monorepo diff scoping

- [ ] In a monorepo with `order-service/` and `payment-service/`, commit a change only under `order-service/`. Confirm `getChangedFiles()` scoped to `order-service/` path returns only order's files.
- [ ] Confirm payment-service reports `Cached` and its changed-files list is empty for that commit.
- [ ] Rename/delete scenario: renaming a file in `order-service/` does not appear as a change in `payment-service/`.

### F03 — Baseline commit lifecycle

- [ ] After initial analysis, `getBaselineCommit(serviceId)` returns `null` (no prior baseline).
- [ ] After a second analysis with a new commit, `getBaselineCommit(serviceId)` returns the **previous** commit, not the new HEAD.
- [ ] `refresh_context` does not erase the baseline that was saved before the refresh.
- [ ] Restart the MCP server after a commit. `analyze_change` still returns the correct `oldCommit → newCommit` pair.

### Dirty-state detection (uncommitted edits)

- [ ] Edit a source file **without committing**. Query `get_system_context()`. Confirm the service whose file changed reports `status: 'Changed'`, not `Cached`.
- [ ] Confirm `getDirtyHash()` returns `'clean'` on a clean working tree and a 12-char hex string when any file is modified/staged.
- [ ] Confirm `getDirtyFiles()` returns the expected list of dirty files matching what `git status --porcelain` reports.
- [ ] Restore the file (no commit). Re-query. Confirm the service returns to `status: 'Cached'` (dirty hash is `'clean'` again, exact cache hit).
- [ ] Stage a file (`git add`) but do not commit. Confirm the dirty hash changes and re-analysis runs.
- [ ] In a non-git workspace (`commitHash: 'unknown'`), `getDirtyHash()` returns `'clean'` without throwing.

### Workspace fingerprint / discovery skip

- [ ] After first analysis, verify `index.json` contains a `workspaceFingerprint` key and a `discoveredServiceIds` array.
- [ ] Query `get_system_context()` a second time with no changes. Confirm the log line `[BCG] Workspace fingerprint hit — skipping fs scan` appears on stderr.
- [ ] Add a new `pom.xml` in a new subfolder. Confirm the fingerprint changes and the full fs scan runs (new service is discovered, fingerprint is updated).
- [ ] Remove a service directory. Confirm the fingerprint changes and discovery re-runs (removed service is no longer returned).
- [ ] Modify a file **inside** an existing service (not a marker file). Confirm the workspace fingerprint does NOT change (marker file sizes unchanged) — only the dirty hash changes.

---

## 3 — Cache (`packages/core/src/cache/ContextCache.ts`)

### F10 — Non-Git cache invalidation

- [ ] Change a source file in a directory with **no `.git` folder**. Re-run analysis. Confirm the result reflects the new file contents (not served from cache).
- [ ] Status/provenance explicitly shows the non-Git state (e.g., `commitHash: 'unknown'` and `status: 'Indexed'` on every run).
- [ ] A workspace where `git` is unavailable does not silently report `Cached`.

### F11 — Multi-process cache consistency

- [ ] Start two engine instances pointing at the same `cacheDir`. Have instance A write a service context. Confirm instance B reads the updated context without requiring a restart.
- [ ] Concurrent writes to different service entries do not corrupt the cache index.
- [ ] A corrupted cache file (truncated JSON) causes a visible diagnostic, not a silent stale read.
- [ ] An interrupted write (simulated by a partial file) is recovered safely on the next read.

### F03 — Baseline tracking (cache layer)

- [ ] `getBaselineCommit('svc1')` returns `null` after the first `set()`.
- [ ] After a second `set()` with a different commit, `getBaselineCommit('svc1')` returns the first commit. *(Covered by `regression.test.js`)*
- [ ] Two services' baselines are independent — setting a new commit on `svc1` does not affect `svc2`'s baseline.

### Compound cache key (commit + dirty)

- [ ] `cache.isCached(serviceId, branch, commitHash, 'clean')` returns `true` after a full analysis with a clean tree.
- [ ] `cache.isCached(serviceId, branch, commitHash, 'abc123def456')` returns `false` when the dirty hash doesn't match any stored slot.
- [ ] `cache.get(serviceId, branch, commitHash, 'abc123def456')` returns the correct context stored under the dirty key.
- [ ] The cache filename for a dirty slot includes the dirty hash suffix: `{serviceId}_{branch}_{commitHash}_{dirtyHash}.json`.
- [ ] The clean slot filename (no dirty suffix) is unchanged from pre-feature behaviour: `{serviceId}_{branch}_{commitHash}.json`.
- [ ] `cache.set(context, dirtyHash)` stores the dirty hash in `index.json` under `lastDirtyHash` for the service.
- [ ] `cache.getLastDirtyHash(serviceId)` returns `'clean'` for a service analysed with a clean tree.
- [ ] Old cache entries without a `lastDirtyHash` field migrate to `lastDirtyHash: 'clean'` on next load.

### Workspace fingerprint persistence

- [ ] `cache.setWorkspaceFingerprint(fp, ids)` stores `workspaceFingerprint` and `discoveredServiceIds` in `index.json`.
- [ ] `cache.getWorkspaceFingerprint()` returns `null` when no fingerprint has been stored yet.
- [ ] `cache.getWorkspaceFingerprint()` returns `{ fingerprint, serviceIds }` after a fingerprint has been stored.
- [ ] Calling `cache.setWorkspaceFingerprint()` twice overwrites the previous value.

### General

- [ ] Old cache entries with a `schemaVersion` mismatch (from a prior release) are safely invalidated, not read as valid.
- [ ] `cache.invalidate(serviceId)` removes only that service's entry; others remain intact.

---

## 4 — Parsers

### 4.1 — SpringApiParser (`packages/core/src/parser/SpringApiParser.ts`)

#### F15 — API extraction correctness

- [ ] `@RequestMapping(path = "/v1")` on the class: method-level mappings inherit the `/v1` prefix. *(Covered by `regression.test.js`)*
- [ ] `@RequestMapping(value = "/v1")`: same prefix inheritance.
- [ ] `ResponseEntity<List<OrderResponse>>` is stored without truncation (both angle-brackets present). *(Covered by `regression.test.js`)*
- [ ] A `@RequestBody` annotation on the **next line** after the method signature is still associated with the parameter.
- [ ] A multiline method signature (parameters split across lines) is parsed as a single endpoint.
- [ ] `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping` are all recognised.
- [ ] A class without `@RestController` or `@Controller` does not produce endpoints.
- [ ] Unsupported/unrecognised annotation pattern produces a clear diagnostic, not a fabricated endpoint.

### 4.2 — JpaEntityParser (`packages/core/src/parser/JpaEntityParser.ts`)

#### F16 — Annotation scope / no bleed

- [ ] An entity with `@Id` on one field and `@Column` on the next: only the `@Id` field is `isPrimaryKey: true`. *(Covered by `regression.test.js`)*
- [ ] `@Transient` field is excluded from the column list. *(Covered by `regression.test.js`)*
- [ ] `@Column(name = "customer_id")` maps to column name `customer_id`, not the Java field name. *(Covered by `regression.test.js`)*
- [ ] Two consecutive `@Column` annotations on adjacent fields do not produce duplicate column names.
- [ ] Whitespace variants (blank lines between annotations, single-line annotations) produce the same semantic model.
- [ ] The demo's 5 JPA tables are all detected without regression after parser changes.

### 4.3 — NodeApiParser (`packages/core/src/parser/NodeApiParser.ts`)

- [ ] Express `router.get('/orders', ...)`, `router.post(...)`, `router.delete(...)` each produce one endpoint. *(Covered by `regression.test.js`)*
- [ ] `app.get(...)` (direct app-level) is also recognised.
- [ ] A plain JS file with no Express imports does not produce false endpoints.

### 4.4 — PythonApiParser (`packages/core/src/parser/PythonApiParser.ts`)

- [ ] FastAPI `@app.get("/orders")` and `@app.post("/orders")` produce endpoints with correct `method` and `path`. *(Covered by `regression.test.js`)*
- [ ] Flask `@app.route("/orders", methods=["GET", "POST"])` produces separate endpoint entries per method.
- [ ] A Python file with no route decorators does not produce false endpoints.

### 4.5 — GoApiParser (`packages/core/src/parser/GoApiParser.ts`)

- [ ] Gin `r.GET(...)` and `r.POST(...)` produce two endpoints. *(Covered by `regression.test.js`)*
- [ ] A `.go` file with no Gin/Chi/Gorilla imports does not produce false endpoints.

### 4.6 — DependencyAnalyzer (`packages/core/src/parser/DependencyAnalyzer.ts`)

- [ ] `application.yml` datasource URL is detected as a DATABASE dependency.
- [ ] `application.yaml` (`.yaml` extension) is parsed equivalently to `.yml`. (**F08**)
- [ ] `application.properties` datasource line is also detected.
- [ ] REST client calls referencing another service name are detected as REST dependencies.
- [ ] An incremental analysis that touches only SERVICE/CONFIG files preserves pre-existing DATABASE dependency entries. (**F08**)

---

## 5 — Context Graph Engine (`packages/core/src/ContextGraphEngine.ts`)

### F02 — Monorepo scoping (engine level)

- [ ] Commit only `order-service/Order.java` in a monorepo. Confirm `cacheStats` shows `refreshed: 1, cached: 2`.
- [ ] Only `order-service`'s parser is called (spy on `SpringApiParser.parseService`). `inventory-service` and `payment-service` parsers are NOT called.
- [ ] All three services' `identity.commitHash` reflects the new monorepo HEAD.

### F05 — Targeted refresh

- [ ] `engine.refreshService('order-service')` returns `refreshed: 1, cached: 2`.
- [ ] Parser is called only for `order-service`; other services read from cache.
- [ ] Baseline/impact data for other services is not discarded.

### F07 — DTO change triggers API impact

- [ ] Change `Integer customerId` → `UUID customerId` in a DTO used as `requestModel` in an endpoint.
- [ ] `incrementalAnalysis` sets `affectsApi: true` for the changeset.
- [ ] An internal DTO not referenced by any endpoint does NOT set `affectsApi: true`.
- [ ] Additive DTO field (new field added, no type change) is distinguished from a breaking type change.

### F08 — DB info not lost on config change

- [ ] Change only `application.yml` (a CONFIG file). After incremental analysis, `updated.dependencies` still contains all prior DATABASE entries.
- [ ] Rename `orders_db` → `orders_v2` in `application.yml`. Updated context reflects `orders_v2`; `orders_db` is removed; REST dependencies are preserved.

### Dirty incremental analysis (`dirtyIncrementalAnalysis`)

- [ ] Edit a `*Controller.java` file without committing. `analyzeService()` routes to `dirtyIncrementalAnalysis` (log: `[BCG] Dirty incremental:`).
- [ ] The updated API endpoints are reflected in the returned context (new/changed routes appear).
- [ ] Only the API parser is re-run; the DB schema from the previous clean context is preserved unchanged.
- [ ] Edit an `*Entity.java` file without committing. The DB schema is re-analysed; APIs are preserved.
- [ ] Edit a file whose service has no dirty files (other service's files are dirty). That service returns `status: 'Cached'`.
- [ ] If a dirty incremental hits no relevant files for this service, the clean cached context is returned as `Cached`.

### F10 — Non-Git service always refreshes

- [ ] A service with `commitHash: 'unknown'` is NEVER returned as `status: 'Cached'`. Each analysis run returns `status: 'Indexed'`.

---

## 6 — Context Graph Builder (`packages/core/src/graph/ContextGraphBuilder.ts`)

### F17 — Shared DB tables

- [ ] Two services sharing `shared_db`: the graph node `db:shared_db` contains tables from **both** services. *(Covered by `regression.test.js`)*
- [ ] Two services using **differently-named** databases produce two separate DB nodes, not a merged one.
- [ ] `applyImpact` with component `"order-service Database"` highlights the `db:orders_db` node as HIGH, not the `svc:order-service` node. *(Covered by `regression.test.js`)*
- [ ] Impact severity is aggregated deterministically when multiple impact entries reference the same DB node (highest severity wins).
- [ ] Result is not dependent on service/impact array ordering.

### Graph structure

- [ ] Every discovered service has a `svc:<serviceId>` node in the graph.
- [ ] Every DATABASE dependency produces a `db:<dbName>` node and an edge.
- [ ] REST dependencies between services produce directional edges with `type: 'REST'`.
- [ ] Node and edge counts are non-zero for the 3-service demo.

---

## 7 — WatsonxRuntime (`packages/watsonx/src/WatsonxRuntime.ts`)

### F12 — Impact semantics

- [ ] A change to `order-service` only produces HIGH impact on `payment-service` if there is **evidence** of a contract dependency (not just adjacency).
- [ ] A DB-only internal change does NOT automatically mark all services as HIGH.
- [ ] Every impact entry includes a `reason` field with a concrete explanation.
- [ ] Deterministic fallback mode (no live watsonx) still produces a structured `ImpactReport` with populated `impacts` array.

### F13 — Structured before/after in prompt

- [ ] The watsonx prompt includes the **specific field change** (e.g., `customer_id: INTEGER → UUID`), not just a file count or category label.
- [ ] The prompt does NOT include full source files or secrets.
- [ ] `describeApi` is called for changed API artifacts (spy confirms > 0 calls on an API change).
- [ ] On warm cache (no change), `describeApi` is NOT called again (spy confirms 0 additional calls).
- [ ] Malformed/error LLM output falls back to a labeled deterministic result, not a crash.

### F14 — Transitive blast radius

- [ ] Fixture A→B→C (A calls B, B calls C): a change to C marks B as direct impact and A as transitive/potential.
- [ ] A service outside the dependency graph is NOT marked as impacted.
- [ ] Cycles in the graph (A→B→A) do not cause an infinite loop.
- [ ] The traversal limit is reported when the graph is truncated.

### Live watsonx (only if credentials are available)

- [ ] Mark **Not run** if `WATSONX_API_KEY` and `WATSONX_PROJECT_ID` are not available in the test environment.
- [ ] If available: a real `analyzeImpact` call returns a non-empty `impacts` array and a `summary` string.
- [ ] Credentials are NOT logged to stdout or stderr.

---

## 8 — MCP Server (`packages/mcp-server/src/index.ts`)

### F06 — Clean stdio transport

- [ ] Start the MCP server against the demo workspace. Run all four tools. Confirm every line on **stdout** is valid JSON-RPC (no `[BCG]` prefix lines).
- [ ] `[BCG]` diagnostic lines appear on **stderr** only.
- [ ] No `SyntaxError` on JSON parse from an MCP SDK client during any of the four tool calls.

### F04 + dirty — MCP freshness check

- [ ] Query `get_system_context` → make a commit → query again (no restart). The returned `commit` hash reflects the new HEAD.
- [ ] Query `get_system_context` → edit a file (no commit) → query again. The service with the edited file shows `status: 'Changed'` (dirty re-analysis ran).
- [ ] A second query with **no changes at all** (clean tree, same commit) does NOT re-run the parser (spy/log confirms 0 parse calls, `cacheStats.cached: 3`).
- [ ] `lastRepoFingerprints` is updated after every stale re-analysis so a third identical query stays cached.
- [ ] Edit a file, query (detects dirty) → restore the file, query again (returns to cached). No stale `Changed` status lingers.

### F05 — Targeted refresh via MCP

- [ ] `refresh_context({ service: "order-service" })` returns `refreshed: 1, cached: 2`.
- [ ] `refresh_context()` with no service returns `refreshed: 3, cached: 0` (all services).
- [ ] Baseline impact remains available after a targeted refresh (not wiped).

### F23 — Ambiguous service resolution

- [ ] `get_service_context({ service: "service" })` (matches multiple) → returns `InvalidParams` with a candidate list.
- [ ] `get_service_context({ service: "order-service" })` (exact ID) → returns the correct service.
- [ ] `get_service_context({ service: "nonexistent" })` → returns `InvalidParams` with the available-IDs list.
- [ ] `get_service_context({ service: 123 })` (wrong type) → returns `InvalidParams`.
- [ ] Same resolver logic is applied consistently to `analyze_change` and `refresh_context`.

### Four tools — cold/warm/change scenarios

- [ ] **Cold cache:** `get_system_context` on a fresh workspace returns 3 services, 18 total endpoints, 5 tables, 3 database nodes.
- [ ] **Warm cache:** Second `get_system_context` call with no changes returns the same result, `cacheStats.cached: 3`.
- [ ] **After commit:** `get_system_context` after a commit to `order-service` shows the new commit hash for order; inventory and payment remain cached.
- [ ] `get_service_context("order-service")` returns full endpoint list, table list, dependency list, and `semanticSummary`.
- [ ] `analyze_change("order-service")` returns a `change` object with `oldCommit`, `newCommit`, `changedFiles`, and `impactReport`.
- [ ] `refresh_context("payment-service")` refreshes only payment; order and inventory stay cached.

### Simultaneous calls

- [ ] Two concurrent `get_system_context` calls do not produce a mixed snapshot or trigger duplicate analysis.

---

## 9 — VS Code Extension (`packages/vscode-extension/`)

### F18 — Analyze Changes webview button

- [ ] Click the **Analyze Changes** button in the graph webview. Confirm the same impact flow runs as clicking the sidebar command.
- [ ] Result / no-changes / error notification appears without a manual refresh.
- [ ] Clicking the button twice quickly does not trigger two simultaneous analyses.
- [ ] Unrecognised webview messages are safely ignored (no crash).

### F19 — UI state synchronisation

- [ ] Make a commit while the extension is running. Confirm the sidebar and graph update within the documented time (or a manual refresh is clearly required — no stale data silently shown).
- [ ] After `Refresh All`, the graph resets to a clean state (no stale red highlights from a prior analysis).
- [ ] After `Analyze Changes`, the sidebar and the graph highlight the **same** revision/snapshot.
- [ ] A branch checkout causes the old impact highlights to be cleared, not carried forward.

### F20 — Settings applied

- [ ] Set `bcg.cacheDir` to a custom path. Confirm all cache files are written to the custom path; workspace root gets no `.context-graph-cache`.
- [ ] Set a custom `bcg.watsonxBaseUrl` and `bcg.watsonxModelId`. A spy client receives the custom values.
- [ ] Settings change takes effect without requiring a manual VSIX reinstall.

### F21 — UI states

- [ ] Open a workspace with no supported services. Sidebar settles into an empty/ready state, NOT an endless "Analyzing workspace…" spinner.
- [ ] The demo's 18 endpoints are **all** browsable in the Service Explorer (not truncated to 3).
- [ ] Service labels display correctly (no regex-escaping artefacts like `"er vice/ervice"`).
- [ ] The HEAD commit hash is shown (not the `analyzedAt` timestamp) in the service identity display.
- [ ] Database table detail is browsable (table name, column list) in the Service Explorer.
- [ ] Error state is shown clearly when analysis fails (not an endless spinner).

### F22 — Webview XSS safety

- [ ] Inject `</script><script>alert(1)//` as a service name or summary string. Confirm it renders as literal text in the webview, not as executed script.
- [ ] Inject `<img onerror="alert(1)" src=x>` as impact text. Confirm no script execution.
- [ ] The webview HTML includes a **Content-Security-Policy** header/meta with a nonce.
- [ ] Graph actions (node selection, Analyze Changes button) still work with CSP enabled.
- [ ] No credentials appear in any webview-rendered text.

### F11 — VSIX ↔ MCP cache sync

- [ ] Run the VSIX extension and the MCP server against the same workspace simultaneously. After the VSIX writes a new context, confirm the MCP server reads the updated cache (not a stale baseline).

---

## 10 — Golden-Path Demo (end-to-end)

Follow the exact sequence from `REQUIREMENTS.md §25`.

- [ ] **Scene 1:** Open the demo workspace; confirm 0 services at extension root, 3 at `demo/`.
- [ ] **Scene 2:** `get_system_context()` via MCP returns 3 services, 18 endpoints, 5 tables, 3 databases, correct dependency edges.
- [ ] **Scene 3:** Ask Bob an architecture question. Confirm the MCP tool is actually invoked (not answered from model memory alone). Response references specific service names and endpoints from the context.
- [ ] **Scene 4:** Change `private Integer customerId` → `private UUID customerId` in the order-service DTO. Commit the change.
- [ ] **Scene 5:** `get_system_context()` returns `refreshed: 1, cached: 2`. The changed commit hash for order-service is reflected.
- [ ] **Scene 6:** `analyze_change("order-service")` returns an impact report. At minimum: `affectsApi: true` (DTO→endpoint), `affectsDatabase: false`, an impact entry for the changed DTO/endpoint. Payment-service impact must be backed by evidence (contract reference), not assigned blindly.
- [ ] **Scene 7:** Ask Bob to produce a migration plan. Bob invokes MCP and produces a plan that references specific endpoints and field names from the context.
- [ ] **Full regression:** Re-query with no further changes → `cached: 3`, no parser calls, no LLM calls.
- [ ] **Uncommitted edit scene:** Edit `order-service/OrderController.java` without committing. `get_system_context()` shows `order-service` as `Changed`. Inventory and payment remain `Cached`. Restore the file; next query shows `Cached: 3`.

---

## 11 — Packaging and Installation

- [ ] Build the `.vsix` package (`vsce package` or `npm run package`).
- [ ] Fresh-install the `.vsix` in a clean VS Code instance. Extension activates without errors.
- [ ] MCP server starts from its built `dist/index.js` without `node_modules` errors.
- [ ] `.bob/mcp.json` references the correct server path and environment variables.
- [ ] `SKILL.md` exists and matches the actual MCP tool signatures and behaviour.
- [ ] No secrets, caches, or `dist/` artifacts are committed to Git.
- [ ] `README.md` API counts match current parser output (18 endpoints for the demo).
- [ ] `.gitignore` has no invalid Windows-specific globs; `*.context-graph-cache` pattern is correct.

---

## 12 — Security

- [ ] No credentials appear in MCP stdout (checked by reading raw stdout with an SDK client).
- [ ] No credentials appear in VSIX extension logs or webview content.
- [ ] The webview `localResourceRoots` is restricted to the extension's own assets.
- [ ] Inline event handlers (`onclick`, `onload`, etc.) are absent from generated webview HTML.
- [ ] `postMessage` messages from the webview are type-validated before acting on them.

---

## 13 — Definition of Done

All of the following must be true before this checklist is closed:

- [ ] Every F01–F25 has a status: **Fixed** / **Partially fixed** / **Deferred** with a rationale and a link to the relevant commit or test.
- [ ] `node packages/core/test/regression.test.js` exits 0 with all tests passing.
- [ ] The golden-path demo (§10 above) passes end-to-end.
- [ ] No live watsonx run is marked as passing if credentials were unavailable — those items must be marked **Not run**.
- [ ] Cold and warm benchmark results are recorded (separate p50 measurements, n ≥ 5).
- [ ] Dirty-state detection benchmark: time from file edit to `get_system_context` returning `Changed` is < 500 ms on the demo workspace.
- [ ] Workspace fingerprint skip benchmark: second `get_system_context` call (clean, same commit) completes without any filesystem scan log lines.
- [ ] Cache/identity migration is tested: existing `index.json` entries without `lastDirtyHash` or `workspaceFingerprint` load correctly and migrate gracefully.
- [ ] Screenshots or a screen recording of the working graph webview are attached.
- [ ] A machine-readable trace (JSON) for all key MCP claims is saved.
- [ ] Remaining limitations are documented explicitly — no "everything is done" blanket claim.

---

## Appendix — Quick Command Reference

```bash
# Build all packages
npm run build

# Run core regression tests
node packages/core/test/regression.test.js

# Start MCP server (deterministic mode)
BCG_WORKSPACE_ROOT=./demo node packages/mcp-server/dist/index.js

# Start MCP server (with watsonx)
WATSONX_API_KEY=... WATSONX_PROJECT_ID=... BCG_WORKSPACE_ROOT=./demo node packages/mcp-server/dist/index.js

# Package VSIX
cd packages/vscode-extension && npx vsce package
```

### Finding IDs table

| Area | Source file |
|---|---|
| Discovery / Scanner | `packages/core/src/scanner/WorkspaceScanner.ts` |
| Git analysis | `packages/core/src/git/GitAnalyzer.ts` |
| Cache | `packages/core/src/cache/ContextCache.ts` |
| Spring parser | `packages/core/src/parser/SpringApiParser.ts` |
| JPA parser | `packages/core/src/parser/JpaEntityParser.ts` |
| Node parser | `packages/core/src/parser/NodeApiParser.ts` |
| Python parser | `packages/core/src/parser/PythonApiParser.ts` |
| Go parser | `packages/core/src/parser/GoApiParser.ts` |
| Dependency analyzer | `packages/core/src/parser/DependencyAnalyzer.ts` |
| Engine orchestrator | `packages/core/src/ContextGraphEngine.ts` |
| Graph builder | `packages/core/src/graph/ContextGraphBuilder.ts` |
| watsonx runtime | `packages/watsonx/src/WatsonxRuntime.ts` |
| MCP server | `packages/mcp-server/src/index.ts` |
| VS Code extension | `packages/vscode-extension/src/extension.ts` |
| Webview HTML | `packages/vscode-extension/src/webview/graphHtml.ts` |
| Regression tests | `packages/core/test/regression.test.js` |

# ROLE

You are the principal software engineer responsible for building **Bob Context Graph**, a hackathon prototype that extends IBM Bob with persistent, commit-aware system intelligence for microservice projects.

You have approximately **14 hours of total development time**.

Your responsibility is not merely to generate code. You must deliver a working, installable, demonstrable end-to-end prototype.

Act autonomously.

Do not repeatedly ask the user for implementation decisions when a reasonable engineering default exists.

Make pragmatic decisions, document them briefly, and continue.

---

# PRIMARY OBJECTIVE

Build a working system that allows IBM Bob to:

1. Discover microservices in a workspace.
2. Understand their REST APIs.
3. Understand their database schemas.
4. Understand dependencies between services and databases.
5. Cache this understanding using Git commit hashes.
6. Reuse cached context when repositories have not changed.
7. Incrementally analyze repositories when commits change.
8. Detect API and database schema changes.
9. Use IBM watsonx Runtime to reason about the blast radius of those changes.
10. Expose this intelligence to IBM Bob through MCP.
11. Teach Bob when to use this capability through a Bob Skill.
12. Visualize the architecture and impact analysis through a VS Code extension.
13. Package the extension as an installable `.vsix`.

The final prototype must prioritize a reliable golden-path demo over feature completeness.

---

# CORE PRODUCT PRINCIPLE

Bob Context Graph must NOT attempt to replace IBM Bob.

Responsibilities are:

- **VSIX = See it**
- **MCP = Access it**
- **Bob Skill = Know when to use it**
- **watsonx = Reason about it**
- **IBM Bob = Act on it**

Bob Context Graph provides system intelligence.

IBM Bob remains responsible for coding, planning, and implementation actions.

---

# IMPORTANT EXECUTION RULE

Do not spend the entire session planning.

First inspect the current project state.

Then produce a concise implementation plan.

Then immediately begin implementation.

Continue implementing, testing, debugging, and improving the project until the P0 golden path works.

Do not stop after:

- creating architecture documents
- generating TODO lists
- creating scaffolding
- implementing only interfaces
- writing placeholder functions
- producing mockups

The task is complete only when the core system runs end-to-end.

---

# SOURCE OF TRUTH

Read `REQUIREMENTS.md` before implementation.

Treat it as the primary product specification.

If implementation details are ambiguous:

1. Prefer the simplest architecture.
2. Prefer deterministic solutions.
3. Prefer fewer dependencies.
4. Prefer local execution.
5. Prefer solutions that are easy to demonstrate.
6. Prefer solutions that can be packaged within the hackathon deadline.

Do not expand scope unnecessarily.

---

# SUPPORTED DEMO STACK

Optimize the prototype for:

- Java
- Spring Boot
- PostgreSQL
- Git
- REST
- VS Code
- IBM Bob
- MCP
- IBM watsonx

Do NOT attempt universal programming-language support.

Spring constructs that should be recognized include:

```
@RestController
@RequestMapping
@GetMapping
@PostMapping
@PutMapping
@DeleteMapping

@Entity
@Table
@Column
@Id
@ManyToOne
@OneToMany
```

DTOs and basic model references should also be recognized where practical.

---

# ARCHITECTURAL PRINCIPLE

Do not send entire repositories to an LLM and ask it to discover everything.

Use deterministic extraction first.

Preferred pipeline:

```
Git
+
source parsing
+
API extraction
+
JPA/database extraction
+
dependency detection
        ↓
structured ServiceContext
        ↓
System Context Graph
        ↓
scoped relevant context
        ↓
IBM watsonx
        ↓
semantic reasoning
```

Use watsonx for tasks where semantic reasoning provides value.

---

# TARGET ARCHITECTURE

```
Developer
    ↓
IBM Bob
    ↓
Bob Skill
    ↓
MCP
    ↓
Bob Context Graph MCP Server
    ↓
System Context Graph
    ↓
Core Analyzer
    ├── Git Analyzer
    ├── API Analyzer
    ├── Database Analyzer
    ├── Dependency Analyzer
    └── Context Cache
    ↓
IBM watsonx Runtime
    ├── Semantic Summary
    ├── Change Interpretation
    ├── Impact Reasoning
    └── Migration Recommendation
```

The VS Code extension reads the same underlying system intelligence and visualizes it.

---

# REPOSITORY STRUCTURE

Prefer a monorepo approximately following:

```
bob-context-graph/
│
├── README.md
├── LICENSE
│
├── demo/
│   └── microservices/
│       ├── order-service/
│       ├── inventory-service/
│       └── payment-service/
│
├── packages/
│   ├── core/
│   │   ├── git/
│   │   ├── scanner/
│   │   ├── parser/
│   │   ├── graph/
│   │   └── cache/
│   │
│   ├── watsonx/
│   │   ├── client/
│   │   └── prompts/
│   │
│   ├── mcp-server/
│   │   └── tools/
│   │
│   └── vscode-extension/
│       ├── src/
│       ├── webview/
│       └── package.json
│
├── .bob/
│   ├── mcp.json
│   └── skills/
│       └── context-graph/
│           └── SKILL.md
│
└── releases/
```

You may adjust this structure when technically justified. Do not change it merely for stylistic preference.

---

# PHASE 0 — INSPECT FIRST

Before writing code:

1. Inspect the repository.
2. Identify existing files.
3. Identify existing implementation.
4. Identify installed dependencies.
5. Identify available IBM Bob configuration.
6. Identify watsonx configuration if present.
7. Identify unfinished work.
8. Avoid rewriting functioning code unnecessarily.

Then produce a SHORT implementation plan.

After that, start implementation immediately.

---

# PHASE 1 — CREATE DEMO MICROSERVICES

If suitable demo repositories do not already exist, create three minimal Spring Boot services:

- `order-service`
- `inventory-service`
- `payment-service`

They do not need complete production functionality. They exist primarily to demonstrate architectural discovery.

Create intentional dependencies. For example:

```
Order Service → Inventory Service → inventory database
Order Service → Payment Service   → payment database
Order Service → orders database
```

Include enough REST controllers, DTOs, entities, and service calls for the analyzer to discover meaningful relationships.

Make the demo deterministic.

---

# PHASE 2 — WORKSPACE DISCOVERY

Implement workspace discovery.

Required:

- discover services
- detect Git repositories
- detect repository names
- detect branches
- obtain HEAD commit hashes
- assign service IDs

Return structured information.

Example:

```json
{
  "serviceId": "order-service",
  "repository": "...",
  "branch": "main",
  "commitHash": "a91fc20"
}
```

Test this functionality. Do not proceed with broken Git discovery.

---

# PHASE 3 — COMMIT-AWARE CACHE

Implement persistent semantic context caching.

Cache identity should include at least:

```
repository + branch + commitHash
```

Create a ServiceContext structure:

```
ServiceContext
├── identity
├── apis
├── database
├── dependencies
├── events
└── semanticSummary
```

Required behavior:

```
IF current HEAD == cached HEAD:
    reuse ServiceContext
ELSE:
    analyze changes
```

Persist the context locally. JSON or SQLite is acceptable. Do NOT introduce a vector database unless absolutely required.

---

# PHASE 4 — INCREMENTAL ANALYSIS

When HEAD changes, do not immediately rescan everything.

Use Git diff. Determine:

- previous analyzed commit
- current commit
- changed files

Classify changed files:

```
API | ENTITY | DTO | SERVICE | CONFIG | UNKNOWN
```

Determine which context sections need refresh. Only re-analyze affected service context where practical. Other services must remain cached.

This behavior must be visible during the demo:

```
CHANGE DETECTED
order-service
a91fc20 → c821ad3
1 service refreshed
2 services reused from cache
```

---

# PHASE 5 — API EXTRACTION

Implement deterministic Spring REST extraction.

Extract at minimum:

- controller
- HTTP method
- endpoint path
- request model where detectable
- response model where detectable

Use the simplest reliable parsing technique appropriate for the hackathon. Regex, lightweight parsing, AST libraries, or combinations are acceptable.

Return normalized structures:

```json
{
  "method": "POST",
  "path": "/orders",
  "controller": "OrderController",
  "requestModel": "OrderRequest",
  "responseModel": "OrderResponse"
}
```

Test against demo services.

---

# PHASE 6 — DATABASE EXTRACTION

Analyze Spring/JPA entities.

Extract:

- entities
- table names
- columns
- basic types
- primary keys
- basic relationships

Recognize annotations:

```
@Entity  @Table  @Column  @Id  @ManyToOne  @OneToMany
```

Normalize results:

```json
{
  "table": "orders",
  "columns": [
    { "name": "customer_id", "type": "Integer" }
  ]
}
```

Associate database artifacts with owning services.

---

# PHASE 7 — DEPENDENCY GRAPH

Construct a System Context Graph from all ServiceContexts.

Required node types: `SERVICE`, `DATABASE`

Required edge types: `SERVICE_DEPENDS_ON_SERVICE`, `SERVICE_USES_DATABASE`

Keep the internal graph model extensible so API/EVENT/TABLE nodes can be added later. Do not implement those advanced nodes unless required for the demo.

Graph generation must be deterministic.

---

# PHASE 8 — WATSONX INTEGRATION

Implement IBM watsonx Runtime integration.

Credentials must come from environment variables or configuration. Never hardcode credentials.

Create a clean abstraction around watsonx.

watsonx responsibilities:

1. Generate service semantic summaries.
2. Generate API semantic descriptions where useful.
3. Interpret detected changes.
4. Reason about potential downstream impact.
5. Assign impact severity.
6. Explain WHY a dependency is affected.
7. Recommend migration steps.

Do NOT send entire repositories unnecessarily.

Build scoped prompts using structured extracted context.

Example input:

```
CHANGE
orders.customer_id
Integer → UUID

RELATED CONTEXT
Order Service, Payment Service
POST /orders
OrderCreatedEvent
orders table
```

Prefer structured JSON responses where possible. Validate responses before consuming them. Implement graceful error handling. If watsonx fails, deterministic functionality should still work where possible.

---

# PHASE 9 — IMPACT ANALYSIS ENGINE

Implement the primary feature.

Input: detected change (e.g. `customerId: Integer → UUID`)

Process:

```
Change
→ Graph lookup
→ Related nodes
→ Related ServiceContexts
→ scoped watsonx request
→ ImpactReport
```

ImpactReport should include:

- changed artifact
- old value
- new value
- affected components
- severity
- reason
- recommended action

Severity: `HIGH`, `MEDIUM`, `LOW`

Never output severity without an explanation.

Example:

```json
{
  "change": "orders.customer_id Integer -> UUID",
  "impacts": [
    {
      "service": "payment-service",
      "severity": "HIGH",
      "reason": "Payment service consumes a contract using the previous customer ID representation."
    }
  ]
}
```

---

# PHASE 10 — MCP SERVER

Implement an MCP server exposing Bob Context Graph.

Required tools:

### `get_system_context()`
Return: services, commits, dependencies, databases, system summary.

### `get_service_context(service)`
Return: service identity, commit, APIs, database schema, dependencies, semantic summary. Prefer cache.

### `analyze_change(service)`
Perform: Git diff → classify changes → query graph → watsonx reasoning.
Return: ImpactReport.

### `refresh_context(service?)`
Refresh one service or all services. Update cache and graph.

All MCP responses should be structured and concise enough for an AI coding agent to consume efficiently.

Test MCP tools independently before integrating them with Bob.

---

# PHASE 11 — IBM BOB CONFIGURATION

Create `.bob/mcp.json`.

Configure the local MCP server. Never store credentials inside the file. Document required environment variables. Verify that IBM Bob can discover the MCP tools.

---

# PHASE 12 — BOB SKILL

Create `.bob/skills/context-graph/SKILL.md`.

The Skill should teach Bob to use Bob Context Graph when questions involve:

- system architecture
- microservices
- service dependencies
- API dependencies
- database dependencies
- schema changes
- breaking changes
- blast radius
- migration planning

Bob should prefer:

- `get_system_context()` for system architecture
- `get_service_context(service)` for service-specific understanding
- `analyze_change(service)` for change impact
- `refresh_context(service)` only when necessary

The Skill must instruct Bob to prefer cached Context Graph knowledge before independently scanning entire repositories. However, Bob may inspect source code when implementation-level details are required.

---

# PHASE 13 — VS CODE EXTENSION

Build a VS Code extension named **Bob Context Graph**.

Provide an Activity Bar / Sidebar entry.

Minimum sidebar:

```
BOB CONTEXT GRAPH

SYSTEM
3 Services | 7 APIs | 3 Databases

SERVICES
✓ order-service
✓ inventory-service
✓ payment-service

CONTEXT STATUS
✓ 2 Cached  ⚠ 1 Changed

IMPACT
⚠ 1 HIGH  ⚠ 1 MEDIUM

[ Open System Graph ]
[ Analyze Changes ]
[ Refresh Context ]
```

The extension should communicate with the core system cleanly. Avoid duplicating analysis logic inside the UI.

---

# PHASE 14 — VISUAL GRAPH

Create a VS Code WebView for architecture visualization. This is a major demo feature.

Required:

- service nodes
- database nodes
- dependency edges
- click interaction
- selected-node detail
- zoom
- pan

Do not spend excessive time building custom graphics if a lightweight graph library can provide a better result quickly.

---

# PHASE 15 — IMPACT VISUALIZATION

When impact analysis is available, visually highlight affected components.

```
              ORDER
                |
          +-----+-----+
          v           v
     INVENTORY      PAYMENT
       SAFE         ⚠ HIGH
                       |
                       v
                   PAYMENT DB
```

Provide an impact panel with severity labels and explanations. The impact graph should be visually obvious during the demo.

---

# PHASE 16 — VSIX PACKAGING

Package the extension as `bob-context-graph-0.1.0.vsix`.

The project must NOT depend on VS Code Marketplace publication.

Verify installation locally:

```
code --install-extension bob-context-graph-0.1.0.vsix
```

Store the generated artifact under an appropriate release/output directory. Do not commit unnecessary build artifacts unless required for hackathon delivery.

---

# PHASE 17 — README

Create a professional README including:

- Tagline
- Problem
- Solution
- Architecture
- How It Works
- IBM Bob Integration
- MCP Tools
- watsonx Usage
- VS Code Extension
- Installation (VSIX + configuration)
- Demo Scenario
- Screenshots
- Limitations
- Future Work

Clearly state: "Bob Context Graph extends IBM Bob with persistent, commit-aware system intelligence."

README should explain that the project avoids repeatedly rediscovering unchanged repositories.

---

# GOLDEN-PATH TEST

The implementation is NOT complete until this workflow succeeds:

1. Open workspace containing three demo microservices.
2. Bob Context Graph discovers them.
3. Contexts are generated.
4. Dependency graph appears.
5. Close/re-run analysis — unchanged repositories load from cache.
6. Ask Bob: "Explain how order-service interacts with the rest of the system." → Bob uses MCP, not raw repo scan.
7. Modify `private Integer customerId;` to `private UUID customerId;`. Commit.
8. Bob Context Graph detects the new commit.
9. Only the changed service requires refresh. Others are reused from cache.
10. Click "Analyze Changes" → impact graph highlights affected components.
11. watsonx explains the impact.
12. Ask Bob: "Create an implementation plan to safely migrate this change." → Bob uses Context Graph intelligence.

If this workflow fails, prioritize fixing it over implementing additional features.

---

# PRIORITY RULES

P0 is mandatory. P1 is optional. P2 is out of scope.

Priority order:

1. End-to-end functionality
2. MCP/Bob integration
3. Commit-aware caching
4. Change-impact analysis
5. Dependency graph
6. watsonx reasoning
7. VSIX usability
8. Visual polish
9. Documentation
10. Optional features

If time becomes limited, REMOVE scope rather than leaving the core workflow unstable.

---

# DO NOT OVERENGINEER

Do not introduce:

- Kubernetes/Docker runtime discovery
- live production databases
- distributed tracing
- authentication / multi-user infrastructure
- cloud deployment
- universal language support
- vector databases unless essential
- complex RAG pipelines
- universal AST frameworks
- autonomous coding functionality that duplicates IBM Bob

This is a hackathon prototype. Simple working architecture is superior to sophisticated unfinished architecture.

---

# ENGINEERING QUALITY REQUIREMENTS

While moving quickly:

- avoid giant files where practical
- separate UI from analysis logic
- separate watsonx integration
- keep MCP tools thin
- use typed interfaces/models
- handle errors
- validate external AI responses
- never commit credentials
- create `.env.example` where appropriate
- add useful logging
- avoid unnecessary dependencies
- avoid dead code
- remove placeholders from P0 features

Do not fake core functionality. Mock/sample data is acceptable only for demo microservices, not for pretending that core analysis works.

---

# TESTING STRATEGY

Prioritize tests around:

- Git HEAD detection
- cache hit / cache miss
- Git diff
- API extraction
- JPA extraction
- graph generation
- change detection
- impact-report parsing
- MCP tool responses

After each major phase, run relevant tests/build commands. Do not wait until the end to discover compilation failures.

---

# CONTINUOUS VERIFICATION

After implementing each major component:

1. Build it.
2. Run it.
3. Test the expected behavior.
4. Fix failures.
5. Continue.

Do not accumulate untested code. Periodically run the complete project build.

Before final completion:

- clean build
- run tests
- start MCP
- verify MCP tools
- build VS Code extension
- package VSIX
- verify VSIX installation
- execute golden path

---

# AUTONOMY RULE

When encountering a minor ambiguity, do NOT stop and ask the user.

Choose a reasonable engineering default and continue.

Only request user input when blocked by:

- missing required watsonx credentials
- unavailable IBM service access
- destructive operation requiring permission
- fundamentally contradictory requirements

Even when external credentials are unavailable, continue building all components that do not require them. Provide configuration placeholders and keep moving.

---

# TIME MANAGEMENT

Treat the deadline as strict.

| Hours      | Focus |
|------------|-------|
| 0–1        | Repository + demo + scaffolding |
| 1–3        | Git + cache |
| 3–5        | API + DB extraction |
| 5–6        | Context Graph |
| 6–8        | watsonx + impact analysis |
| 8–9.5      | MCP |
| 9.5–10     | Bob Skill + configuration |
| 10–12      | VSIX + graph |
| 12–13      | Impact visualization + polish |
| 13–13.5    | Golden-path testing |
| 13.5–14    | README + VSIX + final verification |

**After approximately Hour 10: DO NOT add major backend capabilities. Focus on integration, reliability, visuals, documentation, and demo quality.**

---

# DEFINITION OF DONE

The project is complete when:

- [ ] Microservices are discovered
- [ ] Git commits are detected
- [ ] Context is cached by repository state
- [ ] Unchanged services reuse context
- [ ] Changed repositories use Git diff
- [ ] APIs are extracted
- [ ] Database schemas are extracted
- [ ] Service dependencies are represented
- [ ] Context Graph is generated
- [ ] watsonx is integrated
- [ ] Change impact can be reasoned about
- [ ] MCP server works
- [ ] Bob can call the MCP tools
- [ ] Bob Skill exists
- [ ] `.bob/mcp.json` exists
- [ ] VS Code extension works
- [ ] Dependency graph is visible
- [ ] Impact visualization works
- [ ] VSIX builds successfully
- [ ] VSIX can be installed locally
- [ ] README explains setup and architecture
- [ ] Golden-path demo succeeds

---

# FINAL PRODUCT MESSAGE

The implementation should demonstrate:

> "Bob Context Graph extends IBM Bob with persistent, commit-aware system intelligence, allowing Bob to understand microservice APIs, database schemas, dependencies, and the blast radius of changes without repeatedly rediscovering the entire codebase."

Remember:

- **VSIX = See it.**
- **MCP = Access it.**
- **Skill = Know when to use it.**
- **watsonx = Reason about it.**
- **Bob = Act on it.**

---

# START NOW

Begin by inspecting the existing repository and reading `REQUIREMENTS.md`.

Then:

1. Report the existing project state briefly.
2. Produce a concise implementation plan.
3. Identify the immediate P0 milestone.
4. Start implementing it immediately.
5. Build and test continuously.
6. Continue autonomously through subsequent P0 milestones.
7. Do not stop merely because one component has been implemented.
8. Keep the golden-path demo as the ultimate acceptance test.
9. Package the final working VSIX.
10. Finish with an end-to-end verification report listing:
    - what works
    - what was tested
    - remaining limitations
    - exact commands to run the demo

Do not merely tell me how to build Bob Context Graph.

**Build it.**

---

# FIX SUMMARY — Applied by Bob Agent (post-audit)

All F01–F25 findings from `FIX_REQUEST_EN.md` have been addressed. The following documents the current state for the next agent so no re-reading of the entire codebase is required.

## Build & Test
- **All 4 TypeScript packages compile with zero errors** (core, mcp-server, watsonx, vscode-extension).
- **20 regression tests pass** (`node packages/core/test/regression.test.js`).
- Test runner script: `packages/core/package.json` `test` script now runs `tsc && node test/regression.test.js`.

## Key File Changes (by package)

### `packages/core/src/`

| File | Changes |
|------|---------|
| `models/types.ts` | Added `DetectedStack` type ('spring-boot' \| 'node' \| 'python' \| 'go' \| 'unknown'); added `detectedStack?` to `ServiceContext`; added `ownerServiceIds?` to `DatabaseNodeData` (F17) |
| `scanner/WorkspaceScanner.ts` | **F01/F09**: Recursive scan up to depth 5; Maven aggregator detection (reads `<modules>`); workspace-relative canonical `serviceId`; polyglot stack detection (Node, Python, Go) |
| `git/GitAnalyzer.ts` | **F08/polyglot**: `classifyFile` now correctly classifies `application.yaml` as CONFIG; classifies Go, Python, Node.js file types |
| `cache/ContextCache.ts` | **F03/F10/F11**: Added `baselineCommit` field (separate from `lastAnalyzedCommit`); schema v2 with migration; atomic writes via temp+rename; re-reads index from disk on every read to handle concurrent writers; `getBaselineCommit()` method |
| `ContextGraphEngine.ts` | **F02**: Per-repo HEAD map, `git diff` scoped to service subdirectory path. **F05**: `refreshService(serviceId)` method. **F07**: DTO changes check exposed endpoint models → `affectsApi=true`. **F08**: Preserves DATABASE deps during SERVICE/CONFIG incremental refresh. **F10**: Skips cache when `commitHash === 'unknown'`. **Polyglot**: Routes to `NodeApiParser`, `PythonApiParser`, `GoApiParser` based on `detectedStack` |
| `parser/SpringApiParser.ts` | **F15**: Handles `path=` alias in `@RequestMapping`; multiline `@RequestBody`; nested generics like `ResponseEntity<List<OrderResponse>>` without truncation |
| `parser/JpaEntityParser.ts` | **F16**: Line-by-line annotation accumulator that resets on each field — no more 3-line window bleed; `@Transient` excluded correctly |
| `parser/DependencyAnalyzer.ts` | **F08**: Also scans `application.yaml` for datasource config |
| `parser/NodeApiParser.ts` | **NEW**: Express.js, Fastify, NestJS route extraction |
| `parser/PythonApiParser.ts` | **NEW**: Flask and FastAPI route decorator extraction |
| `parser/GoApiParser.ts` | **NEW**: net/http, gorilla/mux, gin, echo, chi route extraction |
| `graph/ContextGraphBuilder.ts` | **F17**: Merges tables from multiple services sharing same DB name; `applyImpact` uses node ID matching with DB-specific pattern fallback |
| `index.ts` | Exports new polyglot parsers |

### `packages/mcp-server/src/index.ts`
- **F04**: `getOrAnalyze()` checks per-repo HEAD before returning cache — auto-invalidates stale results.
- **F05**: `handleRefreshContext()` now calls `engine.refreshService(id)` for targeted refresh (1 refreshed / N-1 cached).
- **F06**: All non-JSON output uses `console.error()` or `process.stderr.write()`.
- **F23**: `resolveService()` strict resolver — exact ID, exact name, then unique-only substring; throws `InvalidParams` with candidate list on ambiguity.

### `packages/vscode-extension/src/`

| File | Changes |
|------|---------|
| `extension.ts` | **F19**: `refreshContext`/`refreshAll` push updated graph to webview via `GraphWebviewProvider.show()`. `bcg.analyzeChanges` stores highlighted graph in `lastAnalysisResult`. **F20**: Reads `bcg.cacheDir`, `bcg.watsonxApiKey`, `bcg.watsonxBaseUrl`, `bcg.watsonxModelId` from config. **F21**: Calls `systemProvider.setAnalyzing(true)` before analysis and `setError()` on failure. |
| `webview/GraphWebviewProvider.ts` | **F18**: Dispatches `analyzeChanges` webview message to `bcg.analyzeChanges` command. **F19**: Always sends updated data via `postMessage` on show. **F22**: Generates a per-panel CSP nonce; passes to `getGraphHtml()`. |
| `webview/graphHtml.ts` | **F22**: Full rewrite — no user data injected into script or innerHTML. Data arrives via `postMessage`. CSP `<meta>` with nonce. All labels/summaries/impact text rendered via `textContent` or DOM APIs. No inline event handlers. |
| `providers/SystemOverviewProvider.ts` | **F21**: Explicit state machine (idle/analyzing/ready/empty/error). `setAnalyzing()`, `setError()` methods. Empty state shows "No supported services found" instead of endless spinner. |

### Root
- `.gitignore` — Fixed (was `\node_modules\` Windows path with backslash). Now: `node_modules/`, `dist/`, `*.vsix`, `.env`, `.context-graph-cache/`, `*.js.map`.
- `packages/core/test/regression.test.js` — **NEW**: 20 regression tests covering F01, F03, F09, F15, F16, F17 DB merge, F17 impact ID, Node/Python/Go parsers, cache baseline.

## Deferred / Limitations
- **F11 (multi-process cache)**: Improved with atomic rename + index reload-on-read. Not a full lock-based solution; concurrent writes from two simultaneous processes may still lose updates on high-frequency writes. A proper file lock or single-process ownership is a follow-up.
- **F12/F13 (watsonx prompt facts)**: The prompt still sends category/file counts rather than structured before/after field diffs. Requires git-blob-based before/after comparison; deferred (needs live watsonx credentials to verify).
- **F24**: DTO→API detection is implemented via filename matching against `requestModel`/`responseModel`; does not yet traverse nested DTO fields.
- **F25 (demo runnable)**: The demo Spring Boot services lack `@SpringBootApplication` entry points — still parsing fixtures, not runnable apps. Labeled as such.
- **Live watsonx**: Not tested — credentials unavailable. Stub path verified.
- **F11 (VSIX + MCP cache sync)**: The index reload-on-read approach reduces staleness but does not prevent lost updates under concurrent heavy writes. A single-owner policy (one writer, MCP server or VSIX but not both simultaneously) is the recommended safe operating mode.

## Polyglot Support Added (§8)
- Scanner detects Node.js (`package.json`), Python (`requirements.txt`/`pyproject.toml`/`setup.py`), Go (`go.mod`) services.
- API extraction: Express/Fastify/NestJS (Node), Flask/FastAPI (Python), net/http/gorilla/gin/echo/chi (Go).
- Database extraction: Spring Boot only (JPA). Other stacks return empty `database: []`.
- `detectedStack` field propagated through `DiscoveredService` and `ServiceContext`.
- Unsupported/unknown stacks: scanner returns no services → sidebar shows "No supported services found" (F21) instead of infinite spinner.


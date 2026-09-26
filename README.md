# Bob Context Graph

> **Bob shouldn't rediscover your system every time you ask a question.**

Bob Context Graph extends **IBM Bob** with persistent, commit-aware system intelligence — allowing Bob to understand microservice APIs, database schemas, service dependencies, and the blast radius of changes **without repeatedly rediscovering the entire codebase**.

---

## The Problem

In large microservice systems, AI coding assistants like IBM Bob are asked questions that require deep architectural context:

- "How does order-service interact with the rest of the system?"
- "What would break if I change `customerId` from `INTEGER` to `UUID`?"
- "Which services call the payment API?"

Without persistent system intelligence, Bob must **re-read and re-analyze every repository every time** — a slow, expensive, and redundant process.

---

## The Solution

Bob Context Graph sits between Bob and your codebase. It:

1. **Discovers** microservice directories in your workspace automatically
2. **Analyzes** each service once — extracting REST APIs, database schema, and service dependencies
3. **Caches** the structured context against the current Git commit hash
4. **Detects** when a repository changes and **incrementally re-analyzes** only what changed
5. **Reasons** about the blast radius of changes using IBM watsonx
6. **Exposes** the system intelligence to Bob through a standard MCP server

Bob gets structured, pre-computed system knowledge instead of raw source files.

---

## Architecture

```
Developer
  │
  ▼
IBM Bob  ◄─── Bob Skill (context-graph)
  │
  ▼
MCP Client
  │
  ▼
Bob Context Graph MCP Server
  │
  ├── get_system_context()
  ├── get_service_context(service)
  ├── analyze_change(service)
  └── refresh_context(service?)
        │
        ▼
  Context Graph Engine
  ┌─────────────────────────────────┐
  │  WorkspaceScanner               │
  │  GitAnalyzer (commit detection) │
  │  SpringApiParser                │
  │  JpaEntityParser                │
  │  DependencyAnalyzer             │
  │  ContextCache (SQLite)          │
  │  ContextGraphBuilder            │
  └─────────────────────────────────┘
        │                    │
        ▼                    ▼
  IBM watsonx.ai       VS Code Extension
  (impact reasoning)   (visual graph + sidebar)
```

**VSIX = See it. MCP = Access it. Skill = Know when to use it. watsonx = Reason about it. Bob = Act on it.**

---

## How It Works

### Commit-Aware Caching

Every analyzed service is stored with its Git identity as the cache key:

```
repository + branch + commitHash  →  ServiceContext
```

When the repository hasn't changed, Bob Context Graph returns the cached context instantly — **no re-analysis required**.

### Incremental Analysis

When a commit change is detected, Bob Context Graph runs `git diff` between the old and new commits, classifies each changed file (`API`, `ENTITY`, `DTO`, `SERVICE`, `CONFIG`), and **re-analyzes only the affected sections** of the service context.

```
git diff a91fc20 c821ad3
  → Payment.java  (ENTITY)       → re-parse DB schema only
  → PaymentController.java (API) → re-parse APIs only
  → OrderService.java  (SERVICE) → re-parse dependencies only
```

Unchanged services remain cached. No redundant work.

### Impact Analysis

When a breaking change is detected, Bob Context Graph:

1. Classifies what changed (API contract, DB schema, dependency config)
2. Traverses the Context Graph to find dependent services
3. Sends a **scoped, structured prompt** to IBM watsonx — not the entire repository
4. Returns a severity-ranked impact report with migration recommendations

```
CHANGE: order-service — database schema changes (1 files, a91fc20 → c821ad3)

HIGH   payment-service
       Reason: payment-service depends on order-service and may be
               affected by database schema changes.
       Action: Review integration contracts with order-service.

HIGH   order-service Database
       Reason: Database schema changes require migration scripts.
       Action: Write and test a database migration script.

MEDIUM order-service API
       Reason: REST API contract may have changed, affecting consumers.
       Action: Verify API backward compatibility or update version.
```

---

## Repository Structure

```
bob-context-graph/
│
├── README.md
├── .env.example
│
├── demo/
│   └── microservices/
│       ├── order-service/       Spring Boot — orders, customers
│       ├── inventory-service/   Spring Boot — inventory items, warehouses
│       └── payment-service/     Spring Boot — payments
│
├── packages/
│   ├── core/                    Analysis engine (scanner, parser, cache, graph)
│   ├── watsonx/                 IBM watsonx.ai client + impact runtime
│   ├── mcp-server/              MCP server (4 tools)
│   └── vscode-extension/        VS Code VSIX (sidebar + graph webview)
│
├── .bob/
│   ├── mcp.json                 Bob MCP server configuration
│   └── skills/context-graph/
│       └── SKILL.md             Bob Skill — teaches Bob when to use Context Graph
│
└── releases/
    └── bob-context-graph-0.1.0.vsix
```

---

## IBM Bob Integration

### 1. MCP Server Configuration

Bob Context Graph ships with a ready-to-use `.bob/mcp.json`:

```json
{
  "mcpServers": {
    "bob-context-graph": {
      "type": "stdio",
      "command": "node",
      "args": ["${workspaceFolder}/packages/mcp-server/dist/index.js"],
      "env": {
        "BCG_WORKSPACE_ROOT": "${workspaceFolder}",
        "BCG_CACHE_DIR": "${workspaceFolder}/.context-graph-cache",
        "WATSONX_API_KEY": "${env:WATSONX_API_KEY}",
        "WATSONX_PROJECT_ID": "${env:WATSONX_PROJECT_ID}",
        "WATSONX_BASE_URL": "${env:WATSONX_BASE_URL}",
        "WATSONX_MODEL_ID": "${env:WATSONX_MODEL_ID}"
      }
    }
  }
}
```

When Bob opens this workspace, it automatically discovers and registers the MCP server. No manual configuration required beyond setting environment variables.

### 2. Bob Skill

The included `SKILL.md` teaches Bob:

- When to call `get_system_context()` (architecture questions)
- When to call `get_service_context(service)` (service-specific questions)
- When to call `analyze_change(service)` (impact/blast-radius questions)
- To **prefer cached context graph knowledge** before scanning source files

---

## MCP Tools

### `get_system_context()`

Returns all services, their current commits, API counts, database counts, dependency graph edges, and cache status.

**Example trigger:** *"Explain how this microservice system is organized."*

### `get_service_context(service)`

Returns detailed context for one service: identity, commit, all REST endpoints, database tables and columns, dependencies, and watsonx-generated semantic summary.

**Example trigger:** *"What APIs does inventory-service expose?"*

### `analyze_change(service)`

Detects changes since the last analysis for a service, runs `git diff`, classifies changed files, and uses watsonx to reason about blast radius and impact severity.

**Example trigger:** *"What would break if I change this database field?"*

### `refresh_context(service?)`

Forces fresh analysis of one or all services, bypassing the cache.

**Example trigger:** *"Refresh the context for order-service."*

---

## IBM watsonx Integration

watsonx is used **only for semantic reasoning** — not for basic repository discovery.

| Task | Tool |
|------|------|
| Service semantic summaries | `ibm/granite-13b-instruct-v2` |
| API semantic descriptions | `ibm/granite-13b-instruct-v2` |
| Change impact interpretation | `ibm/granite-13b-instruct-v2` |
| Severity reasoning (HIGH/MEDIUM/LOW) | `ibm/granite-13b-instruct-v2` |
| Migration recommendations | `ibm/granite-13b-instruct-v2` |

When watsonx credentials are not configured, Bob Context Graph falls back to **deterministic analysis** — impact is computed from the dependency graph without LLM reasoning. The system is fully functional without watsonx; watsonx improves the quality of semantic summaries and impact explanations.

---

## VS Code Extension

The VS Code extension provides a visual interface for the Context Graph.

### Sidebar Panels

**System Overview** — service count, API count, database count, cache statistics.

**Services** — per-service tree with status, current commit, REST APIs, database tables, dependency list, and watsonx summary.

**Impact Analysis** — severity-ranked impact report with per-component reasons and migration recommendations.

### Commands

| Command | Description |
|---------|-------------|
| `Bob Context Graph: Open System Graph` | Opens the interactive dependency graph webview |
| `Bob Context Graph: Analyze Changes` | Detects changes and runs impact analysis |
| `Bob Context Graph: Refresh All Services` | Forces fresh analysis of all services |
| `Bob Context Graph: Refresh Context` | Refreshes current workspace context |

### Graph Webview

- Service nodes (circles) and database nodes (cylinders)
- Directed dependency edges (blue = service→service, purple = service→database)
- Color-coded cache status (green = cached, orange = changed, red = error)
- Impact severity badges (H/M/L) when impact analysis is active
- Click any node for a detail panel (APIs, tables, commit, status, summary)
- Pan (drag) and zoom (scroll wheel) support

---

## Installation

### Prerequisites

- Node.js 18+
- Git
- IBM Bob with MCP support

### Step 1 — Clone and build

```bash
git clone https://github.com/your-org/bob-context-graph.git
cd bob-context-graph
npm install
npm run build
```

### Step 2 — Install the VS Code extension

**Option A — Command line:**
```bash
code --install-extension releases/bob-context-graph-0.1.0.vsix
```

**Option B — VS Code GUI:**
1. Open VS Code
2. Open the Extensions view (`Ctrl+Shift+X`)
3. Click the `...` menu → **Install from VSIX...**
4. Select `releases/bob-context-graph-0.1.0.vsix`

### Step 3 — Configure environment variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

```env
WATSONX_API_KEY=your_watsonx_api_key_here
WATSONX_PROJECT_ID=your_watsonx_project_id_here
WATSONX_BASE_URL=https://us-south.ml.cloud.ibm.com
WATSONX_MODEL_ID=ibm/granite-13b-instruct-v2
```

> watsonx credentials are optional. The system runs in deterministic mode without them.

### Step 4 — Start the MCP server

```bash
# Point BCG at the demo microservices or your own workspace
export BCG_WORKSPACE_ROOT=/path/to/your/workspace
node packages/mcp-server/dist/index.js
```

Or use the `.bob/mcp.json` configuration — IBM Bob will start the server automatically when it opens the workspace.

### Step 5 — Open the workspace in IBM Bob

Open this repository (or any workspace containing Spring Boot microservices) in IBM Bob. Bob will discover the MCP server from `.bob/mcp.json` and load the Context Graph skill from `.bob/skills/context-graph/SKILL.md`.

---

## Demo Scenario (Golden Path)

### Scene 1 — Initial analysis

Open the workspace containing the three demo microservices. Bob Context Graph discovers and analyzes them automatically. The System Graph shows:

```
order-service ──────► inventory-service
      │
      └──────────────► payment-service
```

Each service shows its REST APIs, database tables, and commit hash.

### Scene 2 — Ask Bob an architecture question

Ask Bob: *"Explain how order-service interacts with the rest of the system."*

Bob uses `get_system_context()` and `get_service_context("order-service")` — returning cached knowledge instantly without re-reading any files.

### Scene 3 — Introduce a breaking change

In `order-service`, change:
```java
// Order.java
private Integer customerId;  // before
private UUID customerId;     // after
```

Commit the change.

### Scene 4 — Incremental detection

Bob Context Graph detects:
```
order-service: a91fc20 → c821ad3
Changed files: Order.java (ENTITY)
→ DB schema re-analyzed
→ 2 services reused from cache (no re-analysis)
```

### Scene 5 — Impact analysis

Click **Analyze Changes**. The visual graph highlights `payment-service` as HIGH severity. The impact report explains why.

Ask Bob: *"Create an implementation plan to safely migrate this change."*

Bob uses `analyze_change("order-service")` + watsonx reasoning to produce a step-by-step migration plan.

---

## Demo Microservices

Three Spring Boot services in `demo/microservices/`:

| Service | APIs | Tables | Depends On |
|---------|------|--------|------------|
| `order-service` | 5 | 2 (orders, customers) | inventory-service, payment-service |
| `inventory-service` | 4 | 2 (inventory_items, warehouses) | — |
| `payment-service` | 3 | 1 (payments) | — |

---

## Limitations

- **Spring Boot only** — Java/Spring Boot REST + JPA is the only supported stack in this prototype
- **Regex-based parsing** — API and entity extraction uses regex, not a full Java AST; edge cases may be missed
- **Git required** — Services without a Git repository fall back to commit hash `"unknown"` and are always re-analyzed
- **watsonx optional** — Deterministic fallback is provided but impact explanations are less nuanced
- **No live database connections** — Schema is inferred from JPA entity annotations only

---

## Future Work (P1)

- OpenAPI / Swagger spec parsing
- Flyway / Liquibase migration detection
- API before/after diff visualization
- Database schema before/after diff
- Context token savings metrics display
- Graph animations and better icons
- Dark/light theme support
- Node.js / Gradle / Django / FastAPI stack support

---

## License

MIT

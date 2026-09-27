# BOB CONTEXT GRAPH
## Incremental System Intelligence for IBM Bob

**Tagline:**  
Bob shouldn't rediscover your system every time you ask a question.

## 1. PROJECT GOAL

Build **Bob Context Graph**, an extension of IBM Bob that provides persistent, commit-aware understanding of a microservice architecture.

The system should allow Bob to understand:

- Microservices in the current workspace
- REST APIs exposed by each service
- API contracts and relevant models
- Database entities, tables, columns, and relationships
- Dependencies between services
- Dependencies between services and databases
- Changes between Git commits
- The potential blast radius of API or database schema changes

The key optimization is that Bob should NOT repeatedly read and rediscover repositories that have not changed.

Each analyzed service should have a structured semantic context cached against its latest Git commit hash.

When the repository has not changed, Bob should reuse the cached context.

When the repository changes, the system should use Git diff to identify the changed files and update only the affected context.

IBM watsonx should be used for semantic understanding and change-impact reasoning rather than basic deterministic repository discovery.

The final system should integrate with IBM Bob through MCP and a Bob Skill while providing a visual interface through a VS Code extension distributed as a downloadable `.vsix`.

---

## 2. CORE PRODUCT CONCEPT

The architecture should conceptually work as follows:

```
Developer
→ IBM Bob
→ Bob Skill
→ MCP Client
→ Bob Context Graph MCP Server
→ Context Graph
→ Deterministic Repository Analyzer
→ IBM watsonx Runtime
```

The VS Code extension should visualize the same Context Graph.

Responsibilities:

**VSIX** — See the system.

**MCP** — Allow Bob to access the system intelligence.

**Bob Skill** — Teach Bob when and how to use the capability.

**watsonx** — Reason about semantic meaning and change impact.

**IBM Bob** — Plan and act on the resulting system intelligence.

Do NOT attempt to replace Bob's existing coding capabilities.

---

## 3. TARGET TECHNOLOGY SCOPE

For the hackathon prototype, optimize for ONE supported backend stack.

Preferred demo stack:

- Java
- Spring Boot
- PostgreSQL
- Git
- REST APIs

Minimum Spring concepts to recognize:

- `@RestController`
- `@RequestMapping`
- `@GetMapping`
- `@PostMapping`
- `@PutMapping`
- `@DeleteMapping`
- `@Entity`
- `@Table`
- `@Column`
- `@Id`
- `@ManyToOne`
- `@OneToMany`
- DTO/model references

Do NOT attempt universal programming-language support during the 14-hour build.

---

## 4. HIGH-LEVEL ARCHITECTURE

```
IBM Bob
    |
    | Bob Skill
    |
    | MCP
    v
Bob Context Graph MCP Server
    |
    +-- Git Analyzer
    |
    +-- API Analyzer
    |
    +-- Database Schema Analyzer
    |
    +-- Dependency Analyzer
    |
    +-- Context Cache
    |
    +-- Context Graph
    |
    +-- watsonx Runtime
            |
            +-- Semantic Summary
            +-- Change Interpretation
            +-- Impact Reasoning
            +-- Migration Recommendations

VS Code VSIX
    |
    +-- System Overview
    +-- Service Explorer
    +-- Dependency Graph
    +-- Change Detection
    +-- Impact Analysis
```

---

## 5. P0 — WORKSPACE DISCOVERY

Implement automatic workspace discovery.

Checklist:

- [x] Detect workspace root
- [x] Discover microservice directories
- [x] Detect Git repositories
- [x] Determine repository name
- [x] Determine current Git branch
- [x] Determine latest commit hash
- [x] Generate unique service ID
- [x] Display discovered services in VSIX
- [x] Display service analysis status

Supported statuses:

- Indexed
- Cached
- Changed
- Analyzing
- Error

Example:

```
SYSTEM OVERVIEW

3 Services

✓ order-service
  commit a91fc20
  Cached

✓ inventory-service
  commit 12ab19f
  Cached

⚠ payment-service
  commit 9ff182a
  Changed
```

---

## 6. P0 — COMMIT-AWARE SEMANTIC CACHE

This is one of the primary features.

Every analyzed service must have a structured context associated with its Git state.

Recommended cache identity:

```
repository + branch + commitHash
```

Example:

```json
{
  "service": "order-service",
  "branch": "main",
  "commit": "a91fc20",
  "summary": "...",
  "apis": [],
  "database": [],
  "dependencies": [],
  "events": []
}
```

Required behavior:

- [x] Read repository HEAD
- [x] Compare HEAD with cached commit
- [x] Cache hit → reuse existing context
- [x] Cache miss → analyze repository
- [x] Store generated context
- [x] Display cache status in VSIX
- [x] Store previous analyzed commit for incremental comparison

Example UI:

```
ORDER SERVICE

Commit:
a91fc20

Context:
✓ Cached

Files:
42

Last Analysis:
10:41:22

Estimated Context Reuse:
~31K tokens avoided
```

Any token-saving metric must be clearly presented as an estimate.

---

## 7. P0 — INCREMENTAL ANALYSIS

Do not automatically rescan an entire repository whenever HEAD changes.

Compare:

```
OLD COMMIT
a91fc20

NEW COMMIT
c821ad3
```

Use Git diff to identify changes.

Conceptually:

```
git diff --name-only a91fc20 c821ad3
```

Pipeline:

```
Commit changed
→ Git diff
→ Changed files
→ Classify files
→ Determine affected artifacts
→ Re-analyze affected context
→ Update Context Graph
→ Update cache
```

Checklist:

- [x] Detect commit change
- [x] Calculate Git diff
- [x] Identify changed files
- [x] Classify changed files
- [x] Determine whether API is affected
- [x] Determine whether database schema is affected
- [x] Determine whether service dependency is affected
- [x] Re-analyze changed service only
- [x] Preserve unaffected service contexts
- [x] Update cache
- [x] Update Context Graph

---

## 8. P0 — API INTELLIGENCE

Extract REST APIs from each supported Spring Boot service.

Example:

```
Order Service

GET    /orders/{id}
POST   /orders
PUT    /orders/{id}
DELETE /orders/{id}
```

For each endpoint, attempt to capture:

- HTTP method
- Endpoint path
- Controller
- Request model
- Response model
- Related service dependencies
- Related database entities
- Semantic description

Checklist:

- [x] Detect REST controllers
- [x] Detect HTTP methods
- [x] Detect endpoint paths
- [x] Detect request models where possible
- [x] Detect response models where possible
- [x] Associate API with service
- [x] Associate API with relevant entity where possible
- [x] Generate short semantic description using watsonx

Example semantic description:

> "Creates an order, validates inventory availability, persists the order, and initiates payment."

---

## 9. P0 — DATABASE SCHEMA INTELLIGENCE

Extract basic database structure from Spring/JPA entities.

Example:

```
orders

├── id : UUID
├── customer_id : INTEGER
├── product_id : UUID
├── quantity : INTEGER
└── status : VARCHAR
```

Checklist:

- [x] Detect JPA entities
- [x] Detect table names
- [x] Detect columns
- [x] Detect basic data types
- [x] Detect primary keys where possible
- [x] Detect entity relationships
- [x] Associate tables with services
- [x] Store database schema in ServiceContext
- [x] Add database nodes to Context Graph

Advanced Flyway/Liquibase support is P1, not required for P0.

---

## 10. P0 — SERVICE CONTEXT MODEL

Each service should produce a normalized ServiceContext.

Conceptual structure:

```
ServiceContext

├── identity
│   ├── serviceId
│   ├── repository
│   ├── branch
│   └── commitHash
│
├── APIs
│   ├── endpoints
│   ├── requestSchemas
│   └── responseSchemas
│
├── Database
│   ├── tables
│   ├── columns
│   └── relationships
│
├── Dependencies
│   ├── upstream
│   └── downstream
│
├── Events
│   ├── publishes
│   └── consumes
│
└── semanticSummary
```

Events can remain minimal or empty for the P0 demo if necessary.

---

## 11. P0 — SYSTEM CONTEXT GRAPH

Combine all ServiceContexts into a System Context Graph.

Example:

```
                  ORDER
                 SERVICE
                 /     \
                /       \
               v         v
        INVENTORY      PAYMENT
         SERVICE       SERVICE
            |             |
            v             v
       inventory_db   payment_db

              |
              v
           orders_db
```

Required node types:

- Service
- Database

Optional P1 node types:

- API
- Event
- Table

Required edges:

- Service → Service dependency
- Service → Database ownership/use

Checklist:

- [x] Build graph from ServiceContexts
- [x] Create service nodes
- [x] Create database nodes
- [x] Create dependency edges
- [x] Create database edges
- [x] Render graph in VSIX
- [x] Support zoom
- [x] Support pan
- [x] Make nodes clickable
- [x] Display selected node information
- [x] Visually distinguish services and databases

The graph can be read-only. Do NOT build a graph editor.

---

## 12. P0 — CHANGE IMPACT ANALYSIS

This is the primary AI feature.

Example change:

```
orders.customer_id

INTEGER
→
UUID
```

Pipeline:

```
Git Diff
→ Change Detector
→ Context Graph
→ Retrieve Related Nodes
→ Structured Change Context
→ watsonx Runtime
→ Impact Reasoning
→ Bob + VSIX
```

Expected output:

```
CHANGE IMPACT

Change:
orders.customer_id
INTEGER → UUID

HIGH
payment-service

Reason:
OrderCreatedEvent currently expects an INTEGER customerId.

MEDIUM
Order REST API

Reason:
The customer identifier is exposed through the API contract.

LOW
Frontend

Reason:
The frontend already represents customer identifiers as strings.
```

Checklist:

- [x] Detect API changes
- [x] Detect database schema changes
- [x] Identify affected graph nodes
- [x] Retrieve related service contexts
- [x] Construct scoped watsonx prompt/context
- [x] Generate impact explanation
- [x] Generate severity
- [x] Explain WHY a component is affected
- [x] Suggest affected components/files where possible
- [x] Generate migration recommendations

Severity levels: **HIGH**, **MEDIUM**, **LOW**

Severity must include an explanation rather than only a label.

---

## 13. P0 — IBM WATSONX RUNTIME

watsonx must NOT be responsible for basic deterministic repository discovery when conventional tooling can do it more reliably.

Do NOT use:

```
Entire Repository → LLM → "Figure everything out"
```

Prefer:

```
Git + Parser + Structured Extraction
→ Structured Facts
→ Context Graph
→ Scoped Context
→ watsonx
→ Semantic Reasoning
```

watsonx responsibilities:

- [x] Service semantic summaries
- [x] API semantic descriptions
- [x] Change interpretation
- [x] Impact reasoning
- [x] Severity reasoning
- [x] Human-readable explanations
- [x] Migration/change recommendations

The project should demonstrate that watsonx receives relevant scoped context instead of unnecessarily receiving the entire repository.

---

## 14. P0 — MCP SERVER

MCP is the primary integration contract between Bob and Bob Context Graph.

Minimum required MCP tools:

### `get_system_context()`

Returns:

- Services
- Current commit hashes
- Service relationships
- Database relationships
- System summary

### `get_service_context(service)`

Returns:

- Service identity
- Commit
- APIs
- Database schema
- Dependencies
- Semantic summary

### `analyze_change(service)`

Performs:

- Git diff
- Change classification
- Dependency lookup
- watsonx impact reasoning

Returns:

- Detected changes
- Affected components
- Severity
- Reasoning
- Recommended actions

### `refresh_context(service?)`

Allows Bob to explicitly refresh system intelligence.

- Refresh one service
- Optionally refresh all services
- Update cache
- Update graph

Optional MCP tools:

- `get_dependency_graph()`
- `get_database_schema()`
- `get_api_contract()`

Do not prioritize optional MCP tools until the four primary tools work.

---

## 15. P0 — IBM BOB MCP CONFIGURATION

The repository should include project-level Bob configuration.

Target:

```
.bob/
└── mcp.json
```

Configure Bob Context Graph MCP server so a developer cloning the repository can configure/run the integration with minimal manual work.

Checklist:

- [x] Include `.bob/mcp.json`
- [x] Document required environment variables
- [x] Document watsonx credentials configuration
- [ ] Document MCP startup procedure
- [ ] Verify Bob discovers the MCP tools

Never commit credentials to Git.

---

## 16. P0 — BOB SKILL

Create:

```
.bob/
└── skills/
    └── context-graph/
        └── SKILL.md
```

The Skill should teach Bob that when a developer asks about:

- Architecture
- Microservice relationships
- API dependencies
- Database schema dependencies
- Breaking changes
- Change impact
- Blast radius
- Migration planning

Bob should query Bob Context Graph before independently rediscovering the entire repository.

Desired behavior:

> "When architectural or change-impact context is required, first query Bob Context Graph MCP. Prefer cached system context. Use `get_system_context()` for architecture questions. Use `get_service_context(service)` for service-specific questions. Use `analyze_change(service)` when evaluating a Git/API/database change. Inspect raw source code only when implementation-level details unavailable from the context graph are required."

Checklist:

- [x] Create Skill
- [x] Describe appropriate triggers
- [x] Describe available MCP tools
- [x] Tell Bob to prefer cached context
- [ ] Test at least one architecture question
- [ ] Test at least one impact-analysis question

---

## 17. P0 — VS CODE EXTENSION / VSIX

The VS Code extension is the visual interface for developers. It is NOT the primary Bob integration layer.

Responsibilities:

- Display system state
- Display services
- Display cache state
- Display dependency graph
- Display detected changes
- Display impact analysis

Minimum sidebar:

```
BOB CONTEXT GRAPH

SYSTEM

● 3 services
● 7 APIs
● 3 databases

SERVICES

✓ order-service
✓ inventory-service
✓ payment-service

IMPACT ANALYSIS

⚠ 2 HIGH
⚠ 1 MEDIUM
✓ 1 LOW

[ Open System Graph ]

[ Analyze Changes ]

[ Refresh Context ]
```

Checklist:

- [x] VS Code activity/sidebar entry
- [x] Service list
- [x] Service status
- [x] Current commit display
- [x] Open System Graph action
- [x] Analyze Changes action
- [x] Refresh Context action
- [x] Impact summary

---

## 18. P0 — GRAPH WEBVIEW

Create a visual dependency graph inside VS Code.

Example:

```
┌──────────────────────────────────────────────────┐
│ Bob Context Graph              HEAD: c821ad3     │
├──────────────────────────────────────────────────┤
│                                                  │
│                   ORDER                          │
│                  SERVICE                         │
│                  /      \                        │
│                 /        \                       │
│                v          v                      │
│          INVENTORY      PAYMENT                  │
│              │             │                     │
│              v             v                     │
│           INV DB       PAYMENT DB                │
│                                                  │
├──────────────────────────────────────────────────┤
│ Selected: Order Service                          │
│                                                  │
│ APIs:       4                                    │
│ Tables:     1                                    │
│ Depends on: 2                                    │
│ Commit:     c821ad3                              │
│ Context:    ✓ Cached                             │
└──────────────────────────────────────────────────┘
```

Checklist:

- [x] Render graph
- [x] Service nodes
- [x] Database nodes
- [x] Dependency edges
- [x] Click node
- [x] Detail panel
- [x] Zoom
- [x] Pan
- [x] Cached/change status
- [x] Impact highlighting

Prioritize visual clarity over advanced customization.

---

## 19. P0 — IMPACT VISUALIZATION

When a breaking change is detected, visually highlight affected components.

Example:

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

Impact panel:

```
BREAKING CHANGE

customerId

INTEGER
→
UUID

HIGH
Payment Service

MEDIUM
Order API

LOW
Frontend
```

The visual impact graph should be one of the primary demo moments.

---

## 20. P1 — ONLY IF ALL P0 FEATURES WORK

Optional improvements:

- [ ] Highlight affected graph paths
- [ ] API before/after diff
- [ ] Database schema before/after diff
- [ ] Estimated context/token savings
- [ ] Analysis history
- [ ] Event/message dependencies
- [ ] OpenAPI parser
- [ ] Flyway migration detection
- [ ] Liquibase migration detection
- [ ] Export architecture as Markdown
- [ ] Better loading states
- [ ] Better icons
- [ ] Dark/light theme support
- [ ] Graph animations

Do not start P1 until the complete golden path works.

---

## 21. P2 — EXPLICITLY OUT OF SCOPE

Do NOT spend hackathon time implementing:

- Kubernetes discovery
- Docker runtime discovery
- Kafka runtime inspection
- Live database connections
- Distributed tracing
- Production monitoring
- Authentication
- Multi-user support
- Cloud deployment
- Universal language support
- Autonomous code modification outside Bob
- Marketplace publishing
- Vector database unless absolutely necessary
- Sophisticated RAG architecture
- Universal AST support

IBM Bob already provides coding capabilities. Bob Context Graph should provide system intelligence to Bob, not rebuild Bob.

---

## 22. REPOSITORY STRUCTURE

Target monorepo:

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
│   │
│   └── skills/
│       └── context-graph/
│           └── SKILL.md
│
└── releases/
    └── bob-context-graph-0.1.0.vsix
```

Adjust the exact structure if the implementation framework requires it, but preserve clear separation between: core analysis / watsonx / MCP / Bob integration / VS Code UI.

---

## 23. VSIX DISTRIBUTION

Marketplace publication is NOT required.

The VS Code extension must be packaged as:

```
bob-context-graph-0.1.0.vsix
```

The `.vsix` should be attached to a GitHub Release.

Installation should be possible using:

```
code --install-extension bob-context-graph-0.1.0.vsix
```

Also document GUI installation using VS Code's "Install from VSIX" functionality.

Checklist:

- [x] Build extension
- [x] Package VSIX
- [ ] Test local installation
- [ ] Create GitHub Release
- [ ] Attach VSIX
- [x] Add installation documentation

---

## 24. 14-HOUR IMPLEMENTATION SCHEDULE

| Hours | Focus |
|-------|-------|
| 0–1   | Repository setup, demo microservices, MCP skeleton, VSIX skeleton |
| 1–3   | Git scanner, repository discovery, commit detection, semantic cache |
| 3–5   | Spring API extraction, JPA/database extraction |
| 5–6   | ServiceContext model, System Context Graph |
| 6–8   | watsonx integration, semantic summaries, change interpretation, impact reasoning |
| 8–9.5 | MCP server: get_system_context, get_service_context, analyze_change, refresh_context |
| 9.5–10 | Bob Skill, `.bob/mcp.json`, Bob integration testing |
| 10–12 | VSIX UI, service explorer, dependency graph |
| 12–13 | Impact visualization, visual polish |
| 13–13.5 | End-to-end golden-path testing, fix demo-breaking bugs |
| 13.5–14 | README, screenshots, package VSIX, GitHub Release, demo rehearsal |

**HARD RULE:** At Hour 10, stop adding major backend features. Use the remaining time to make the existing features reliable and visually impressive.

---

## 25. GOLDEN-PATH DEMO

The entire implementation should prioritize this demo scenario.

### SCENE 1 — PROBLEM

Explain: "Large microservice systems force AI coding agents to repeatedly rediscover architecture and dependencies."

### SCENE 2 — INITIAL SYSTEM UNDERSTANDING

Open Bob Context Graph. Show 3 Services, 7 APIs, 3 Databases. Display dependency graph.

### SCENE 3 — ASK BOB

Developer asks: "Bob, explain how order-service interacts with the rest of the system."

Expected flow: Bob → Context Graph Skill → MCP → Cached Context Graph → Bob response

### SCENE 4 — INTRODUCE BREAKING CHANGE

Change `private Integer customerId;` to `private UUID customerId;`. Commit the change.

### SCENE 5 — INCREMENTAL INTELLIGENCE

Bob Context Graph detects:

```
CHANGE DETECTED
order-service
a91fc20 → c821ad3
1 service changed
2 services reused from cache
```

### SCENE 6 — IMPACT ANALYSIS

Click "Analyze Impact". Visual graph highlights payment-service as HIGH. Impact report generated by watsonx.

### SCENE 7 — BOB COMPLETES THE LOOP

Ask: "Bob, create an implementation plan to safely migrate this change."

Bob uses Bob Context Graph MCP + watsonx impact reasoning to produce the migration plan.

This demonstrates that Bob Context Graph does not replace Bob — it extends Bob's understanding of the system.

---

## 26. FINAL DELIVERABLE CHECKLIST

- [ ] Public GitHub repository
- [x] Clear README
- [x] Architecture diagram
- [ ] Screenshot or GIF of dependency graph
- [x] Working demo microservices
- [x] Workspace discovery
- [x] Git commit detection
- [x] Commit-aware semantic cache
- [x] Incremental analysis
- [x] API extraction
- [x] Database schema extraction
- [x] ServiceContext generation
- [x] System Context Graph
- [x] watsonx Runtime integration
- [x] Change-impact analysis
- [x] Working MCP server
- [x] `get_system_context()`
- [x] `get_service_context()`
- [x] `analyze_change()`
- [x] `refresh_context()`
- [x] `.bob/mcp.json`
- [x] Bob `SKILL.md`
- [x] Working VS Code extension
- [x] Visual dependency graph
- [x] Visual impact analysis
- [x] Working `.vsix`
- [ ] GitHub Release containing `.vsix`
- [x] Installation instructions
- [ ] Tested golden-path demo
- [ ] 2–3 minute demo rehearsal

If all of these are complete, STOP adding features. Spend remaining time improving reliability, presentation, graph readability, impact visualization, README clarity, and demo speed.

---

## 27. PRODUCT POSITIONING

Primary description:

> "Bob Context Graph extends IBM Bob with persistent, commit-aware system intelligence, allowing Bob to understand microservice APIs, database schemas, dependencies, and the blast radius of changes without repeatedly rediscovering the entire codebase."

Short pitch:

> "Bob shouldn't rediscover your system every time you ask a question."

Alternative pitch:

> "Your code tells Bob what exists. Bob Context Graph tells Bob what depends on it and what could break."

Core architecture message:

- **VSIX = See it.**
- **MCP = Access it.**
- **Skill = Know when to use it.**
- **watsonx = Reason about it.**
- **Bob = Act on it.**

---

## 28. IMPLEMENTATION PRINCIPLE

Prioritize, in this order:

1. Working end-to-end integration
2. Change-impact analysis
3. Commit-aware caching
4. Dependency visualization
5. Bob integration
6. Visual polish
7. Additional features

Whenever there is a choice between building another feature and improving the golden-path demo, improve the golden-path demo.

The hackathon prototype does not need to solve every microservice architecture problem. It needs to convincingly demonstrate one idea:

**IBM Bob can maintain persistent knowledge of a microservice system, incrementally update that knowledge when the code changes, and use watsonx to reason about the impact of those changes before the developer acts.**

---
name: context-graph
description: Bob Context Graph — Persistent, commit-aware system intelligence for microservice architectures
version: 1.0.0
triggers:
  - architecture
  - microservice
  - service dependencies
  - API dependencies
  - database schema
  - breaking change
  - blast radius
  - change impact
  - migration planning
  - how does * work
  - what depends on
  - what would break
  - impact analysis
---

# Bob Context Graph Skill

## Purpose

Bob Context Graph provides IBM Bob with **persistent, commit-aware system intelligence** about a microservice workspace. Instead of repeatedly scanning every repository for architecture questions, Bob should query the Context Graph first and use cached, structured system knowledge.

> Bob shouldn't rediscover your system every time you ask a question.

## When to use this skill

Use Bob Context Graph MCP tools when the developer asks about:

- **System architecture**: How services are connected, which services exist, what APIs they expose
- **Service relationships**: What a specific service depends on, what depends on it
- **API contracts**: What endpoints a service exposes, what models they use
- **Database schemas**: What tables exist, what columns and relationships they have
- **Breaking changes**: What would break if an API or database field changes
- **Blast radius**: Which services are affected by a change in another service
- **Change impact**: Analysis of a Git commit's downstream effects
- **Migration planning**: What steps are needed to safely deploy a breaking change

## Available MCP Tools

### `get_system_context()`
**Use for:** Architecture overview questions, system topology, understanding service relationships at a high level.

Returns:
- All discovered services with status (Cached/Changed/Indexed)
- Current commit hashes
- API counts per service
- Service → Service dependency graph
- Service → Database relationships
- System-level summary

Example triggers:
- "Explain how this system is organized"
- "What microservices exist in this workspace?"
- "How do these services relate to each other?"
- "Give me an architecture overview"

---

### `get_service_context(service: string)`
**Use for:** Deep understanding of a specific service — its APIs, database, dependencies, and semantic summary.

Returns:
- Service identity and current Git commit
- All REST endpoints (method, path, request/response models)
- Database tables and columns
- Upstream and downstream dependencies
- Semantic description of the service's purpose
- Estimated token savings from cache reuse

Example triggers:
- "Explain how order-service works"
- "What APIs does inventory-service expose?"
- "What database tables does payment-service use?"
- "What does order-service depend on?"

---

### `analyze_change(service: string)`
**Use for:** Understanding the impact of recent code changes. Runs Git diff + watsonx impact reasoning.

Returns:
- Changed commit (old → new)
- Changed files with categories (API/ENTITY/DTO/SERVICE/CONFIG)
- Whether APIs, database schema, or dependencies are affected
- Impact report with severity (HIGH/MEDIUM/LOW) per affected component
- Reasons WHY each component is affected
- Migration recommendations

Example triggers:
- "What changed in order-service?"
- "What is the blast radius of this change?"
- "Which services are affected by this commit?"
- "Analyze the impact of this database change"
- "What would break if I change this field?"

---

### `refresh_context(service?: string)`
**Use for:** Explicitly forcing a fresh analysis when context may be stale.

- If `service` is provided, refreshes only that service
- If omitted, refreshes all services
- Bypasses the cache and re-runs the full analysis pipeline

Use sparingly — prefer cached context. Only call `refresh_context` if the developer explicitly requests fresh analysis or if the context appears incorrect.

---

## Workflow: Architecture Questions

1. Call `get_system_context()` to understand overall topology
2. Call `get_service_context(service)` for service-specific detail
3. Use the structured context in your response — do NOT scan source files for information already in the context graph
4. Only inspect source code when implementation-level detail is needed that isn't captured in the context (e.g., reading a specific algorithm)

## Workflow: Change Impact Questions

1. Call `analyze_change(service)` to get the impact report
2. Inspect the `impacts` array — each entry has component, severity, and reason
3. If the impact report is empty or the context seems stale, call `refresh_context(service)` first
4. Use the impact report + migration recommendations in your response

## Workflow: Migration Planning

1. Call `analyze_change(service)` to understand what changed
2. Call `get_service_context(service)` for each HIGH/MEDIUM severity affected service
3. Use the structured API and database context to create a specific, actionable migration plan
4. Reference specific endpoints, tables, and columns from the context — don't guess

## Cache Preference

**Always prefer cached context.** The Context Graph is designed to avoid redundant work. If the cache shows the service as "Cached" at the current commit, the context is reliable — do not rescan the repository.

Only call `refresh_context` if:
- The developer explicitly asks for fresh analysis
- You detect inconsistency between the context and what you can observe in source files
- The service status is "Error"

## Boundary: What Bob Context Graph does NOT replace

Bob Context Graph provides **system intelligence** — it does NOT replace Bob's coding capabilities.

- For implementation changes → use Bob's normal code editing tools
- For specific algorithm questions → read the source files
- For test generation → use Bob's normal capabilities
- For CI/CD pipeline questions → use Bob's normal tools

Use Bob Context Graph to **understand** the system. Use Bob to **change** it.

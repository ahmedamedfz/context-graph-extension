# Bob Context Graph

Understand your microservices and assess the impact of a change without leaving your editor.

**Bob Context Graph** is a VS Code extension for exploring service APIs, database schemas and dependencies in an interactive system graph. It builds persistent context from your source code, tracks changes against a Git baseline and helps you identify components that may need attention before you ship. Use it in VS Code or a compatible IBM Bob build, or access the shared context engine through MCP.

## What you can do

- **Explore your architecture:** discover services and inspect their APIs, storage and connections from one sidebar.
- **Review change impact:** analyze working-tree changes, inspect severity-labeled findings and review migration recommendations.
- **Keep context between sessions:** reuse parsed service context in a workspace-scoped, versioned JSON cache.
- **Choose how to reason:** use deterministic analysis, bundled offline IBM Granite or IBM watsonx.ai.
- **Share context with AI tools:** query system context, service details and change impact through the MCP server.

## Demo: from source code to change impact

Try the included [three-service demo](demo/microservices) with the [step-by-step walkthrough](demo/README.md). No running services or databases are needed: the extension reads source files.

1. Open an isolated copy of the demo and choose **Skip for now** for deterministic analysis.
2. Open **Bob Context Graph: Open System Graph** to explore `order-service`, `payment-service` and `inventory-service`.
3. Select a service or database node to inspect endpoints or table columns.
4. Change the payment processing route and run **Bob Context Graph: Analyze Changes**.
5. Review the payment change and its related components in **Impact Analysis**, then undo the edit and analyze again.

The fixture contains **3 services, 18 APIs, 5 tables, 3 databases and 2 service dependency edges**. The walkthrough includes a clean Git baseline, the exact edit and a short presentation script.

## Run locally

```sh
npm ci
npm run build
npm test
```

`npm test` runs unit, lifecycle and real MCP stdio acceptance tests. Optional: set `BCG_DEMO_ROOT` to a copy or read-only checkout of the five-language demo to include its 12-application acceptance check. Audit failures cause a nonzero exit. Test evidence is written to a temporary directory printed at completion.

## Offline Granite extension

```sh
npm run build:vsix
```

The packaging step downloads and SHA-256-verifies **IBM Granite 4.2 3B Q4_K_M** (2,244,011,552 bytes) and **llama.cpp b11206** using pinned sources in `scripts/granite-bundle.json`. Model weights and native binaries are ignored by Git but included in the VSIX. No Ollama, Python or separate daemon is required on the user's computer. The generated package is **macOS Apple Silicon only** (`darwin-arm64`); allow several GB of available RAM for inference.

Install `packages/vscode-extension/bob-context-graph-0.2.0-darwin-arm64.vsix` using **Extensions: Install from VSIX**. Open a workspace, then choose **Local IBM Granite 4.2 3B** in **Bob Context Graph: Configure AI Provider**. After installation, local inference works offline. The extension starts its own model process on a private Unix socket and stops it when disabled or deactivated. The setup progress supports cancellation. Cloud watsonx and deterministic modes remain available.

Use **Open System Graph**, select service/database nodes for all endpoints and columns, and run **Analyze Changes**. File/Git watchers refresh the sidebar and open graph. Skip is remembered across activation. Cloud credentials are stored using VS Code SecretStorage.

## MCP

Configure your MCP client with a Node command and explicit environment variables:

```json
{
  "mcpServers": {
    "context-graph": {
      "command": "node",
      "args": ["/absolute/path/context-graph-extension/packages/mcp-server/dist/index.js"],
      "env": {
        "BCG_WORKSPACE_ROOT": "/absolute/path/microservices",
        "BCG_CACHE_DIR": "/absolute/path/cache"
      }
    }
  }
}
```

Tools: `get_system_context`, `get_service_context`, `analyze_change`, `refresh_context`. Canonical service IDs take precedence; ambiguous display names return candidate IDs. Protocol output is JSON on stdout; diagnostics go to stderr. The standalone MCP process uses deterministic analysis by default. Set `WATSONX_API_KEY`, `WATSONX_PROJECT_ID`, optionally `WATSONX_BASE_URL` and `WATSONX_MODEL_ID` for cloud reasoning. `.env` files are not loaded automatically. The bundled local model is managed by the extension, not automatically by the standalone MCP server.

## Snapshot semantics

- Current HEAD, branch and relevant working-tree contents determine freshness. Untracked files, repeated same-length edits, deletes and both sides of renames are included; internal cache files are excluded.
- The preceding indexed HEAD is the comparison baseline. Repeated queries, targeted/full refresh and process restart retain it at the same HEAD. A later distinct HEAD advances the baseline to the preceding indexed HEAD.
- Dirty field comparisons read the baseline Git snapshot and the current working tree. Historical dirty-to-dirty field snapshots are not retained.
- Unchanged services reuse parsed payloads. Non-Git workspaces are rescanned on requests. Topology fingerprints still scan marker files; they avoid full rediscovery, not all filesystem traversal.
- Context files and metadata use atomic replacement. Index updates use a cross-process lock. Incompatible parser versions and corrupt files are reanalyzed. Shared cache directories isolate workspaces.

## Extraction and limits

Adapters cover Spring controllers/JPA; Express/Fastify/Nest; native Node HTTP route tables; Flask/FastAPI; Go HTTP routers; JDK HttpServer; and PHP front controllers with Dockerfiles or Composer manifests. Explicit source URLs and per-service Compose environment URLs provide dependency evidence; YAML anchors are supported. Infrastructure images are not counted as application services.

Extraction uses static patterns, not complete language ASTs or execution. Java field schemas and endpoint model links are partial; unresolved models are `null`, and unsupported event extraction is labeled. `ANY` marks native routes without a resolved method restriction. Dynamic routes, indirect configuration and arbitrary framework conventions may be missed. PostgreSQL/Redis usage does not imply that their full database schemas were extracted. AI receives structured context and field changes, not full source/configuration files. Malformed/unavailable AI falls back to labeled deterministic results.

The Spring demo in `demo/microservices` has 3 services, 18 APIs, 5 tables, 3 databases and 2 service dependency edges. The separate five-language demo has been evaluated without modifying its source; see `COMPLETION_REPORT.md` for evidence and remaining verification limits.

## Layout

- `packages/core`: scanner, parsers, Git/cache lifecycle, schemas, graph.
- `packages/watsonx`: cloud and bundled local inference clients; deterministic impact fallback.
- `packages/mcp-server`: shared engine through MCP stdio.
- `packages/vscode-extension`: sidebar, graph, settings and AI lifecycle.
- `test`: lifecycle and integration acceptance suites.
- `scripts/prepare-granite.cjs`: reproducible offline assets, checksums and licenses.

Extension code: MIT. [IBM Granite model](https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF): Apache 2.0. [llama.cpp runtime](https://github.com/ggml-org/llama.cpp): MIT. Bundled licenses and provenance ship with the extension.

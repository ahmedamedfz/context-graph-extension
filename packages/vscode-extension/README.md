# Bob Context Graph

Understand your microservices and assess the impact of a change without leaving your editor.

**Bob Context Graph** turns source code into an interactive map of service APIs, database schemas and dependencies. Explore your architecture, inspect changes against a Git baseline and review potentially affected components from one VS Code sidebar. Use deterministic analysis or add reasoning with offline IBM Granite or IBM watsonx.ai.

## Features

- **Interactive system graph:** select service and database nodes to inspect endpoints, table columns and connections.
- **Service explorer:** browse discovered services and their extracted context.
- **Change impact analysis:** review severity-labeled findings and migration recommendations for changed services.
- **Persistent context:** reuse parsed results across sessions with a workspace-scoped cache.
- **Optional AI:** choose local Granite, cloud watsonx.ai or deterministic analysis.

## Quick start

This macOS Apple Silicon package includes **IBM Granite 4.2 3B Q4_K_M** and **llama.cpp**. No Ollama, Python, separate server or first-run download is required. The model occupies 2.24 GB on disk; the full extension is larger. Allow several GB of available memory for local inference.

1. Install the `darwin-arm64` VSIX in VS Code or a compatible IBM Bob build.
2. Open your microservices workspace.
3. Choose **Local IBM Granite 4.2 3B** in **Bob Context Graph: Configure AI Provider**. The model loads in a background process owned by the extension. Loading can be cancelled.
4. Open **Bob Context Graph: Open System Graph**. Select nodes to inspect all endpoints and table columns. **Analyze Changes** refreshes source context and compares it to the retained Git baseline.

You can instead choose IBM watsonx.ai (credentials stored in SecretStorage) or deterministic analysis. Choosing Skip is remembered. Source analysis works while the AI setup dialog is open. Switching to deterministic mode stops local inference.

## Try the demo

The repository includes a three-service Spring fixture: `order-service` calls `payment-service` and `inventory-service`. It contains 18 APIs, 5 tables and 3 databases. No application servers or databases need to run.

Follow the [demo walkthrough](https://github.com/ahmedamedfz/context-graph-extension/blob/main/demo/README.md) to create an isolated demo workspace and a clean Git baseline, then:

1. Choose **Skip for now** in the AI setup and open **Bob Context Graph: Open System Graph**.
2. Inspect the payment endpoints and database columns.
3. In `payment-service/src/main/java/com/demo/payment/controller/PaymentController.java`, change `@PostMapping("/process")` to `@PostMapping("/process-v2")` and save.
4. Run **Bob Context Graph: Analyze Changes** and inspect **Impact Analysis**. Review `order-service` as a caller of the changed payment API.
5. Undo the edit, save and analyze again to return to the baseline.

Findings are static-analysis guidance; they do not prove runtime compatibility. Exact wording and severity can differ by AI provider.

## Commands

Open the Command Palette and search for **Bob Context Graph**:

| Command | Purpose |
| --- | --- |
| Open System Graph | Explore the architecture and inspect nodes. |
| Analyze Changes | Refresh context and analyze changes against the retained Git baseline. |
| Refresh Context | Refresh workspace context. |
| Refresh All Services | Reanalyze every discovered service. |
| Configure AI Provider | Choose local Granite, cloud watsonx.ai or Skip for now. |

## Supported source patterns and limitations

Supported extraction patterns: Spring controllers/JPA, Express/Fastify/Nest route declarations, native Node HTTP route tables, Flask/FastAPI, Go HTTP routers, Java HttpServer and PHP front controllers. This is static pattern analysis, not whole-program execution. `ANY` means the native handler has no resolved method restriction. Unknown schemas and unsupported event extraction are labeled explicitly.

## Git-aware context

Git updates include staged, unstaged, untracked, deleted and renamed files. The JSON cache is scoped to the workspace and parser version. The comparison baseline is the preceding indexed HEAD; repeated reads and refreshes at the same HEAD retain that baseline. Dirty edits compare the working tree with that baseline; historical dirty-to-dirty field diffs are not stored.

## Configuration

Settings: `bcg.workspaceRoot`, `bcg.cacheDir`, `bcg.aiProvider`, `bcg.watsonxBaseUrl`, `bcg.watsonxModelId`. No `.env` file is loaded automatically. For the standalone MCP server, set environment variables explicitly.

## Platform and licenses

The offline bundle is platform-specific. Windows, Linux and Intel Mac binaries are not included in this release. Cloud watsonx inference requires your own account and network connection.

Model: [IBM Granite GGUF](https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF), Apache 2.0. Runtime: [llama.cpp](https://github.com/ggml-org/llama.cpp), MIT. See `THIRD_PARTY_NOTICES.md` and the bundled licenses.

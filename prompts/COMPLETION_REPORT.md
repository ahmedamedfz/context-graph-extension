# Completion report — 27 September 2026

The previous agent's pending correctness work has been continued and an installable offline Granite VSIX has been produced. **85 automated checks passed, zero failed.** Real Granite text/JSON inference also passed using the assets extracted by VS Code from the final VSIX. This does not claim exhaustive parser support or live graph UI acceptance.

## Deliverable

- `packages/vscode-extension/bob-context-graph-0.2.0-darwin-arm64.vsix`
- Target: **macOS Apple Silicon**, VS Code 1.85+ compatible API. Installation verified on VS Code 1.137.0 arm64. IBM Bob installation was not repeated.
- Size: **2,229,165,506 bytes** (2.23 GB decimal).
- SHA-256: `4bfb5851b47339b3dd46d0f678e2e71f62d709eeb32c10c9b608337a524697a8`
- The code bundle extracted by VS Code matches the build: `1bb53da72d9ece9b07decc4b09110ce0b80b3e9dc1484fc811b9dcd47cb61c3b`.
- Base source commit: `124ec0d226f94b11f1f5cd6ef9a62e96b954e3ed`; changes remain uncommitted. Exact source file hashes: `artifacts/verification/source-files.sha256`.

Install the VSIX, open a trusted workspace, then run **Bob Context Graph: Configure AI Provider → Local IBM Granite 4.2 3B**. No Ollama or first-run model download is required. Full model weights, native runtime, dynamic libraries and licenses are inside the package. The model is not stored in Git; packaging retrieves it reproducibly from pinned official sources.

## Granite verification

The bundle contains [IBM's Granite 4.2 3B Q4_K_M GGUF](https://huggingface.co/ibm-granite/granite-4.2-3b-GGUF), revision `c40945d71cd90f249a56985e8155551a9188dc30`, and [llama.cpp b11206](https://github.com/ggml-org/llama.cpp/releases/tag/b11206).

The installed model SHA-256 is `e0406663965846ae22a403456eb826ccce5f450840491f71952f18a7cb78e7d5`, matching IBM's published LFS object. Installed-asset inference returned `Granite is running locally.` and `{"local":true,"model":"Granite"}`. Loading plus both requests took approximately 20.3 seconds on this machine; this is a smoke test, not a benchmark. The child process exited after disposal.

The extension launches the bundled runtime through argument-based process spawning, uses a private socket in a restricted temporary directory, supplies an ephemeral API key, disables the web UI and avoids inherited llama configuration overrides. Loading has cancellation and a timeout. Switching provider/deactivation disposes the runtime. Brief summaries disable model thinking to preserve the response token budget.

VSCE's text secret scanner cannot read a file over 2 GiB. Packaging therefore runs standard VSCE validation on the compiled application, then streams only the verified official binary assets and licenses into the final archive. Application secret scanning remains enabled. Installation of this final archive succeeded.

## Test evidence

Command: `BCG_DEMO_ROOT=/Users/ahmadfariz/Projects/codex/microservices-demo npm test`

| Suite | Result |
|---|---:|
| Existing core regressions | 28/28 |
| Lifecycle and controlled VS Code API tests | 9/9 |
| Source/graph/MCP acceptance assertions | 48/48 |
| Total automated assertions/tests | **85/85** |

Additional checks: full TypeScript/esbuild build; generated webview JavaScript syntax; `git diff --check`; final VSIX installation; installed code/model hashes; actual installed-model text and JSON inference; child-process shutdown.

The real MCP stdio tests cover warm reuse, two successive dirty edits, committed impact, targeted refresh, process restart, unaffected services, ambiguous names and non-Git freshness. Test fixtures are disposable copies. The external five-language demo source was only read.

The Spring demo remains 3 services, 18 APIs, 5 tables, 3 database nodes and 2 service edges. The five-language evaluation now finds **12 applications, 47 route entries, 19 service edges and 6 storage edges**. Those edges are derived from literal source references, proxy route tables and Compose environment URLs. Redis and PostgreSQL are represented as storage; infrastructure containers are not counted as applications. Some unrestricted native handlers use `ANY` instead of an invented HTTP verb.

Evidence directory: `artifacts/verification/`, including `release.json`, `tests.log`, `install.log`, `granite-installed.json`, checksums, and `evidence/*results.json`/MCP traces.

## Review findings

“Fixed” below refers to the demonstrated regression scenarios. “Partial” identifies broader requirements not fully covered by this implementation or verification.

| ID | Status | Evidence / boundary |
|---|---|---|
| F01 | Fixed | Spring demo discovery and all 12 five-language applications. Arbitrary framework discovery is outside static adapters. |
| F02 | Fixed | One-service commit refreshes 1 and caches 2; five-adapter sibling reuse tests pass. |
| F03 | Fixed | Shared core comparison path; pre-refresh, targeted refresh and MCP restart preserve impact. |
| F04 | Fixed | Current HEAD/branch, content-sensitive dirty state and MCP freshness checked. |
| F05 | Fixed | Targeted refresh preserves baseline and cached siblings. |
| F06 | Fixed | Four MCP tools tested through actual SDK stdio with clean protocol output. |
| F07 | Fixed | Exposed Java DTO changes affect API; explicit field types read from old/current source. |
| F08 | Fixed | Datasource rename replaces old dependency; Compose environment edits invalidate cached dependencies. |
| F09 | Fixed | Canonical escaped path segments preserve hierarchy, case and punctuation; cache uses hashed keys. |
| F10 | Fixed | Non-Git updates and non-Git→Git transition tested; unknown is not diffed as a commit. |
| F11 | Partial | Atomic writes, six simultaneous writers and cross-instance reads pass; a live concurrent Bob UI/MCP session was not exercised. |
| F12 | Fixed | Internal database change does not automatically mark REST consumers HIGH. |
| F13 | Partial | Verified before/after field types reach prompts; describeApi wired; warm payload reads reuse descriptions. Dedicated artifact/model/prompt-version memoization is not implemented. |
| F14 | Fixed | Direct/transitive reverse traversal with visited-set cycle prevention and a truncation flag; traversal acceptance passes. |
| F15 | Fixed | Existing Spring annotation/generic/path regressions and 18 demo APIs preserved. |
| F16 | Fixed | Existing JPA scope/Transient regressions and 5 demo tables preserved. |
| F17 | Fixed | Highest severity is order-independent; database-only target regression passes; deterministic results emit canonical node IDs. |
| F18 | Fixed | Command/webview path tested using a controlled VS Code API; duplicate impact command is guarded. |
| F19 | Partial | File/Git watchers, fresh command analysis and graph pushes implemented; mock golden path passes. Live graph interaction was not completed. |
| F20 | Fixed | Cache/workspace settings reconstruct engine/watchers; AI settings restore provider; none clears the client. Cache-setting behavior is tested. |
| F21 | Partial | Expandable full endpoint/table-column lists, safe details and empty/error states implemented. Live layout/interaction acceptance remains unverified. |
| F22 | Partial | CSP nonce, textContent rendering, locked localResourceRoots and injection sentinel pass. Live hostile-payload browser execution was not tested. |
| F23 | Fixed | Exact canonical IDs take precedence; duplicate exact display names and ambiguous fragments are rejected. |
| F24 | Partial | Partial Java schemas and explicit endpoint references added; unknown schemas are null; unsupported events and static extraction coverage labeled. General cross-language schema/entity associations remain unsupported. |
| F25 | Partial | Regression/integration suites, accurate docs, reproducible offline packaging and installation verification completed. Tracked historical dist files were preserved and rebuilt; live UI acceptance remains outstanding. |

## Limits and remaining verification

- **Live graph UI:** VS Code visibly lists the installed 0.2.0 VSIX, but disables it in the untrusted disposable workspace. Workspace Trust was not changed. The graph golden path is covered by a controlled API test, not a completed native UI interaction. In a trusted test workspace, verify graph selection/expansion, edit a route, click Analyze Changes, reload, and confirm the retained range.
- **Cloud AI:** no live watsonx request was made; credentials were not supplied. Cloud error fallback is covered through deterministic/malformed-result tests.
- **Platform:** the distributed native bundle supports macOS arm64 only. Other OS/architecture packages require their own pinned runtime assets and execution tests.
- **Extraction:** adapters use patterns, not full AST/control-flow analysis. Java schemas are partial. Dynamic routes, arbitrary framework conventions, SQL schema extraction and general request→model→entity associations can remain unresolved.
- **Caching:** the comparison baseline is a committed snapshot; historical dirty-to-dirty snapshots are not retained. The marker fingerprint still traverses/stat-reads marker files; it does not eliminate filesystem scanning.
- **AI caching:** parsed-context caching avoids warm generation calls, but there is no independent model/prompt-version artifact cache yet.
- The standalone MCP server remains deterministic or watsonx-configured. Bundled Granite is owned by the extension, not automatically shared with an independent MCP process.

No source commit or remote push was performed. Existing work from the previous agent was preserved.

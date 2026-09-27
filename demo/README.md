# Bob Context Graph demo

Explore a microservice system, change an API and review the potential impact in about three minutes after setup. This is a source-analysis fixture; you do not need to build or run the Spring applications or provision databases.

## Prepare the workspace

Install the extension first using the [repository installation instructions](../README.md#offline-granite-extension). The bundled VSIX targets macOS Apple Silicon. For this walkthrough, choose **Skip for now** in **Bob Context Graph: Configure AI Provider** to use deterministic analysis without loading a model.

From the root of this repository, run the following in a macOS terminal to create a separate demo copy with its own Git baseline:

```sh
DEMO_DIR="$(mktemp -d "${TMPDIR:-/tmp}/bob-context-graph-demo.XXXXXX")"
cp -R demo/microservices/. "$DEMO_DIR/"
git -C "$DEMO_DIR" init
git -C "$DEMO_DIR" add .
git -C "$DEMO_DIR" -c user.name="Demo" -c user.email="demo@example.invalid" commit -m "Demo baseline"
code "$DEMO_DIR"
```

If `code` is unavailable, open the directory in VS Code using **File > Open Folder**. Run `echo "$DEMO_DIR"` in the same terminal to see its location. Keep `bcg.workspaceRoot` and `bcg.cacheDir` empty so the extension uses this workspace and its default cache.

## 1. Explore the system

Open the **Bob Context Graph** activity bar, then run **Bob Context Graph: Open System Graph** from the Command Palette. Wait for the first analysis to finish before editing files; this indexes the initial Git baseline.

The fixture contains:

| Item | Expected result |
| --- | --- |
| Services | 3: `order-service`, `payment-service`, `inventory-service` |
| API endpoints | 18 total |
| Tables | 5 total |
| Databases | 3 total |
| Service dependencies | `order-service` calls `payment-service` and `inventory-service` |

Select `payment-service` to inspect its endpoints, including `POST /payments/process`. Select database nodes to inspect the extracted tables and columns. The dependency edges come from source and configuration references, not live network traffic.

## 2. Change the payment API

Open `payment-service/src/main/java/com/demo/payment/controller/PaymentController.java` in the demo workspace. Replace just this annotation:

```java
// Before
@PostMapping("/process")

// After
@PostMapping("/process-v2")
```

Save the file without committing. Leave the order service unchanged: its `PaymentClient.java` still references `/payments/process`. This demonstrates a provider route change that a caller should review.

## 3. Analyze the change

Run **Bob Context Graph: Analyze Changes**. Inspect the payment service report in **Impact Analysis**, including related components, severity and recommended actions. Open `order-service/src/main/java/com/demo/order/client/PaymentClient.java` to explain why the caller needs review.

Select the payment node in the refreshed graph and confirm that the extracted route is now `POST /payments/process-v2`. Results are static-analysis guidance, not proof of a runtime failure or a complete compatibility check. Exact report wording and severity can differ between deterministic and AI modes.

## 4. Reset and repeat

Undo the annotation edit, save and run **Bob Context Graph: Analyze Changes** again. With no other source edits, the extension should report no changes. The original repository is unaffected because the walkthrough uses a separate copy.

Optional: choose **Local IBM Granite 4.2 3B** or configure **IBM watsonx.ai**, repeat the edit and compare the explanation. Local mode needs sufficient memory and the bundled macOS Apple Silicon runtime; cloud mode needs your own credentials and network access.

## Short presentation script

| Time | On screen | Narration |
| --- | --- | --- |
| 0:00–0:30 | System Overview and Services | “Bob Context Graph builds a persistent map of our microservices directly from source code.” |
| 0:30–1:10 | System graph and payment node | “We can inspect APIs, storage and service dependencies from one place, without starting the applications.” |
| 1:10–1:40 | Payment controller edit | “I am changing the payment route while the order service still calls the original endpoint.” |
| 1:40–2:30 | Analyze Changes and Impact Analysis | “The extension compares the workspace with its Git baseline and helps us review the changed service and related components.” |
| 2:30–3:00 | Undo edit and analyze again | “Context persists between sessions. We can use deterministic analysis, offline IBM Granite or cloud watsonx.ai.” |

This walkthrough is a reproducible demo script, not a recording of the extension UI.

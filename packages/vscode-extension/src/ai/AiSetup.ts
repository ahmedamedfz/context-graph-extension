import * as vscode from 'vscode';
import { WatsonxClient, WatsonxRuntime, LocalGraniteClient } from '@bob-context-graph/watsonx';

/** The AI provider choice persisted between sessions. */
export type AiProvider = 'watsonx' | 'local' | 'none';

const SECRET_API_KEY = 'bcg.watsonxApiKey';
const SECRET_PROJECT_ID = 'bcg.watsonxProjectId';
const CONFIG_PROVIDER = 'aiProvider';

/**
 * Read the persisted provider choice from VS Code configuration.
 */
export function getStoredProvider(config: vscode.WorkspaceConfiguration): AiProvider {
  return config.get<AiProvider>(CONFIG_PROVIDER) ?? 'none';
}

/**
 * Persist the provider choice in global (user-level) settings.
 */
async function storeProvider(provider: AiProvider): Promise<void> {
  await vscode.workspace
    .getConfiguration('bcg')
    .update(CONFIG_PROVIDER, provider, vscode.ConfigurationTarget.Global);
}

/**
 * Run the interactive AI provider setup wizard.
 *
 * Called on first activation or when the user runs `bcg.configureAI`.
 * Returns a configured WatsonxRuntime or null when the user picks "none".
 */
export async function runAiSetup(
  secrets: vscode.SecretStorage,
  bundleDir: string
): Promise<WatsonxRuntime | null | undefined> {
  const choice = await vscode.window.showQuickPick(
    [
      {
        label: '$(cloud) IBM watsonx.ai',
        description: 'Use IBM watsonx.ai cloud service (requires API key & project ID)',
        value: 'watsonx' as AiProvider,
      },
      {
        label: '$(server) Local IBM Granite 4.2 3B',
        description: 'Bundled model, runs offline; no Ollama or credentials needed',
        value: 'local' as AiProvider,
      },
      {
        label: '$(circle-slash) Skip for now',
        description: 'Use deterministic analysis only (no AI-powered summaries)',
        value: 'none' as AiProvider,
      },
    ],
    {
      title: 'Bob Context Graph — AI Provider Setup',
      placeHolder: 'How would you like to power AI summaries and impact analysis?',
      ignoreFocusOut: true,
    }
  );

  if (!choice) {
    // User dismissed — treat as "none" but don't persist so we ask again next time
    return undefined;
  }

  await storeProvider(choice.value);

  if (choice.value === 'watsonx') {
    return await setupWatsonx(secrets);
  }

  if (choice.value === 'local') {
    return await setupLocal(bundleDir);
  }

  // 'none'
  vscode.window.showInformationMessage(
    'Bob Context Graph: Running with deterministic analysis. ' +
    'You can configure an AI provider later via "Bob Context Graph: Configure AI Provider".'
  );
  return null;
}

// ── watsonx.ai setup ─────────────────────────────────────────────────────────

async function setupWatsonx(secrets: vscode.SecretStorage): Promise<WatsonxRuntime | null> {
  // Try to re-use previously stored credentials first
  let apiKey = await secrets.get(SECRET_API_KEY);
  let projectId = await secrets.get(SECRET_PROJECT_ID);

  if (!apiKey) {
    apiKey = await vscode.window.showInputBox({
      title: 'watsonx.ai API Key',
      prompt: 'Enter your IBM watsonx.ai API key',
      password: true,
      ignoreFocusOut: true,
      validateInput: v => (v?.trim() ? undefined : 'API key is required'),
    });
    if (!apiKey) {
      await storeProvider('none');
      return null;
    }
    await secrets.store(SECRET_API_KEY, apiKey);
  }

  if (!projectId) {
    projectId = await vscode.window.showInputBox({
      title: 'watsonx.ai Project ID',
      prompt: 'Enter your IBM watsonx.ai Project ID',
      ignoreFocusOut: true,
      validateInput: v => (v?.trim() ? undefined : 'Project ID is required'),
    });
    if (!projectId) {
      await storeProvider('none');
      return null;
    }
    await secrets.store(SECRET_PROJECT_ID, projectId);
  }

  const config = vscode.workspace.getConfiguration('bcg');
  const baseUrl =
    process.env.WATSONX_BASE_URL ??
    config.get<string>('watsonxBaseUrl') ??
    'https://us-south.ml.cloud.ibm.com';
  const modelId =
    process.env.WATSONX_MODEL_ID ??
    config.get<string>('watsonxModelId') ??
    'ibm/granite-3-8b-instruct';

  const client = new WatsonxClient({ apiKey, projectId, baseUrl, modelId });
  vscode.window.showInformationMessage(
    `Bob Context Graph: Configured watsonx.ai (${modelId}).`
  );
  return new WatsonxRuntime(client);
}

// ── Local Granite setup ──────────────────────────────────────────────────────

async function setupLocal(bundleDir: string): Promise<WatsonxRuntime | null> {
  const client = new LocalGraniteClient({bundleDir});
  try {
    await vscode.window.withProgress({location: vscode.ProgressLocation.Notification, title: 'Loading bundled IBM Granite 4.2 3B…', cancellable: true}, async (_progress, token) => {
      const subscription = token.onCancellationRequested(() => client.dispose());
      try { await client.start(); } finally { subscription.dispose(); }
    });
    return new WatsonxRuntime(client);
  } catch (err) {
    client.dispose();
    vscode.window.showWarningMessage(`Local Granite unavailable: ${String(err)}. Deterministic analysis remains available; retry with Configure AI Provider.`);
    return null;
  }
}

/**
 * Restore a previously chosen AI provider without showing the wizard.
 * Called on subsequent activations when a provider is already stored.
 */
export async function restoreAiProvider(
  secrets: vscode.SecretStorage,
  provider: AiProvider,
  bundleDir: string
): Promise<WatsonxRuntime | null> {
  if (provider === 'watsonx') {
    const apiKey = await secrets.get(SECRET_API_KEY);
    const projectId = await secrets.get(SECRET_PROJECT_ID);

    if (apiKey && projectId) {
      const config = vscode.workspace.getConfiguration('bcg');
      const baseUrl =
        process.env.WATSONX_BASE_URL ??
        config.get<string>('watsonxBaseUrl') ??
        'https://us-south.ml.cloud.ibm.com';
      const modelId =
        process.env.WATSONX_MODEL_ID ??
        config.get<string>('watsonxModelId') ??
        'ibm/granite-3-8b-instruct';

      const client = new WatsonxClient({ apiKey, projectId, baseUrl, modelId });
      return new WatsonxRuntime(client);
    }

    // Credentials gone — re-run setup
    return (await runAiSetup(secrets, bundleDir)) ?? null;
  }

  if (provider === 'local') return setupLocal(bundleDir);

  return null;
}

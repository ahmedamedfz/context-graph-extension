import axios, { AxiosInstance } from 'axios';
import { spawn, ChildProcess } from 'child_process';
import { randomBytes } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LlmClient } from './LlmClient';

export interface LocalGraniteOptions { bundleDir: string; startupTimeoutMs?: number; }

/** Owns the bundled llama.cpp process; no external daemon, shell, or model download. */
export class LocalGraniteClient implements LlmClient {
  static readonly MODEL_ID = 'ibm-granite/granite-4.2-3b-GGUF';
  private http?: AxiosInstance;
  private child?: ChildProcess;
  private starting?: Promise<void>;
  private tempDir?: string;
  private disposed = false;
  private failure?: Error;
  private readonly onExit = () => this.dispose();

  constructor(private options?: LocalGraniteOptions) {}
  isConfigured(): boolean { return !!this.options && !this.disposed; }
  async isAvailable(): Promise<boolean> { try { await this.start(); return true; } catch { return false; } }

  async start(): Promise<void> {
    if (this.disposed) throw Error('Local Granite was stopped');
    if (this.http && this.child && !this.failure) return;
    if (this.starting) return this.starting;
    this.starting = this.startProcess();
    try { await this.starting; } finally { this.starting = undefined; }
  }
  private async startProcess(): Promise<void> {
    if (!this.options) throw Error('The Granite bundle directory is required');
    if (process.platform !== 'darwin' || process.arch !== 'arm64') throw Error('This Granite bundle supports macOS Apple Silicon. Install a package built for your platform.');
    const binary = path.join(this.options.bundleDir, 'runtime', 'llama-server');
    const model = path.join(this.options.bundleDir, 'granite-4.2-3b-Q4_K_M.gguf');
    fs.accessSync(binary, fs.constants.X_OK);
    fs.accessSync(model, fs.constants.R_OK);
    this.tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-'));
    fs.chmodSync(this.tempDir, 0o700);
    const socket = path.join(this.tempDir, 'llama.sock');
    const apiKey = randomBytes(32).toString('hex');
    // Do not inherit LLAMA_* overrides (remote hosts, templates, tools, or model URLs).
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('LLAMA_')));
    env.LLAMA_API_KEY = apiKey;
    this.failure = undefined;
    this.child = spawn(binary, ['--model', model, '--host', socket, '--ctx-size', '8192', '--parallel', '1', '--no-webui', '--jinja', '--log-disable'], {
      cwd: path.dirname(binary), env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true,
    });
    let diagnostics = '';
    this.child.stderr?.on('data', chunk => { diagnostics = (diagnostics + String(chunk)).slice(-2000); });
    this.child.once('error', err => { this.failure = err; });
    this.child.once('exit', code => { this.failure = Error(`Granite runtime exited (${code}): ${diagnostics}`); this.http = undefined; });
    process.once('exit', this.onExit);
    const http = axios.create({baseURL: 'http://localhost', socketPath: socket, proxy: false, timeout: 180_000, headers: {Authorization: `Bearer ${apiKey}`}});
    const deadline = Date.now() + (this.options.startupTimeoutMs ?? 120_000);
    try {
      while (Date.now() < deadline) {
        if (this.disposed) throw Error('Granite startup cancelled');
        if (this.failure) throw this.failure;
        try { await http.get('/health', {timeout: 1000}); this.http = http; return; } catch { /* loading model */ }
        await new Promise(resolve => setTimeout(resolve, 200));
      }
      throw Error('Granite model loading timed out');
    } catch (err) { this.dispose(); throw err; }
  }
  async generate(prompt: string, maxNewTokens = 500): Promise<string> {
    await this.start();
    const response = await this.http!.post('/v1/chat/completions', {
      messages: [{role: 'user', content: prompt}], max_tokens: maxNewTokens,
      temperature: 0.1, stream: false, chat_template_kwargs: {enable_thinking: false},
    });
    const text = response.data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw Error('Granite returned no text');
    return text.trim();
  }
  async generateJson<T>(prompt: string, maxNewTokens = 1000): Promise<T | null> {
    const raw = await this.generate(prompt, maxNewTokens);
    const value = raw.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? raw.match(/\{[\s\S]*\}/)?.[0] ?? raw;
    try { return JSON.parse(value) as T; } catch { return null; }
  }
  dispose(): void {
    this.disposed = true;
    this.http = undefined;
    process.removeListener('exit', this.onExit);
    const child = this.child;
    this.child = undefined;
    if (child && child.exitCode === null) {
      child.kill('SIGTERM');
      const timer = setTimeout(() => { if (child.exitCode === null) child.kill('SIGKILL'); }, 3000);
      timer.unref();
    }
    if (this.tempDir) { fs.rmSync(this.tempDir, {recursive: true, force: true}); this.tempDir = undefined; }
  }
}

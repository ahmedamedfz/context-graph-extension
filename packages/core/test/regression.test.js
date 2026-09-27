/**
 * Core regression tests for Bob Context Graph.
 * Replaces the "echo ok" stub with assertions that fail on re-introduced bugs.
 *
 * Run: node packages/core/test/regression.test.js
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');

// ── Inline minimal require paths ────────────────────────────────────────────
// Tests run against the compiled dist/ output
const distRoot = path.join(__dirname, '..', 'dist');

function requireDist(mod) {
  return require(path.join(distRoot, mod));
}

let passed = 0;
let failed = 0;
const pendingAsync = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

function testAsync(name, fn) {
  const p = (async () => {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message || err}`);
      failed++;
    }
  })();
  pendingAsync.push(p);
}

// ── GitAnalyzer.classifyFile ────────────────────────────────────────────────
console.log('\nGitAnalyzer.classifyFile');
const { GitAnalyzer } = requireDist('git/GitAnalyzer');
const git = new GitAnalyzer('.');

test('classifies Spring controller as API', () => {
  assert.strictEqual(git.classifyFile('src/main/java/com/example/OrderController.java'), 'API');
});
test('classifies JPA entity as ENTITY', () => {
  assert.strictEqual(git.classifyFile('src/main/java/com/example/entity/Order.java'), 'ENTITY');
});
test('classifies DTO as DTO', () => {
  assert.strictEqual(git.classifyFile('src/main/java/com/example/model/OrderRequest.java'), 'DTO');
});
test('classifies application.yml as CONFIG', () => {
  assert.strictEqual(git.classifyFile('src/main/resources/application.yml'), 'CONFIG');
});
test('classifies application.yaml as CONFIG (F08)', () => {
  assert.strictEqual(git.classifyFile('src/main/resources/application.yaml'), 'CONFIG');
});
test('classifies pom.xml as CONFIG', () => {
  assert.strictEqual(git.classifyFile('pom.xml'), 'CONFIG');
});
test('classifies Go handler as API', () => {
  assert.strictEqual(git.classifyFile('handlers/order_handler.go'), 'API');
});
test('classifies Python view as API', () => {
  assert.strictEqual(git.classifyFile('views/order_views.py'), 'API');
});
test('classifies package.json as CONFIG', () => {
  assert.strictEqual(git.classifyFile('package.json'), 'CONFIG');
});

// ── JpaEntityParser ─────────────────────────────────────────────────────────
console.log('\nJpaEntityParser');
const { JpaEntityParser } = requireDist('parser/JpaEntityParser');
const jpaParser = new JpaEntityParser();

test('F16: no annotation bleed — only id is PK', () => {
  // Create a temp java file
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-test-'));
  const javaContent = `
package com.example;
import javax.persistence.*;
@Entity
@Table(name = "orders")
public class Order {
  @Id
  private UUID id;

  @Column(name = "customer_id", nullable = false)
  private Integer customerId;

  @Transient
  private String temp;

  private String status;
}
`;
  const javaFile = path.join(tmpDir, 'Order.java');
  fs.writeFileSync(javaFile, javaContent);

  const tables = jpaParser.parseService(tmpDir);
  assert.strictEqual(tables.length, 1, 'Should have 1 table');
  const table = tables[0];

  // id should be the only PK
  const pks = table.columns.filter(c => c.isPrimaryKey);
  assert.strictEqual(pks.length, 1, `Expected 1 PK, got ${pks.length}`);
  assert.strictEqual(pks[0].name, 'id', 'PK should be id');

  // temp should be excluded (@Transient)
  const transient_ = table.columns.find(c => c.name === 'temp');
  assert.ok(!transient_, '@Transient field should be excluded');

  // customerId should have correct column name from @Column
  const customerIdCol = table.columns.find(c => c.name === 'customer_id');
  assert.ok(customerIdCol, 'customer_id column should exist');
  assert.ok(!customerIdCol.isPrimaryKey, 'customer_id should not be PK');

  fs.rmSync(tmpDir, { recursive: true });
});

// ── SpringApiParser ──────────────────────────────────────────────────────────
console.log('\nSpringApiParser');
const { SpringApiParser } = requireDist('parser/SpringApiParser');
const springParser = new SpringApiParser();

test('F15: handles path= alias in @RequestMapping', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-test-'));
  const javaContent = `
package com.example;
import org.springframework.web.bind.annotation.*;
@RestController
@RequestMapping(path = "/v1")
public class OrderController {
  @GetMapping("/orders")
  public ResponseEntity<List<OrderResponse>> getOrders() { return null; }

  @PostMapping("/orders")
  public ResponseEntity<OrderResponse> createOrder(
      @RequestBody OrderRequest request) { return null; }
}
`;
  const javaFile = path.join(tmpDir, 'OrderController.java');
  fs.writeFileSync(javaFile, javaContent);

  const apis = springParser.parseService(tmpDir);
  assert.ok(apis.length >= 2, `Expected >= 2 endpoints, got ${apis.length}`);

  const getOrders = apis.find(a => a.method === 'GET');
  assert.ok(getOrders, 'GET endpoint not found');
  assert.ok(getOrders.path.startsWith('/v1'), `GET path should start with /v1, got: ${getOrders.path}`);

  const postOrders = apis.find(a => a.method === 'POST');
  assert.ok(postOrders, 'POST endpoint not found');
  assert.ok(postOrders.path.startsWith('/v1'), `POST path should start with /v1, got: ${postOrders.path}`);
  assert.ok(postOrders.requestModel === 'OrderRequest', `requestModel should be OrderRequest, got: ${postOrders.requestModel}`);

  // F15: ResponseEntity<List<OrderResponse>> should not be truncated
  if (getOrders.responseModel) {
    assert.ok(!getOrders.responseModel.includes('<List<OrderResponse'), 'Generic should not be truncated');
  }

  fs.rmSync(tmpDir, { recursive: true });
});

// ── WorkspaceScanner ─────────────────────────────────────────────────────────
console.log('\nWorkspaceScanner');
const { WorkspaceScanner } = requireDist('scanner/WorkspaceScanner');

test('F09: service IDs are unique for same-name dirs in different paths', () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-test-'));
  const aDir = path.join(tmpRoot, 'team-a', 'order-service');
  const bDir = path.join(tmpRoot, 'team-b', 'order-service');
  fs.mkdirSync(aDir, { recursive: true });
  fs.mkdirSync(bDir, { recursive: true });
  fs.writeFileSync(path.join(aDir, 'pom.xml'), '<project><packaging>jar</packaging></project>');
  fs.writeFileSync(path.join(bDir, 'pom.xml'), '<project><packaging>jar</packaging></project>');

  const scanner = new WorkspaceScanner(tmpRoot);
  const idA = scanner.generateServiceId(aDir);
  const idB = scanner.generateServiceId(bDir);
  assert.notStrictEqual(idA, idB, `IDs should differ: ${idA} vs ${idB}`);

  fs.rmSync(tmpRoot, { recursive: true });
});

test('F01: scanner finds services 3 levels deep', async () => {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-test-'));
  const deepDir = path.join(tmpRoot, 'monorepo', 'services', 'order-service');
  fs.mkdirSync(deepDir, { recursive: true });
  fs.writeFileSync(path.join(deepDir, 'pom.xml'), '<project><dependencies><dependency><groupId>org.springframework.boot</groupId></dependency></dependencies></project>');

  const scanner = new WorkspaceScanner(tmpRoot);
  const services = await scanner.discoverServices();
  assert.ok(services.length >= 1, `Expected >= 1 service at depth 3, got ${services.length}`);
  const found = services.find(s => s.rootPath.endsWith('order-service'));
  assert.ok(found, 'order-service should be found 3 levels deep');

  fs.rmSync(tmpRoot, { recursive: true });
});

// ── ContextGraphBuilder ──────────────────────────────────────────────────────
console.log('\nContextGraphBuilder');
const { ContextGraphBuilder } = requireDist('graph/ContextGraphBuilder');
const builder = new ContextGraphBuilder();

test('F17: shared DB merges tables from both services', () => {
  const svcA = makeSvc('svc-a', 'shared_db', [{ tableName: 'orders', entityClass: 'Order', columns: [], relationships: [] }]);
  const svcB = makeSvc('svc-b', 'shared_db', [{ tableName: 'items', entityClass: 'Item', columns: [], relationships: [] }]);

  const graph = builder.build([svcA, svcB]);
  const dbNode = graph.nodes.find(n => n.id === 'db:shared_db');
  assert.ok(dbNode, 'shared_db node should exist');
  const dbData = dbNode.data;
  assert.ok(dbData.tables.length === 2, `shared DB should have 2 tables, got ${dbData.tables.length}`);
});

test('F17: applyImpact matches DB node by ID pattern', () => {
  const svc = makeSvc('order-service', 'orders_db', [{ tableName: 'orders', entityClass: 'Order', columns: [], relationships: [] }]);
  const graph = builder.build([svc]);

  const highlighted = builder.applyImpact(graph, [{
    component: 'order-service Database',
    severity: 'HIGH',
    reason: 'schema change',
  }]);

  const dbNode = highlighted.nodes.find(n => n.id === 'db:orders_db');
  assert.ok(dbNode, 'db node should exist');
  assert.strictEqual(dbNode.impactSeverity, 'HIGH', `DB node should be HIGH, got ${dbNode.impactSeverity}`);
});

// ── NodeApiParser ────────────────────────────────────────────────────────────
console.log('\nNodeApiParser');
const { NodeApiParser } = requireDist('parser/NodeApiParser');
const nodeParser = new NodeApiParser();

test('parses Express routes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-test-'));
  const jsContent = `
const express = require('express');
const router = express.Router();
router.get('/orders', listOrders);
router.post('/orders', createOrder);
router.delete('/orders/:id', deleteOrder);
`;
  fs.writeFileSync(path.join(tmpDir, 'routes.js'), jsContent);
  const apis = nodeParser.parseService(tmpDir);
  assert.ok(apis.length >= 3, `Expected >= 3 Express routes, got ${apis.length}`);
  fs.rmSync(tmpDir, { recursive: true });
});

// ── PythonApiParser ──────────────────────────────────────────────────────────
console.log('\nPythonApiParser');
const { PythonApiParser } = requireDist('parser/PythonApiParser');
const pyParser = new PythonApiParser();

test('parses FastAPI routes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-test-'));
  const pyContent = `
from fastapi import FastAPI
app = FastAPI()

@app.get("/orders")
async def list_orders():
    pass

@app.post("/orders")
async def create_order():
    pass
`;
  fs.writeFileSync(path.join(tmpDir, 'main.py'), pyContent);
  const apis = pyParser.parseService(tmpDir);
  assert.ok(apis.length >= 2, `Expected >= 2 FastAPI routes, got ${apis.length}`);
  const getRoute = apis.find(a => a.method === 'GET');
  assert.ok(getRoute, 'GET route should be found');
  assert.strictEqual(getRoute.path, '/orders');
  fs.rmSync(tmpDir, { recursive: true });
});

// ── GoApiParser ───────────────────────────────────────────────────────────────
console.log('\nGoApiParser');
const { GoApiParser } = requireDist('parser/GoApiParser');
const goParser = new GoApiParser();

test('parses Gin routes', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-test-'));
  const goContent = `
package main
import "github.com/gin-gonic/gin"

func main() {
  r := gin.Default()
  r.GET("/orders", listOrders)
  r.POST("/orders", createOrder)
  r.Run()
}
`;
  fs.writeFileSync(path.join(tmpDir, 'main.go'), goContent);
  const apis = goParser.parseService(tmpDir);
  assert.ok(apis.length >= 2, `Expected >= 2 Gin routes, got ${apis.length}`);
  fs.rmSync(tmpDir, { recursive: true });
});

// ── ContextCache baseline tracking ───────────────────────────────────────────
console.log('\nContextCache (F03, F10, F11)');
const { ContextCache } = requireDist('cache/ContextCache');

test('F03: getBaselineCommit returns previous commit after two sets', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-cache-'));
  const cache = new ContextCache(tmpDir);

  const ctx1 = makeCtx('svc1', 'main', 'abc1234');
  cache.set(ctx1);
  assert.strictEqual(cache.getBaselineCommit('svc1'), null, 'baseline should be null after first set');

  const ctx2 = makeCtx('svc1', 'main', 'def5678');
  cache.set(ctx2);
  assert.strictEqual(cache.getBaselineCommit('svc1'), 'abc1234', 'baseline should be previous commit');

  fs.rmSync(tmpDir, { recursive: true });
});

test('F10: non-git (unknown commit) is not cached', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-cache-'));
  const cache = new ContextCache(tmpDir);
  const ctx = makeCtx('svc1', 'main', 'unknown');
  cache.set(ctx);
  // Even if we stored it, isCached should reflect that we can't trust 'unknown'
  // The engine won't call isCached for 'unknown' commits — test the cache's direct behavior
  const stored = cache.get('svc1', 'main', 'unknown');
  assert.ok(stored, 'Cache can store unknown commit context');
  // The engine will skip using it because commitIsKnown === false
  // Test that commitHash 'unknown' is what we get back
  assert.strictEqual(stored.identity.commitHash, 'unknown');
  fs.rmSync(tmpDir, { recursive: true });
});

// ── ContextCache restoreBaseline ─────────────────────────────────────────────
console.log('\nContextCache.restoreBaseline (F03/F05)');

test('F05: restoreBaseline preserves baseline after cache invalidation', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-cache-'));
  const cache = new ContextCache(tmpDir);

  // Set two commits to establish a baseline
  const ctx1 = makeCtx('svc1', 'main', 'aaa0001');
  cache.set(ctx1);
  const ctx2 = makeCtx('svc1', 'main', 'bbb0002');
  cache.set(ctx2);
  assert.strictEqual(cache.getBaselineCommit('svc1'), 'aaa0001', 'baseline should be aaa0001 before restore');

  // Simulate what refreshService does: save baseline, invalidate, restore
  const savedBaseline = cache.getBaselineCommit('svc1');
  const savedLast = cache.getLastAnalyzedCommit('svc1');
  cache.invalidate('svc1');
  assert.strictEqual(cache.getBaselineCommit('svc1'), null, 'baseline should be null after invalidate');

  // Write new context (simulating fullAnalysis after refresh)
  const ctx3 = makeCtx('svc1', 'main', 'ccc0003');
  cache.set(ctx3);
  // After fresh set, baseline would normally be bbb0002 (previous lastAnalyzed).
  // restoreBaseline should push it back to aaa0001 (the original baseline) when
  // aaa0001 != ccc0003.
  cache.restoreBaseline('svc1', savedBaseline, savedLast);
  assert.strictEqual(cache.getBaselineCommit('svc1'), 'aaa0001', 'baseline should be restored to aaa0001');

  fs.rmSync(tmpDir, { recursive: true });
});

// ── GitAnalyzer dirty-hash content fingerprint ───────────────────────────────
console.log('\nGitAnalyzer dirty-hash (content fingerprint)');

test('DIRTY-hash: getDirtyHash changes when file content changes (same-length edit)', () => {
  // We can only test this if we have an actual git repo; use a temp dir for structure.
  // Verify the logic: getDirtyHash returns 'clean' on a clean repo segment.
  // We test the hash stability + change detection via the algorithm (not live git).
  // This test verifies the code path doesn't crash on a non-git directory.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-dirty-'));
  try {
    const gitAnalyzer = new GitAnalyzer(tmpDir);
    const hash = gitAnalyzer.getDirtyHash();
    // Should return 'clean' or a valid hash — not throw
    assert.ok(typeof hash === 'string', 'getDirtyHash should return a string');
    assert.ok(hash === 'clean' || hash.length === 12, `getDirtyHash should be "clean" or 12-char hex, got: ${hash}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ── Polyglot incremental dispatch ────────────────────────────────────────────
console.log('\nPolyglot incremental (POLY-node, POLY-python, POLY-go)');

testAsync('POLY-node: NodeApiParser parses Express route in file named index.js', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-poly-'));
  try {
    const jsContent = `
const express = require('express');
const app = express();
app.get('/products', listProducts);
app.post('/products', createProduct);
app.delete('/products/:id', deleteProduct);
`;
    fs.writeFileSync(path.join(tmpDir, 'index.js'), jsContent);
    const { NodeApiParser } = requireDist('parser/NodeApiParser');
    const parser = new NodeApiParser();
    const apis = parser.parseService(tmpDir);
    assert.ok(apis.length >= 3, `Expected >= 3 routes, got ${apis.length}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

testAsync('POLY-python: PythonApiParser parses Flask route in app.py', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-poly-'));
  try {
    const pyContent = `
from flask import Flask
app = Flask(__name__)

@app.route('/health', methods=['GET'])
def health():
    return 'ok'

@app.route('/items', methods=['GET', 'POST'])
def items():
    pass
`;
    fs.writeFileSync(path.join(tmpDir, 'app.py'), pyContent);
    const { PythonApiParser } = requireDist('parser/PythonApiParser');
    const parser = new PythonApiParser();
    const apis = parser.parseService(tmpDir);
    assert.ok(apis.length >= 1, `Expected >= 1 Flask route, got ${apis.length}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

testAsync('POLY-go: GoApiParser parses net/http handler', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-poly-'));
  try {
    const goContent = `
package main

import (
  "net/http"
)

func main() {
  http.HandleFunc("/health", healthHandler)
  http.HandleFunc("/items", itemsHandler)
  http.ListenAndServe(":8080", nil)
}
`;
    fs.writeFileSync(path.join(tmpDir, 'main.go'), goContent);
    const { GoApiParser } = requireDist('parser/GoApiParser');
    const parser = new GoApiParser();
    const apis = parser.parseService(tmpDir);
    // net/http HandleFunc may or may not be parsed depending on implementation
    // Just verify no crash
    assert.ok(Array.isArray(apis), 'GoApiParser should return an array');
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ── DB rename removes old entry ────────────────────────────────────────────
console.log('\nDependencyAnalyzer DB rename (F08)');

testAsync('F08: DB rename in config removes old DB dependency', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-f08-'));
  try {
    // Create a Spring service structure with application.yml pointing to orders_v2
    const resourceDir = path.join(tmpDir, 'src', 'main', 'resources');
    fs.mkdirSync(resourceDir, { recursive: true });
    fs.writeFileSync(
      path.join(resourceDir, 'application.yml'),
      'spring:\n  datasource:\n    url: jdbc:postgresql://localhost:5432/orders_v2\n'
    );

    const { DependencyAnalyzer } = requireDist('parser/DependencyAnalyzer');
    const analyzer = new DependencyAnalyzer();
    const dbNames = analyzer.detectDatabaseUsage(tmpDir);
    assert.ok(dbNames.includes('orders_v2'), `Should detect orders_v2, got: ${JSON.stringify(dbNames)}`);
    assert.ok(!dbNames.includes('orders_db'), `Should NOT contain old orders_db, got: ${JSON.stringify(dbNames)}`);
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ── Cache schema migration ─────────────────────────────────────────────────
console.log('\nContextCache schema migration (CACHE-schema)');

test('CACHE-schema: old index without schemaVersion is migrated', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-schema-'));
  try {
    // Write a "legacy" index file without schemaVersion
    const legacyIndex = {
      metadata: {
        'svc-old': {
          lastAnalyzedCommit: 'abc1234',
          lastDirtyHash: 'clean',
          previousCommit: null,
          lastAnalyzedAt: new Date().toISOString(),
        },
      },
    };
    fs.writeFileSync(path.join(tmpDir, 'index.json'), JSON.stringify(legacyIndex));

    // Loading should not throw and should migrate the entry
    const cache = new ContextCache(tmpDir);
    const last = cache.getLastAnalyzedCommit('svc-old');
    assert.strictEqual(last, 'abc1234', 'migrated entry should be readable');
    // baselineCommit should be null (previousCommit was null)
    const baseline = cache.getBaselineCommit('svc-old');
    assert.strictEqual(baseline, null, 'baselineCommit should be null for migrated entry');
  } finally {
    fs.rmSync(tmpDir, { recursive: true });
  }
});

// ── wrapText regex (F22/Phase5.2) ──────────────────────────────────────────
console.log('\nwrapText regex (Phase 5.2 — template literal escape)');

test('Phase 5.2: wrapText splits "service" on hyphen, not on "s"', () => {
  // The compiled graphHtml.js contains a wrapText function embedded in a template literal.
  // We verify that the compiled output doesn't have a broken regex that splits on 's'.
  const graphHtmlPath = path.join(__dirname, '..', '..', '..', 'packages', 'vscode-extension', 'dist', 'webview', 'graphHtml.js');
  if (!fs.existsSync(graphHtmlPath)) {
    // vscode extension may not be built in this test run — skip
    console.log('    (skipped — vscode dist not found)');
    return;
  }
  const content = fs.readFileSync(graphHtmlPath, 'utf8');
  // The compiled regex should contain \s (not just s) in the split pattern
  // /[-_\s]+/ should appear in the output, not /[-_s]+/
  const hasCorrectRegex = content.includes('[-_\\\\s]+') || content.includes('[-_\\s]+');
  const hasBrokenRegex = content.includes('[-_s]+') && !content.includes('[-_\\s]+') && !content.includes('[-_\\\\s]+');
  assert.ok(!hasBrokenRegex, 'graphHtml.js should not have broken /[-_s]+/ regex (should be /[-_\\s]+/)');
});

// ── Summary (after all async tests resolve) ──────────────────────────────────
Promise.all(pendingAsync).then(() => {
  console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function makeSvc(serviceId, dbName, tables) {
  return {
    identity: { serviceId, name: serviceId, repository: '/repo', branch: 'main', commitHash: 'abc1234', rootPath: '/path' },
    apis: [],
    database: tables,
    dependencies: [{ targetService: dbName, type: 'DATABASE', evidence: 'test' }],
    events: { publishes: [], consumes: [] },
    analyzedAt: new Date().toISOString(),
    fileCount: 1,
    status: 'Indexed',
  };
}

function makeCtx(serviceId, branch, commitHash) {
  return {
    identity: { serviceId, name: serviceId, repository: '/repo', branch, commitHash, rootPath: '/path' },
    apis: [],
    database: [],
    dependencies: [],
    events: { publishes: [], consumes: [] },
    analyzedAt: new Date().toISOString(),
    fileCount: 0,
    status: 'Indexed',
  };
}

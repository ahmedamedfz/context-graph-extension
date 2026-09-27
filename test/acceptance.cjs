const fs = require('fs'), os = require('os'), path = require('path'), {spawnSync} = require('child_process');
const out = process.env.BCG_REVIEW_OUT || fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-acceptance-'));
for (const file of ['review.cjs', 'mcp.cjs', 'extra.cjs']) {
  const r = spawnSync(process.execPath, [path.join(__dirname, file)], {env: {...process.env, BCG_REVIEW_OUT: out}, stdio: 'inherit'});
  if (r.status !== 0) process.exit(r.status || 1);
}
const results = ['results.json', 'mcp-results.json', 'extra-results.json'].flatMap(f => JSON.parse(fs.readFileSync(path.join(out, 'evidence', f))));
const failures = results.filter(r => r.status !== 'PASS');
console.log(`Acceptance: ${results.length - failures.length}/${results.length} passed. Evidence: ${out}`);
if (failures.length) {console.error(failures); process.exitCode = 1;}

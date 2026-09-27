// Reproducible, platform-specific offline bundle. Downloads happen at build time only.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { pipeline } = require('node:stream/promises');
const { Readable } = require('node:stream');
const { execFileSync } = require('node:child_process');
const manifest = require('./granite-bundle.json');
const root = path.resolve(__dirname, '../packages/vscode-extension/resources/granite');
async function digest(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
async function download(url, file, hash) {
  if (fs.existsSync(file) && (!hash || await digest(file) === hash)) return;
  const part = file + '.part';
  if (!fs.existsSync(part) || !hash || await digest(part) !== hash) {
    console.log('Downloading', url);
    const response = await fetch(url);
    if (!response.ok) throw Error(`Download failed: ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(part));
  }
  if (hash && await digest(part) !== hash) throw Error(`Checksum mismatch: ${file}`);
  fs.renameSync(part, file);
}
(async () => {
  fs.mkdirSync(root, {recursive: true});
  const {model, runtime} = manifest;
  await download(`https://huggingface.co/${model.id}/resolve/${model.revision}/${model.file}`, path.join(root, model.file), model.sha256);
  const archive = path.join(root, 'runtime.tar.gz');
  await download(runtime.url, archive, runtime.sha256);
  const staging = fs.mkdtempSync(path.join(root, 'extract-'));
  try {
    execFileSync('tar', ['-xzf', archive, '-C', staging]);
    const source = path.join(staging, `llama-${runtime.version}`);
    const dest = path.join(root, 'runtime');
    fs.rmSync(dest, {recursive: true, force: true});
    fs.mkdirSync(dest, {recursive: true});
    for (const file of fs.readdirSync(source)) {
      if (file === 'llama-server' || file.endsWith('.dylib') || file === 'LICENSE') {
        fs.copyFileSync(path.join(source, file), path.join(dest, file));
        if (file !== 'LICENSE') fs.chmodSync(path.join(dest, file), 0o755);
      }
    }
    if (fs.existsSync(path.join(source, 'licenses'))) fs.cpSync(path.join(source, 'licenses'), path.join(dest, 'licenses'), {recursive: true});
  } finally { fs.rmSync(staging, {recursive: true, force: true}); fs.rmSync(archive, {force: true}); }
  fs.copyFileSync(path.join(__dirname, 'licenses/GRANITE-APACHE-2.0.txt'), path.join(root, 'MODEL-LICENSE.txt'));
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Granite offline bundle ready: ${root}`);
})().catch(err => {console.error(err); process.exitCode = 1;});

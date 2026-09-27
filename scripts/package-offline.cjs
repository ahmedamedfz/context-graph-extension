// vsce scans the application first. Only checksum-verified upstream binary assets
// are then added using streaming ZIP writes (secretlint cannot read >2 GiB files).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {pipeline} = require('node:stream/promises');
const {ZipFile} = require('yazl');
const repo = path.resolve(__dirname, '..');
const extension = path.join(repo, 'packages/vscode-extension');
(async () => {
  execFileSync(process.execPath, [path.join(__dirname, 'prepare-granite.cjs')], {stdio: 'inherit'});
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'bcg-vsix-'));
  const stage = path.join(temporary, 'stage'), unpack = path.join(temporary, 'unpack');
  fs.mkdirSync(stage);
  try {
    for (const file of ['dist/extension.js', 'README.md', 'THIRD_PARTY_NOTICES.md', 'LICENSE']) {
      const target = path.join(stage, file); fs.mkdirSync(path.dirname(target), {recursive:true}); fs.copyFileSync(path.join(extension, file), target);
    }
    fs.cpSync(path.join(extension, 'resources'), path.join(stage, 'resources'), {recursive:true, filter: file => path.basename(file) !== 'granite'});
    const manifest = JSON.parse(fs.readFileSync(path.join(extension, 'package.json')));
    // Build already completed in the actual workspace; staged package is compiled only.
    delete manifest.scripts;
    fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(manifest, null, 2));
    const base = path.join(temporary, 'base.vsix');
    execFileSync(process.execPath, [path.join(repo, 'node_modules/@vscode/vsce/vsce'), 'package', '--no-dependencies', '--target', 'darwin-arm64', '--out', base], {cwd: stage, stdio:'inherit'});
    execFileSync('unzip', ['-q', base, '-d', unpack]);
    const types = path.join(unpack, '[Content_Types].xml');
    fs.writeFileSync(types, fs.readFileSync(types, 'utf8').replace('</Types>', '<Default Extension="gguf" ContentType="application/octet-stream"/><Default Extension="dylib" ContentType="application/octet-stream"/></Types>'));
    const zip = new ZipFile();
    const addTree = (dir, prefix) => {
      for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
        const file = path.join(dir, entry.name), name = prefix + entry.name;
        if (entry.isDirectory()) addTree(file, name + '/');
        else zip.addFile(file, name);
      }
    };
    addTree(unpack, '');
    const assets = path.join(extension, 'resources/granite');
    for (const file of [require('./granite-bundle.json').model.file, 'MODEL-LICENSE.txt', 'manifest.json']) zip.addFile(path.join(assets, file), 'extension/resources/granite/' + file);
    addTree(path.join(assets, 'runtime'), 'extension/resources/granite/runtime/');
    const output = path.join(extension, `${manifest.name}-${manifest.version}-darwin-arm64.vsix`);
    const writing = pipeline(zip.outputStream, fs.createWriteStream(output + '.part'));
    zip.end();
    await writing;
    fs.renameSync(output + '.part', output);
    console.log('Offline VSIX ready:', output);
  } finally {fs.rmSync(temporary, {recursive:true,force:true});}
})().catch(err => {console.error(err);process.exitCode=1});

const fs = require('node:fs');
const path = require('node:path');
const {pipeline} = require('node:stream/promises');

const releasesDirectory = path.resolve(__dirname, '..', 'releases');
const archive = 'bob-context-graph-0.2.0-darwin-arm64.vsix';
const prefix = `${archive}.part-`;
const parts = fs.readdirSync(releasesDirectory).filter(name => name.startsWith(prefix)).sort();
const output = path.join(releasesDirectory, archive);

if (parts.length === 0) {
  console.error(`No archive parts found for ${archive}`);
  process.exitCode = 1;
} else {
  (async () => {
    for (let index = 0; index < parts.length; index += 1) {
      await pipeline(
        fs.createReadStream(path.join(releasesDirectory, parts[index])),
        fs.createWriteStream(output, {flags: index === 0 ? 'w' : 'a'}),
      );
    }
    console.log(`Assembled ${output}`);
  })().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
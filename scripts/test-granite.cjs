const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {LocalGraniteClient} = require('../packages/watsonx/dist');
(async () => {
  const bundleDir = path.resolve(process.argv[2] || 'packages/vscode-extension/resources/granite');
  const client = new LocalGraniteClient({bundleDir});
  const started = Date.now();
  let child;
  try {
    await client.start();
    child = client.child;
    const text = await client.generate('Reply with exactly: Granite is running locally.', 32);
    assert.match(text, /Granite is running locally/);
    const json = await client.generateJson('Return only this JSON object: {"local":true,"model":"Granite"}', 64);
    assert.deepEqual(json, {local:true, model:'Granite'});
    const result = {model: LocalGraniteClient.MODEL_ID, bundleDir, text, json, elapsedMs: Date.now()-started};
    console.log(JSON.stringify(result, null, 2));
    if (process.env.BCG_GRANITE_EVIDENCE) fs.writeFileSync(process.env.BCG_GRANITE_EVIDENCE, JSON.stringify(result, null, 2));
  } finally {
    client.dispose();
    if (child && child.exitCode === null) await new Promise((resolve,reject) => {
      const timer=setTimeout(()=>reject(Error('Runtime did not stop')),5000);
      child.once('exit',()=>{clearTimeout(timer);resolve()});
    });
    console.log('Runtime process stopped successfully.');
  }
})().catch(err => {console.error(err);process.exitCode=1});

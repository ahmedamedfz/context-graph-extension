const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const {execFileSync, spawn} = require('node:child_process');
const {ContextGraphEngine, GitAnalyzer, ContextCache, WorkspaceScanner} = require('../packages/core/dist');
const {WatsonxRuntime, LocalGraniteClient} = require('../packages/watsonx/dist');
const git = (root, ...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe']}).trim();
const write = (root, file, text) => {fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text)};
const init = root => {git(root,'init','-q','-b','main');git(root,'config','user.name','Test');git(root,'config','user.email','test@localhost');commit(root)};
const commit = root => {git(root,'add','.');git(root,'commit','-qm','snapshot')};
function fixture(t) {const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bcg-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const root=path.join(dir,'workspace');fs.mkdirSync(root);return {root,cacheDir:path.join(dir,'cache'),dir};}

test('dirty paths preserve whitespace, Unicode, both rename owners, and new-file content', t => {
 const {root}=fixture(t);write(root,'a/ spaced ü.js ','old');init(root);
 write(root,'a/ spaced ü.js ','new');const g=new GitAnalyzer(root);
 assert.equal(g.getDirtyFiles()[0].path,'a/ spaced ü.js ');
 write(root,'a/new.js','one');const h=g.getDirtyHash();write(root,'a/new.js','two');assert.notEqual(g.getDirtyHash(),h);
 git(root,'reset','--hard','HEAD');fs.rmSync(path.join(root,'a/new.js'));fs.mkdirSync(path.join(root,'b'));git(root,'mv','a/ spaced ü.js ','b/moved.js');
 assert.deepEqual(new Set(g.getDirtyFiles().map(f=>f.path)),new Set(['a/ spaced ü.js ','b/moved.js']));
 const before=git(root,'rev-parse','HEAD');commit(root);assert.equal(g.getChangedFiles(before,g.getHead(false)).length,2);
});

test('all five adapters update dirty, committed and deleted endpoints with sibling reuse', async t => {
 const {root,cacheDir}=fixture(t);
 const fixtures=[['node','package.json','index.js','{}',"const app=require('express')();app.get('/old',()=>{});"],['python','requirements.txt','app.py','','from fastapi import FastAPI\napp=FastAPI()\n@app.get("/old")\ndef f(): pass'],['go','go.mod','main.go','module demo','package main\nfunc main(){http.HandleFunc("GET /old", handler)}'],['java','Dockerfile','Main.java','FROM java','class Main { void f(){ HttpServer.create(); if(path.equals("/old")){ } } }'],['php','Dockerfile','index.php','FROM php',"<?php $path=$_SERVER['REQUEST_URI']; if($path === '/old') {}"]];
 for(const [id,manifest,file,config,source] of fixtures){write(root,id+'/'+manifest,config);write(root,id+'/'+file,source)}init(root);
 const e=new ContextGraphEngine({workspaceRoot:root,cacheDir});await e.analyze();
 for(const [id,,file,,source] of fixtures){
  write(root,id+'/'+file,source.replace('/old','/new'));let r=await e.analyze();
  assert(r.services.find(s=>s.identity.name===id).apis.some(a=>a.path==='/new'),id+' dirty');assert.equal(r.cacheStats.cached,4);
  commit(root);r=await e.analyze();assert(r.services.find(s=>s.identity.name===id).apis.some(a=>a.path==='/new'),id+' commit');assert.equal(r.cacheStats.cached,4);
  fs.unlinkSync(path.join(root,id,file));r=await e.analyze();assert.equal(r.services.find(s=>s.identity.name===id).apis.length,0,id+' deletion');
  write(root,id+'/'+file,source.replace('/old','/new'));await e.analyze();
 }
});

test('shared cache isolates workspaces and IDs preserve case, punctuation, and hierarchy', async t => {
 const {root,cacheDir,dir}=fixture(t),other=path.join(dir,'other');fs.mkdirSync(other);
 for(const r of [root,other]){write(r,'svc/package.json','{}');write(r,'svc/index.js',`app.get('/${path.basename(r)}',()=>{});`);init(r)}
 const a=await new ContextGraphEngine({workspaceRoot:root,cacheDir}).analyze();const b=await new ContextGraphEngine({workspaceRoot:other,cacheDir}).analyze();assert.notEqual(a.services[0].apis[0].path,b.services[0].apis[0].path);
 const scan=new WorkspaceScanner(root);assert.equal(new Set(['a-b/c','a/b-c','A/b','a/b','a_b'].map(p=>scan.generateServiceId(path.join(root,p)))).size,5);
});

test('cache serializes simultaneous writers and rejects incompatible schema', async t => {
 const {cacheDir}=fixture(t),modulePath=require.resolve('../packages/core/dist');
 await Promise.all(Array.from({length:6},(_,i)=>new Promise((resolve,reject)=>{
  const script=`const {ContextCache}=require(${JSON.stringify(modulePath)});new ContextCache(${JSON.stringify(cacheDir)}).set({identity:{serviceId:'svc${i}',branch:'main',commitHash:'aaa0001'},analyzedAt:'now'});`;
  const child=spawn(process.execPath,['-e',script]);child.on('error',reject);child.on('exit',code=>code?reject(Error('writer failed')):resolve());
 })));
 assert.equal(new ContextCache(cacheDir).listCached().length,6);
 const p=path.join(cacheDir,'index.json'),index=JSON.parse(fs.readFileSync(p));index.metadata.svc0.schemaVersion=999;fs.writeFileSync(p,JSON.stringify(index));assert.equal(new ContextCache(cacheDir).get('svc0','main','aaa0001'),null);
});

test('Compose edits invalidate cached dependencies without source edits or leaking credentials', async t => {
 const {root,cacheDir}=fixture(t);write(root,'svc/package.json','{}');write(root,'svc/index.js','const x=process.env.DATABASE_URL;');write(root,'compose.yaml','services:\n  svc:\n    build: ./svc\n    environment:\n      DATABASE_URL: postgresql://user:secret@postgres:5432/old_db\n');init(root);
 const e=new ContextGraphEngine({workspaceRoot:root,cacheDir});let r=await e.analyze();assert(r.services[0].dependencies.some(d=>d.targetService==='old_db'));assert(!JSON.stringify(r).includes('secret'));
 const p=path.join(root,'compose.yaml');fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace('old_db','new_db'));r=await e.analyze();assert(r.services[0].dependencies.some(d=>d.targetService==='new_db'));assert(!r.services[0].dependencies.some(d=>d.targetService==='old_db'));
});

test('non-Git to Git does not fabricate a diff against unknown', async t => {
 const {root,cacheDir}=fixture(t);write(root,'package.json','{}');write(root,'index.js',"app.get('/x',()=>{})");const e=new ContextGraphEngine({workspaceRoot:root,cacheDir});await e.analyze();write(root,'index.js',"app.get('/new',()=>{})");init(root);const r=await e.analyze();assert.equal(r.services[0].apis[0].path,'/new');assert.equal(await e.detectAndAnalyzeChanges(r.services[0].identity.serviceId,r.services),null);
});

test('local client uses chat template without thinking and accepts fenced JSON', async () => {
 const client=new LocalGraniteClient();client.start=async()=>{};let body;
 client.http={post:async(_url,b)=>{body=b;return {data:{choices:[{message:{content:'```json\n{"ok":true}\n```'}}]}}}};
 assert.deepEqual(await client.generateJson('test'),{ok:true});assert.equal(body.chat_template_kwargs.enable_thinking,false);assert.equal(body.stream,false);client.dispose();
});

test('malformed AI impact is replaced by labeled deterministic output', async () => {
 const runtime=new WatsonxRuntime({isConfigured:()=>true,generateJson:async()=>({impacts:'bad'})});
 const svc={identity:{serviceId:'s',name:'s'},apis:[],database:[],dependencies:[]};
 const result=await runtime.analyzeImpact({serviceId:'s',oldCommit:'aaaaaaa',newCommit:'bbbbbbb',changedFiles:[],affectsApi:false,affectsDatabase:false,affectsDependencies:false},svc,[]);
 assert.equal(result.reasoningSource,'deterministic');assert(Array.isArray(result.impacts));
});

const {test} = require('node:test'), assert = require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),Module=require('module'),{execFileSync}=require('child_process');
test('extension activation, Skip, sidebar, webview, committed impact and live settings', async t => {
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bcg-ui-')),root=path.join(tmp,'workspace');fs.cpSync(path.resolve('demo/microservices'),root,{recursive:true});
 const git=(...args)=>execFileSync('git',args,{cwd:root,stdio:'ignore'});git('init','-q','-b','main');git('add','.');git('-c','user.name=QA','-c','user.email=qa@local','commit','-qm','base');
 const commands=new Map(),providers=new Map(),events=[],messages=[],panels=[];let prompts=0,configListener;
 const configValues={aiProvider:'none',cacheDir:path.join(tmp,'cache')};
 const disposable={dispose(){}};
 const config={get:key=>configValues[key],inspect:key=>({globalValue:configValues[key]}),update:async(key,value)=>{configValues[key]=value}};
 class TreeItem{constructor(label,state){this.label=label;this.collapsibleState=state;}}
 const vscode={TreeItem,TreeItemCollapsibleState:{None:0,Collapsed:1,Expanded:2},ThemeIcon:class{},ThemeColor:class{},EventEmitter:class{event=()=>disposable;fire(){}},ProgressLocation:{Window:1,Notification:2},ViewColumn:{One:1},ConfigurationTarget:{Global:1},RelativePattern:class{constructor(base,pattern){this.base=base;this.pattern=pattern}},
 workspace:{workspaceFolders:[{uri:{fsPath:root}}],getConfiguration:()=>config,onDidChangeConfiguration:fn=>{configListener=fn;return disposable},createFileSystemWatcher:()=>({dispose(){},onDidChange:fn=>{events.push(fn);return disposable},onDidCreate:()=>disposable,onDidDelete:()=>disposable})},
 commands:{registerCommand:(id,fn)=>{commands.set(id,fn);return disposable},executeCommand:async id=>commands.get(id)()},
 window:{registerTreeDataProvider:(id,p)=>{providers.set(id,p);return disposable},showQuickPick:async()=>{prompts++;return undefined},showInformationMessage:message=>messages.push(message),showWarningMessage:message=>messages.push(message),showErrorMessage:message=>{throw Error(message)},withProgress:async(_opts,fn)=>fn({}, {onCancellationRequested:()=>disposable}),createWebviewPanel:(_id,_title,_column,options)=>{const panel={options,webview:{html:'',postMessage:m=>{panel.last=m},onDidReceiveMessage:()=>disposable},reveal(){},onDidDispose:()=>disposable};panels.push(panel);return panel}}
 };
 const original=Module._load;Module._load=function(id,...args){return id==='vscode'?vscode:original.call(this,id,...args)};
 const extPath=path.resolve('packages/vscode-extension/dist/extension.js');delete require.cache[extPath];const ext=require(extPath);Module._load=original;
 const context={subscriptions:[],extensionPath:path.resolve('packages/vscode-extension'),extensionUri:{},secrets:{get:async()=>undefined,store:async()=>{}}};
 t.after(()=>{ext.deactivate();context.subscriptions.forEach(d=>d.dispose());fs.rmSync(tmp,{recursive:true,force:true});});
 await ext.activate(context);await new Promise(r=>setTimeout(r,30));assert.equal(prompts,0,'Skip must be remembered');assert.equal(commands.size,5);
 const explorer=providers.get('bcg.serviceExplorer'),service=explorer.getChildren().find(s=>s.label==='order-service');const groups=explorer.getChildren(service);assert.equal(explorer.getChildren(groups[0]).length,6,'all APIs expandable');assert(explorer.getChildren(explorer.getChildren(groups[1])[0]).length>0,'columns expandable');
 await commands.get('bcg.openGraph')();assert.equal(panels.length,1);assert.deepEqual(panels[0].options.localResourceRoots,[]);assert(panels[0].webview.html.includes('Content-Security-Policy'));
 const controller=path.join(root,'order-service/src/main/java/com/demo/order/controller/OrderController.java');fs.writeFileSync(controller,fs.readFileSync(controller,'utf8').replace('/orders','/orders-ui'));git('add','.');git('-c','user.name=QA','-c','user.email=qa@local','commit','-qm','route');
 await commands.get('bcg.analyzeChanges')();const panel=panels[0];assert(panel.last.graph.nodes.find(n=>n.id==='order-service').data.apis.some(a=>a.path.startsWith('/orders-ui')));assert(panel.last.impactReport);assert(providers.get('bcg.impactPanel').getChildren().some(x=>x.label==='order-service'));
 configValues.cacheDir=path.join(tmp,'cache2');await configListener({affectsConfiguration:key=>key==='bcg.cacheDir'});assert(fs.existsSync(configValues.cacheDir));
});

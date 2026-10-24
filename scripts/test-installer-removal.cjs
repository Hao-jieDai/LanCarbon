const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base=path.join(root,'acceptance');fs.mkdirSync(base,{recursive:true});
function find(directory){if(fs.existsSync(path.join(directory,'makensis.exe'))&&fs.existsSync(path.join(directory,'Include')))return path.join(directory,'makensis.exe');for(const e of fs.readdirSync(directory,{withFileTypes:true})){if(e.isDirectory()){const r=find(path.join(directory,e.name));if(r)return r;}}}
const cache=path.join(root,'.builder-cache'),nsis=fs.readdirSync(cache).filter(n=>/^nsis-\d/.test(n));const compiler=nsis.map(n=>find(path.join(cache,n))).find(Boolean);if(!compiler)throw Error('Build the installer once to obtain NSIS.');
const fixture=fs.mkdtempSync(path.join(base,'installer-removal-'));
try{
 for(const dir of ['Application/nested/files','Data','Config','Library'])fs.mkdirSync(path.join(fixture,dir),{recursive:true});
 for(const dir of ['Data','Config','Library'])fs.writeFileSync(path.join(fixture,dir,'keep.txt'),'preserve');
 fs.writeFileSync(path.join(fixture,'Application/nested/files/runtime.txt'),'old program');
 for(const [label,leaf,exit]of [['application','Application',0],['guard','Data',2]]){
  const output=path.join(fixture,label+'.exe');
  const build=spawnSync(compiler,['/V2','/DTEST_OUTPUT='+output,'/DTEST_TARGET='+path.join(fixture,leaf),path.join(root,'tests/fixtures/installer-removal.nsi')],{encoding:'utf8',windowsHide:true});assert.equal(build.status,0,build.stdout+build.stderr);
  const run=spawnSync(output,[],{windowsHide:true,timeout:30000});assert.equal(run.status,exit,run.error?.message);
  for(const dir of ['Data','Config','Library'])assert.equal(fs.readFileSync(path.join(fixture,dir,'keep.txt'),'utf8'),'preserve');
 }
 assert(!fs.existsSync(path.join(fixture,'Application')));console.log('Installer removal: application staging and data-directory guard passed.');
}finally{if(path.dirname(fixture)!==base||!path.basename(fixture).startsWith('installer-removal-'))throw Error('Unsafe cleanup');fs.rmSync(fixture,{recursive:true,force:true});}

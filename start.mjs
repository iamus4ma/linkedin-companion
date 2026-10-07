import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const hasDashboard=await fs.access(path.join(root,'copilot-site','package.json')).then(()=>true,()=>false);
async function existingDashboard(){
 try{
  const directory=path.join(root,'copilot-site');
  const lock=JSON.parse(await fs.readFile(path.join(directory,'.vinext','dev','lock.json'),'utf8'));
  if(path.resolve(lock.cwd)!==directory||lock.port!==5173||!Number.isInteger(lock.pid)||lock.pid<=0)return false;
  process.kill(lock.pid,0);
  const response=await fetch('http://127.0.0.1:5173',{redirect:'manual',signal:AbortSignal.timeout(10000)});
  await response.body?.cancel();
  // Any HTTP response proves the matching locked server is listening.
  // Authentication redirects and application errors are not process failures.
  return response.status>=100;
 }catch{return false}
}
const reuseDashboard=hasDashboard&&await existingDashboard();
if(reuseDashboard)console.log('Using the existing dashboard at http://127.0.0.1:5173. This command will stop only the companion on Ctrl+C.');
if(hasDashboard&&!await fs.access(path.join(root,'copilot-site','node_modules')).then(()=>true,()=>false)){
 console.error('Install dashboard dependencies first: npm install --prefix copilot-site');
 process.exit(1);
}
const children=[];
let stopping=false;
async function stop(code=0){
 if(stopping)return;stopping=true;
 await Promise.all(children.filter(child=>child.exitCode===null&&child.pid).map(child=>new Promise(resolve=>{
  if(process.platform==='win32'){
   // Stop only process trees launched by this command, including Vite workers.
   const killer=spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});
   killer.once('error',resolve);killer.once('exit',resolve);
  }else{try{process.kill(-child.pid,'SIGTERM')}catch{}resolve()}
 })));
 process.exit(code);
}
process.on('SIGINT',()=>void stop());
process.on('SIGTERM',()=>void stop());
for(const file of ['server.mjs',...(hasDashboard&&!reuseDashboard?['start-dashboard.mjs']:[])]){
 const child=spawn(process.execPath,[path.join(root,file)],{cwd:root,stdio:'inherit',env:process.env,windowsHide:true,detached:process.platform!=='win32'});
 children.push(child);
 child.once('error',error=>{console.error(`Could not start ${file}: ${error.message}`);void stop(1)});
 child.once('exit',async(code,signal)=>{if(!stopping){
  if(file==='start-dashboard.mjs'&&await existingDashboard()){console.log('Using the existing dashboard; companion remains running.');return}
  console.error(`${file} stopped${signal?' ('+signal+')':''}. Stopping the other service.`);void stop(code||1)
 }});
}

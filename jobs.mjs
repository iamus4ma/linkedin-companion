import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

export function postKey(value){const u=new URL(value);const id=decodeURIComponent(u.href).match(/(?:activity[:\-]|ugcPost:)(\d+)/)?.[1];return id||u.origin+u.pathname.replace(/\/$/,'');}
export function createScanJobs(root,scan,analyze){
 const file=path.join(root,'.automation','scan.json');let job=null,running=false;
 const save=async()=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',JSON.stringify(job));await fs.rename(file+'.tmp',file)};
 const load=async()=>{if(!job){try{job=JSON.parse(await fs.readFile(file,'utf8'));if(job.status==='running'){job.status='paused';job.message='Scan interrupted. Resume to continue.'}}catch(e){if(e.code!=='ENOENT')throw e}}return job};
 return {
  async status(){await load();return job?{...job,settings:undefined,candidates:undefined,seen:undefined}:{status:'idle',posts:[]}},
  async start(settings,resume=false){await load();if(running)throw Error('A scan is already running.');if(!resume||!job){job={id:crypto.randomUUID(),status:'running',stage:'searching',message:'Starting search',settings,candidates:[],posts:[],seen:[],queryIndex:0,draftIndex:0,belowThreshold:0}}else{job.status='running';job.error=''}await save();running=true;
   const work=(async()=>{try{await scan(root,job.settings,analyze,{state:job,checkpoint:save,progress:async(stage,message)=>{job.stage=stage;job.message=message;await save()}});job.status='complete';job.stage='ready';job.message='Scan complete'}catch(e){job.status='failed';job.error=e.message;job.message=e.message}finally{running=false;await save()}})();
   return {id:job.id,work};
  }
 };
}

export function createDraftCache(root){
 const file=path.join(root,'.automation','drafts.json');let cache;let writes=Promise.resolve();
 return async(key,generate,refresh=false)=>{
  if(!cache){try{cache=JSON.parse(await fs.readFile(file,'utf8'))}catch(e){if(e.code!=='ENOENT')throw e;cache={}}}
  const hash=crypto.createHash('sha256').update(JSON.stringify(key)).digest('hex');
  if(!refresh&&cache[hash]&&Date.now()-cache[hash].at<7*86400000)return cache[hash].value;
  const value=await generate();cache[hash]={at:Date.now(),value};
  cache=Object.fromEntries(Object.entries(cache).sort((a,b)=>b[1].at-a[1].at).slice(0,200));
  const snapshot=JSON.stringify(cache);writes=writes.catch(()=>{}).then(async()=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file+'.tmp',snapshot);await fs.rename(file+'.tmp',file)});await writes;return value;
 };
}
export async function fetchWithRetry(url,options,fetcher=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms))){
 for(let attempt=0;;attempt++){
  const response=await fetcher(url,{...options,signal:AbortSignal.timeout(60000)});
  if(response.status!==429||attempt>=2)return response;
  const detail=await response.clone().json().catch(()=>({}));
  if(/quota|credit|spend|usage_limit/.test(detail.error?.code||detail.error?.type||''))return response;
  const retry=response.headers.get('retry-after');const seconds=Number(retry);const delay=retry?(Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-Date.now()):1000*2**attempt;
  if(delay>30000)return response;
  await sleep(Math.max(1000,Number.isFinite(delay)?delay:1000));
 }
}

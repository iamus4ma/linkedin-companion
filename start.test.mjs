import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';

test('an existing healthy dashboard is reused without launching a duplicate',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'copilot-reuse-'));
 await fs.copyFile(new URL('./start.mjs',import.meta.url),path.join(root,'start.mjs'));
 const directory=path.join(root,'copilot-site');
 await fs.mkdir(path.join(directory,'node_modules'),{recursive:true});
 await fs.mkdir(path.join(directory,'.vinext','dev'),{recursive:true});
 await fs.writeFile(path.join(directory,'package.json'),'{}');
 await fs.writeFile(path.join(directory,'.vinext','dev','lock.json'),JSON.stringify({cwd:directory,port:5173,pid:process.pid}));
 await fs.writeFile(path.join(root,'healthy.mjs'),"globalThis.fetch=async(url,options)=>{if(options.redirect!=='manual')throw Error('redirect count exceeded');return new Response(null,{status:302,headers:{location:'/'}})}");
 await fs.writeFile(path.join(root,'server.mjs'),"console.log('COMPANION_STARTED');setTimeout(()=>process.exit(2),100)");
 await fs.writeFile(path.join(root,'start-dashboard.mjs'),"console.log('DUPLICATE_DASHBOARD')");
 const child=spawn(process.execPath,['--import',pathToFileURL(path.join(root,'healthy.mjs')).href,path.join(root,'start.mjs')],{stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
 await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject)});
 assert.match(output,/Using the existing dashboard/);assert.match(output,/COMPANION_STARTED/);assert.doesNotMatch(output,/DUPLICATE_DASHBOARD/);
});

test('combined startup inherits environment and stops sibling after a service fails',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'copilot-launcher-'));
 await fs.copyFile(new URL('./start.mjs',import.meta.url),path.join(root,'start.mjs'));
 await fs.mkdir(path.join(root,'copilot-site','node_modules'),{recursive:true});
 await fs.writeFile(path.join(root,'copilot-site','package.json'),'{}');
 await fs.writeFile(path.join(root,'server.mjs'),"console.log('SERVER:'+process.pid+':'+process.env.LAUNCH_TEST);setInterval(()=>{},1000)");
 await fs.writeFile(path.join(root,'start-dashboard.mjs'),"console.log('DASHBOARD:'+process.env.LAUNCH_TEST);setTimeout(()=>process.exit(2),500)");
 const child=spawn(process.execPath,[path.join(root,'start.mjs')],{env:{...process.env,LAUNCH_TEST:'inherited'},stdio:['ignore','pipe','pipe']});
 let output='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>output+=data);
 const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve)});
 assert.equal(code,2);assert.match(output,/DASHBOARD:inherited/);const match=output.match(/SERVER:(\d+):inherited/);assert.ok(match);
 assert.throws(()=>process.kill(Number(match[1]),0));
});

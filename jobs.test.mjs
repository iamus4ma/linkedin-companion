import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createScanJobs,createDraftCache,fetchWithRetry,postKey} from './jobs.mjs';

test('failed scans persist completed drafts and resume after process restart',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'copilot-jobs-'));
 const scan=async(root,settings,analyze,{state,checkpoint})=>{if(!state.draftIndex){state.posts.push({url:'https://www.linkedin.com/posts/one'});state.draftIndex=1;await checkpoint();throw Error('Rate limit')}state.posts.push({url:'https://www.linkedin.com/posts/two'});state.draftIndex=2;await checkpoint()};
 const jobs=createScanJobs(root,scan,()=>{});await (await jobs.start({profile:'React developer'})).work;
 assert.equal((await jobs.status()).status,'failed');
 const restarted=createScanJobs(root,scan,()=>{});assert.equal((await restarted.status()).posts.length,1);
 await (await restarted.start({},true)).work;const status=await restarted.status();assert.equal(status.status,'complete');assert.equal(status.posts.length,2);assert.equal(status.settings,undefined);
});
test('cache survives restart, separates profile facts, and permits regeneration',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'copilot-cache-'));let calls=0;const generate=async()=>({comment:String(++calls)});
 const cache=createDraftCache(root);await cache({profile:'A'},generate);assert.equal((await createDraftCache(root)({profile:'A'},generate)).comment,'1');
 await cache({profile:'B'},generate);await cache({profile:'A'},generate,true);assert.equal(calls,3);
});
test('rate limit retries respect Retry-After and never retry exhausted quota',async()=>{
 let calls=0;const waits=[];const fetcher=async()=>++calls<3?new Response('{"error":{"code":"rate_limit"}}',{status:429,headers:{'retry-after':'2'}}):new Response('{}');
 assert.equal((await fetchWithRetry('test',{},fetcher,async ms=>waits.push(ms))).status,200);assert.deepEqual(waits,[2000,2000]);
 calls=0;await fetchWithRetry('test',{},async()=>{calls++;return new Response('{"error":{"code":"insufficient_quota"}}',{status:429})});assert.equal(calls,1);
});
test('tracking URLs and alternate activity links deduplicate',()=>{
 assert.equal(postKey('https://www.linkedin.com/posts/name-activity-123?tracking=x'),postKey('https://www.linkedin.com/feed/update/urn:li:activity:123/'));
});

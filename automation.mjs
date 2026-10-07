import path from 'node:path';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {postKey} from './jobs.mjs';
let context;
export async function browser(root){
 if(context&&!context.browser()?.isConnected())context=undefined;
 if(!context){const launched=await chromium.launchPersistentContext(path.join(root,'.browser-profile'),{channel:'chrome',headless:false});context=launched;launched.on('close',()=>{if(context===launched)context=undefined})}
 return context;
}
function requireLinkedIn(page){const u=new URL(page.url());if(!['linkedin.com','www.linkedin.com'].includes(u.hostname))throw Error('The link did not open a LinkedIn post. Use the full post URL.');if(/login|checkpoint|authwall|signup/.test(u.pathname))throw Error('Sign in to LinkedIn in the companion Chrome window, then retry.');}
export async function openLogin(root){const c=await browser(root);let page=c.pages().find(p=>p.url().includes('linkedin.com'));page??=await c.newPage();await page.goto('https://www.linkedin.com/feed/',{waitUntil:'domcontentloaded',timeout:30000});await page.bringToFront();return {opened:true};}
export function extractPosts({includeUnlinked=false}={}){
 const cards=new Set(document.querySelectorAll('.feed-shared-update-v2,[data-urn*="urn:li:activity:"],[data-id*="urn:li:activity:"]'));
 for(const link of document.querySelectorAll('a[href*="/feed/update/"],a[href*="/posts/"]')){const card=link.closest('article,[role="article"],.feed-shared-update-v2,[data-urn],[data-id]');if(card)cards.add(card)}
 // The newer search UI exposes "Feed post" labels instead of legacy classes.
 const labels=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeValue.trim()==='Feed post'?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_SKIP});
 for(let label=labels.nextNode();label;label=labels.nextNode()){
  for(let card=label.parentElement;card&&card!==document.body;card=card.parentElement){
   const buttons=[...card.querySelectorAll('button,[role="button"]')];
   const hasComment=buttons.some(b=>/^comment\b/i.test(b.getAttribute('aria-label')||b.innerText.trim()));
   const hasRepost=buttons.some(b=>/^repost\b/i.test(b.getAttribute('aria-label')||b.innerText.trim()));
   if(hasComment&&hasRepost){cards.add(card);break}
  }
 }
 const posts=[],seen=new Set();
 for(const card of cards){
  const attributes=[card.getAttribute('data-urn'),card.getAttribute('data-id'),...[...card.querySelectorAll('[data-urn],[data-id]')].slice(0,20).flatMap(n=>[n.getAttribute('data-urn'),n.getAttribute('data-id')])];
  const urn=attributes.map(v=>v?.match(/urn:li:activity:\d+/)?.[0]).find(Boolean);
  const link=[...card.querySelectorAll('a')].find(a=>{try{const u=new URL(a.href);return u.protocol==='https:'&&['www.linkedin.com','linkedin.com'].includes(u.hostname)&&/^\/(feed\/update\/|posts\/)/.test(u.pathname)}catch{return false}});
  const url=urn?'https://www.linkedin.com/feed/update/'+urn:link?.href;
  const content=card.querySelector('[data-testid="expandable-text-box"],.update-components-text,.feed-shared-update-v2__description,.feed-shared-inline-show-more-text,.feed-shared-text');
  const lines=(card.innerText||'').split('\n').map(x=>x.trim()).filter(Boolean);
  const author=card.querySelector('.update-components-actor__title,.feed-shared-actor__name,a[href*="/in/"]')?.innerText?.split('\n')[0].trim()||lines[lines[0]==='Feed post'?1:0]||'LinkedIn author';
  const followIndex=lines.findIndex(x=>/^(Follow|Connect)$/.test(x));
  const fallback=(followIndex>=0?lines.slice(followIndex+1).join('\n'):lines.filter(x=>x!=='Feed post').join('\n')).split(/\nLike\nComment\nRepost\nSend/)[0];
  const text=(content?.innerText||fallback).trim().slice(0,30000);
  if((!url&&!includeUnlinked)||!text||seen.has(url||text))continue;
  seen.add(url||text);const marker='post-'+posts.length;card.setAttribute('data-copilot-post',marker);
  posts.push({url,marker,componentKey:card.getAttribute('componentkey'),author,text,title:text.split('\n').find(x=>x.trim())?.slice(0,120)||'LinkedIn post'});
  if(posts.length>=8)break;
 }
 return posts;
}
export async function resolvePostLink(context,text,depth=0){
 if(depth>3)throw Error('Too many nested post redirects.');
 const url=new URL(text.trim());
 if(url.protocol!=='https:'||url.username||url.password||url.port)throw Error('Invalid post link.');
 if(['linkedin.com','www.linkedin.com'].includes(url.hostname)&&/^\/safety\/go\/?$/.test(url.pathname)){
  const destination=url.searchParams.get('url');
  if(!destination)throw Error('LinkedIn safety link has no destination URL.');
  return resolvePostLink(context,destination,depth+1);
 }
 if(['linkedin.com','www.linkedin.com'].includes(url.hostname)&&/^\/(feed\/update\/|posts\/)/.test(url.pathname))return url.href;
 if(url.hostname==='lnkd.in'){
  const tab=await context.newPage();
  try{await tab.goto(url.href,{waitUntil:'domcontentloaded',timeout:15000});await tab.waitForURL(u=>['linkedin.com','www.linkedin.com'].includes(u.hostname),{timeout:15000});const target=new URL(tab.url());if(target.protocol==='https:'&&['linkedin.com','www.linkedin.com'].includes(target.hostname)&&/^\/(feed\/update\/|posts\/)/.test(target.pathname))return target.href;}finally{await tab.close()}
 }
 throw Error(`Unsupported copied post link: ${url.hostname}${url.pathname}`);
}
export async function readSearchPosts(page,failures=[]){
 const batch=await page.evaluate(extractPosts,{includeUnlinked:true});
 if(!batch.some(p=>!p.url))return batch;
 await page.bringToFront();
 const context=page.context();await context.grantPermissions(['clipboard-read','clipboard-write'],{origin:'https://www.linkedin.com'});
 const previousClipboard=await page.evaluate(()=>navigator.clipboard.readText()).catch(()=>undefined);
 try{
  for(const post of batch.slice(0,3)){
   if(post.url)continue;
   const card=page.locator(post.componentKey?`[componentkey=${JSON.stringify(post.componentKey)}]`:`[data-copilot-post="${post.marker}"]`);
   const menuButton=card.getByRole('button',{name:/control menu for post|more actions|post options/i}).first();
   try{
    await page.bringToFront();
    const priorLinks=await page.getByRole('link',{name:/^view post$/i}).evaluateAll(links=>links.map(a=>a.href));
    await menuButton.click({timeout:4000});
    const copy=page.getByText(/^copy link(?: to post)?$/i).first();
    await copy.waitFor({state:'visible',timeout:4000});
    const beforeCopy=await page.evaluate(()=>navigator.clipboard.readText()).catch(()=>'');
    await page.evaluate(()=>navigator.clipboard.writeText('')).catch(()=>{});
    await copy.click({timeout:4000});
    let text='';
    for(let attempt=0;attempt<15;attempt++){
     const links=await page.getByRole('link',{name:/^view post$/i}).evaluateAll(links=>links.map(a=>a.href));
     text=links.find(href=>!priorLinks.includes(href))||await page.evaluate(()=>navigator.clipboard.readText()).catch(()=>'');
     if(/^https:\/\//.test(text)&&text!==beforeCopy)break;text='';await page.waitForTimeout(200);
    }
    post.url=await resolvePostLink(context,text);
    if(!post.url)throw Error('Copy link did not return a supported LinkedIn post URL.');
   }catch(e){failures.push({stage:'copy-post-link',message:e.message.slice(0,1500)});await page.keyboard.press('Escape').catch(()=>{})}
  }
 }finally{if(previousClipboard!==undefined)await page.evaluate(text=>navigator.clipboard.writeText(text),previousClipboard).catch(()=>{})}
 return batch.filter(p=>p.url);
}
async function saveDiscoveryDiagnostic(root,page,failures){
 const details=await page.evaluate(()=>({url:location.href,title:document.title,visibleText:document.body.innerText.slice(0,12000),cards:[...document.querySelectorAll('article,[role="article"],[data-urn],[data-id],[data-copilot-post]')].slice(0,60).map(n=>({tag:n.tagName,classes:n.className,urn:n.getAttribute('data-urn'),id:n.getAttribute('data-id'),html:n.outerHTML.slice(0,30000)})),feedLabels:[...document.querySelectorAll('h2,h3,[role="heading"],span,p')].filter(n=>n.textContent.trim()==='Feed post').slice(0,3).map(n=>n.parentElement.parentElement.outerHTML.slice(0,30000))}));
 details.failures=failures;
 const dir=path.join(root,'.diagnostics');await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'linkedin-discovery.json'),JSON.stringify(details,null,2));
}
export async function scanPosts(root,data,analyze,hooks={}){
 const interests=String(data.interests||'React').split(',').map(x=>x.trim()).filter(Boolean).slice(0,3);
 const locations=String(data.jobLocation||'').split(',').map(x=>x.trim()).filter(Boolean).slice(0,2);
 const queries=interests.flatMap((topic,index)=>[topic,`${topic} hiring ${locations[index%locations.length]||''}`.trim()]);
 const limit=Math.max(1,Math.min(12,Number(data.maxPosts)||6));
 const state=hooks.state||{candidates:[],posts:[],seen:[],queryIndex:0,draftIndex:0,belowThreshold:0};
 const checkpoint=hooks.checkpoint||asyncNoop,progress=hooks.progress||asyncNoop;
 const seen=new Set([...(data.seenUrls||[]).map(postKey),...state.seen]);
 const c=await browser(root),page=await c.newPage();const failures=[];let keepOpen=false;
 try{
  for(;state.queryIndex<queries.length&&state.candidates.length<limit;state.queryIndex++){
   const query=queries[state.queryIndex];await progress('searching',`Searching: ${query}`);
   await page.goto('https://www.linkedin.com/search/results/content/?keywords='+encodeURIComponent(query),{waitUntil:'domcontentloaded',timeout:30000});requireLinkedIn(page);
   if(['day','week','month'].includes(data.datePosted)){
    await page.getByRole('button',{name:/date posted/i}).click({timeout:10000});
    const label={day:'Past 24 hours',week:'Past week',month:'Past month'}[data.datePosted];
    await page.getByText(label,{exact:true}).click({timeout:5000});
    const apply=page.getByRole('button',{name:/show results|apply/i});if(await apply.count())await apply.first().click();
   }
   await page.waitForFunction(()=>/Feed post|no results|no posts found/i.test(document.body.innerText)||document.querySelector('.feed-shared-update-v2'),{},{timeout:20000});requireLinkedIn(page);
   await progress('reading',`Reading posts: ${query}`);
   const batch=await readSearchPosts(page,failures);
   let added=0;const queryLimit=Math.ceil(limit/queries.length);
   for(const p of batch){const key=postKey(p.url);if(!seen.has(key)&&state.candidates.length<limit&&added<queryLimit){seen.add(key);state.seen.push(key);state.candidates.push(p);added++;await checkpoint()}}
   await checkpoint();
  }
  if(!state.candidates.length&&failures.length)throw Error('Posts were found, but links could not be read. See the saved discovery diagnostic.');
  const minimum=Math.max(0,Math.min(100,Number(data.minScore)||0));
  for(;state.draftIndex<state.candidates.length;){
   const candidate=state.candidates[state.draftIndex];await progress('drafting',`Drafting ${state.draftIndex+1} of ${state.candidates.length}`);
   const draft=await analyze({...data,post:candidate.text});
   if(draft.score<minimum)state.belowThreshold++;else state.posts.push({...candidate,...draft,kind:draft.kind==='job'?'job':'discussion',status:'review'});
   state.draftIndex++;await checkpoint();
  }
  return {posts:state.posts,belowThreshold:state.belowThreshold};
 }catch(e){keepOpen=true;await page.bringToFront();await saveDiscoveryDiagnostic(root,page,[...failures,{stage:state.stage||'scan',message:e.message}]).catch(()=>{});throw e}
 finally{if(!keepOpen)await page.close().catch(()=>{})}
}
async function asyncNoop(){}
export async function prepareComment(root,url,comment){
 const c=await browser(root);let page=c.pages().find(p=>{try{return postKey(p.url())===postKey(url)}catch{return false}});
 if(!page){page=await c.newPage();await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000})}requireLinkedIn(page);
 await page.bringToFront();
 try{return await fillComment(page,comment)}catch(e){
  const dir=path.join(root,'.diagnostics');await fs.mkdir(dir,{recursive:true});
  const fields=await page.locator('textarea,[contenteditable], [role="textbox"]').evaluateAll(nodes=>nodes.map(n=>({tag:n.tagName,role:n.getAttribute('role'),label:n.getAttribute('aria-label'),placeholder:n.getAttribute('data-placeholder')||n.getAttribute('placeholder'),editable:n.getAttribute('contenteditable')})));
  await fs.writeFile(path.join(dir,'linkedin-prepare.json'),JSON.stringify({url:page.url(),error:e.message,fields},null,2));
  throw Error('Could not prepare the comment: '+e.message.replace(/\u001b\[[0-9;]*m/g,'')+'. Editor details saved locally.');
 }
}
export async function fillComment(page,comment){
 const selector=[
  '.comments-comment-box [contenteditable="true"]',
  '.comments-comment-box__form [contenteditable="true"]',
  '[contenteditable="true"][aria-label*="comment" i]',
  '[contenteditable="true"][data-placeholder*="comment" i]',
  '[contenteditable="true"][aria-placeholder*="comment" i]',
  'textarea[placeholder*="comment" i]',
  'textarea[aria-label*="comment" i]',
 ].map(s=>s+':visible').join(',');
 const editor=page.locator(selector).first();
 if(!await editor.isVisible())await page.getByRole('button',{name:/^comment$/i}).first().click({timeout:12000});
 await editor.waitFor({state:'visible',timeout:15000});
 const read=()=>editor.evaluate(el=>'value' in el?el.value:el.innerText);
 if((await read()).trim()===comment.trim()){await editor.focus();return {prepared:true,posted:false}}
 if((await read()).trim())throw Error('An existing draft is present. Review it manually before preparing another.');
 await editor.fill(comment);
 if((await read()).replace(/\r\n/g,'\n').trim()!==comment.replace(/\r\n/g,'\n').trim())throw Error('LinkedIn did not retain the comment. Review the open comment box and retry.');
 await editor.focus();await page.bringToFront();return {prepared:true,posted:false};
}

import {openJobPage,readJobPage} from './application-browser.mjs';

export function profileJobSearch({profile='',masterCV=''}){
 for(const [field,value,limit] of [['profile',profile,12000],['masterCV',masterCV,50000]])if(typeof value!=='string'||value.length>limit)throw Error(`Provide ${field} within ${limit} characters.`);
 if(!profile.trim()&&!masterCV.trim())throw Error('Add your profile or master CV before searching for jobs.');
 const role=text=>/full[ -]?stack/i.test(text)?'Full Stack Developer':/front[ -]?end/i.test(text)?'Frontend Developer':/back[ -]?end/i.test(text)?'Backend Developer':/react\b/i.test(text)?'React Developer':/next\.?js/i.test(text)?'Next.js Developer':/software engineer/i.test(text)?'Software Engineer':'';
 const keywords=role(profile)||role(masterCV);
 const location=(profile.match(/(?:preferred location|location|based in)\s*:\s*([^\n|;]+)/i)?.[1]||masterCV.match(/^\s*([A-Za-z .'-]+,\s*[A-Za-z .'-]+)\s*\|/m)?.[1]||'').trim().slice(0,150);
 return {keywords,location};
}
export function linkedInJobKey(value){try{const u=new URL(value);return /(^|\.)linkedin\.com$/.test(u.hostname)?u.pathname.match(/^\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/)?.[1]||u.href:u.href}catch{return value}}
export function linkedInJobSearchURL(data){
 for(const [field,limit] of [['keywords',200],['location',150]])if(data[field]!==undefined&&(typeof data[field]!=='string'||data[field].length>limit))throw Error('Enter valid search keywords and location.');
 const suggested=(!data.keywords?.trim()||!data.location?.trim())&&((data.profile||'').trim()||(data.masterCV||'').trim())?profileJobSearch(data):{keywords:'',location:''};
 const keywords=data.keywords?.trim()||suggested.keywords,location=data.location?.trim()||suggested.location;
 if(typeof keywords!=='string'||!keywords||keywords.length>200||typeof location!=='string'||location.length>150)throw Error('Enter search keywords under 200 characters and a location under 150 characters.');
 const workMode=data.workMode||'any',days=data.days||'any';
 if(!['any','remote','hybrid','onsite'].includes(workMode)||!['any','1','7','30'].includes(days))throw Error('Choose a supported work mode and posting date.');
 const u=new URL('https://www.linkedin.com/jobs/search/');u.searchParams.set('keywords',keywords);if(location)u.searchParams.set('location',location);
 if(workMode!=='any')u.searchParams.set('f_WT',({onsite:'1',remote:'2',hybrid:'3'})[workMode]);if(days!=='any')u.searchParams.set('f_TPR','r'+Number(days)*86400);
 return {url:u.href,keywords,location};
}
export function extractLinkedInJobs({limit=5}={}){
 const result=[],seen=new Set();
 const nodes=[...document.querySelectorAll('a[href*="/jobs/view/"],[data-job-id],[data-occludable-job-id]')];
 for(const node of nodes){
  const card=node.closest('li,article,[role="listitem"],.job-search-card,.job-card-container')||node;
  const link=node.matches('a')?node:card.querySelector('a[href*="/jobs/view/"]');
  let id=card.getAttribute('data-job-id')||card.getAttribute('data-occludable-job-id')||node.getAttribute('data-job-id')||node.getAttribute('data-occludable-job-id');
  if(!/^\d+$/.test(id||'')){try{const u=new URL(link?.href);if(!/(^|\.)linkedin\.com$/.test(u.hostname))continue;id=u.pathname.match(/^\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/)?.[1]}catch{continue}}
  if(!id||seen.has(id))continue;
  const title=(card.querySelector('.job-card-list__title,.job-card-container__link,.base-search-card__title,h3')?.innerText||link?.innerText||'').split('\n')[0].trim();
  if(!title)continue;seen.add(id);
  const company=(card.querySelector('.job-card-container__primary-description,.artdeco-entity-lockup__subtitle,.base-search-card__subtitle')?.innerText||'').trim();
  const location=(card.querySelector('.job-card-container__metadata-item,.job-search-card__location,.artdeco-entity-lockup__caption')?.innerText||'').trim();
  result.push({title,company,location,url:'https://www.linkedin.com/jobs/view/'+id+'/',source:'LinkedIn',description:''});
  if(result.length>=limit)break;
 }
 return result.length?result:false;
}
export async function searchLinkedInJobs(context,data){
 const limit=data.limit??5;
 if(!Number.isInteger(limit)||limit<1||limit>10)throw Error('Search for 1–10 jobs at a time.');
 if(data.seenUrls!==undefined&&(!Array.isArray(data.seenUrls)||data.seenUrls.length>100||data.seenUrls.some(url=>typeof url!=='string'||url.length>2000)))throw Error('Invalid saved job links.');
 const criteria=linkedInJobSearchURL(data),page=await openJobPage(context,criteria.url);
 let cards;
 try{const handle=await page.waitForFunction(extractLinkedInJobs,{limit:20},{timeout:20000,polling:500});try{cards=await handle.jsonValue()}finally{await handle.dispose()}}
 catch{throw Error('No readable LinkedIn job listings were found. The search tab is open; check results or sign in there, then retry with broader keywords.')}
 const seen=new Set((data.seenUrls||[]).map(linkedInJobKey));
 const fresh=cards.filter(job=>!seen.has(linkedInJobKey(job.url))).slice(0,limit),jobs=[];
 let reader;
 for(const card of fresh){
  let job={...card};
  try{
   if(!reader||reader.isClosed())reader=await openJobPage(context,card.url);else await reader.goto(card.url,{waitUntil:'domcontentloaded',timeout:30000});
   const details=await readJobPage(reader);job={...card,description:details.description,company:details.company||card.company};
  }catch{job.warning='The full description could not be read. Open the listing and paste its description after saving.'}
  jobs.push(job);
 }
 await page.bringToFront().catch(()=>{});
 return {jobs,keywords:criteria.keywords,location:criteria.location,searchUrl:criteria.url,message:jobs.length?`Found ${jobs.length} new jobs. Review the listings and save the ones you want.`:'These visible listings are already saved. Try different keywords or filters.'};
}

import dns from 'node:dns/promises';
import {documentBuffer} from './application-documents.mjs';
export async function publicJobURL(value){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hostname==='localhost'||u.hostname.endsWith('.local'))throw Error('Use a public HTTPS job or application URL.');
 const addresses=await dns.lookup(u.hostname,{all:true});
 if(!addresses.length||addresses.some(({address})=>/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|::|f[cd]|fe80)/i.test(address)))throw Error('Local/private job URLs are not supported.');
 return u.href;
}
export async function openJobPage(context,value){
 const url=await publicJobURL(value);const page=await context.newPage();
 await page.route('**/*',async route=>{if(route.request().isNavigationRequest()){try{await publicJobURL(route.request().url())}catch{return route.abort()}}return route.fallback()});
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await page.bringToFront();return page;
}
export function extractJob(){
 const linkedin=/(^|\.)linkedin\.com$/.test(location.hostname);
 const clean=text=>(text||'').split(/Job search smarter with Premium|Looking for talent\?|LinkedIn Corporation ?/i)[0].replace(/^\s*About the job\s*/i,'').trim();
 const usable=text=>text.length>=100&&!/^Job search smarter|^Premium members|^Reactivate Premium/i.test(text);
 let structured;
 const visit=v=>{if(!v||typeof v!=='object')return;if(v['@type']==='JobPosting'||Array.isArray(v['@type'])&&v['@type'].includes('JobPosting'))structured=v;else for(const x of Object.values(v)){if(Array.isArray(x))x.forEach(visit);else if(typeof x==='object')visit(x)}};
 for(const script of document.querySelectorAll('script[type="application/ld+json"]')){try{visit(JSON.parse(script.textContent))}catch{}}
 const plain=html=>{const el=document.createElement('div');el.innerHTML=html;for(const br of el.querySelectorAll('br'))br.replaceWith('\n');return el.textContent||''};
 let description=clean(structured?.description?plain(structured.description):'');
 if(!usable(description)){
  description='';
  // Query each selector separately: a combined selector follows DOM order,
  // so a surrounding main element can win over the actual description.
  for(const selector of ['#job-details','.jobs-description__content','.jobs-box__html-content','.show-more-less-html__markup','.jobs-description','.job-description','[data-testid="job-description"]']){
   for(const el of document.querySelectorAll(selector)){const text=clean(el.innerText);if(usable(text)){description=text;break}}
   if(description)break;
  }
 }
 if(!description&&linkedin){
  const headings=[...document.querySelectorAll('h1,h2,h3,[role="heading"]')].filter(el=>el.textContent.trim()==='About the job');
  for(const heading of headings){
   for(let section=heading.parentElement;section&&section!==document.body&&section.tagName!=='MAIN';section=section.parentElement){
    const text=clean(section.innerText);
    if(usable(text)){description=text;break}
   }
   if(description)break;
  }
 }
 if(!description&&!linkedin)description=clean((document.querySelector('main,[role="main"]')||document.body).innerText);
 if(!usable(description))return false;
 return {title:structured?.title||document.querySelector('h1')?.innerText||document.title,company:structured?.hiringOrganization?.name||'',description:description.slice(0,30000),url:location.href,source:location.hostname};
}
export async function readJobPage(page){
 try{
  const result=await page.waitForFunction(extractJob,undefined,{timeout:20000,polling:500});
  try{return await result.jsonValue()}finally{await result.dispose()}
 }catch(e){if(e.name!=='TimeoutError')throw e;throw Error('Could not find the About the job description. Check the open job tab for sign-in or loading prompts, then retry or paste the description manually. Promotional and footer text was not imported.')}
}
export async function importJob(context,url){
 const page=await openJobPage(context,url);
 // Keep the source open for review, including when extraction fails.
 return readJobPage(page);
}
export function supportedApplicationHost(host){return ['jobs.lever.co','boards.greenhouse.io','job-boards.greenhouse.io','boards.eu.greenhouse.io'].includes(host)}
export async function fillApplication(page,data){
 const filled=[],skipped=[];
 const fields=[['Full name',/^(full name|name)\s*\*?$/i,data.contact.fullName],['First name',/^first name\s*\*?$/i,data.contact.firstName],['Last name',/^last name\s*\*?$/i,data.contact.lastName],['Email',/^e-?mail(?: address)?\s*\*?$/i,data.contact.email],['Phone',/^(phone|phone number|mobile phone)\s*\*?$/i,data.contact.phone],['LinkedIn',/^linkedin(?: profile)?(?: url)?\s*\*?$/i,data.contact.linkedin],['Portfolio',/^(website|portfolio)(?: url)?\s*\*?$/i,data.contact.portfolio],['Cover letter',/^cover letter\s*\*?$/i,data.coverLetter]];
 const names={'Full name':'input[name="name"]','First name':'input[name="first_name"],input[id="first_name"]','Last name':'input[name="last_name"],input[id="last_name"]','Email':'input[name="email"]','Phone':'input[name="phone"]','LinkedIn':'input[name="urls[LinkedIn]"]','Portfolio':'input[name="urls[Portfolio]"]','Cover letter':'textarea[name="comments"],textarea[name="cover_letter"]'};
 for(const [label,pattern,value] of fields){if(!value)continue;const input=page.getByLabel(pattern).or(page.locator(names[label])).filter({visible:true});if(await input.count()!==1){skipped.push(label);continue}const element=input.first();if(!await element.isEditable()||!await element.evaluate(el=>['INPUT','TEXTAREA'].includes(el.tagName)&&!['file','checkbox','radio','hidden','submit'].includes(el.type))){skipped.push(label);continue}if((await element.inputValue()).trim()){skipped.push(label+' (already filled)');continue}await element.fill(value);if(await element.inputValue()===value)filled.push(label);else skipped.push(label+' (value not retained)')}
 const resume=page.locator('input[type="file"][name*="resume" i],input[type="file"][id*="resume" i]').or(page.getByLabel(/^(resume|resume\/cv|cv|attach resume)\s*\*?$/i).and(page.locator('input[type="file"]')));
 if(await resume.count()===1){const input=resume.first();if(await input.evaluate(el=>el.files.length)){skipped.push('Resume (already attached)')}else{const accept=await input.getAttribute('accept')||'';if(accept&&!/docx|wordprocessingml|application\/\*|\.\*/i.test(accept)){skipped.push('Resume (form requires another file format)')}else{await input.setInputFiles({name:'Resume.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await documentBuffer(data.resume)});filled.push('Resume')}}}else skipped.push('Resume');
 const coverFile=page.locator('input[type="file"][name*="cover" i],input[type="file"][id*="cover" i]');
 if(await coverFile.count()===1&&!await coverFile.evaluate(el=>el.files.length)){const accept=await coverFile.getAttribute('accept')||'';if(!accept||/docx|wordprocessingml/i.test(accept)){await coverFile.setInputFiles({name:'Cover-letter.docx',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',buffer:await documentBuffer(data.coverLetter,{kind:'coverLetter'})});filled.push('Cover letter attachment')}}
 return {prepared:filled.length>0,submitted:false,filled,skipped,message:filled.length?'Fields prepared. Review the form, remaining questions and attachments before submitting.':'No supported empty fields were found. Open the application form in this tab and retry, or use the downloaded documents.'};
}
export async function prepareApplication(context,data){
 if(data.approved!==true||!data.contact||!data.resume?.trim()||!data.coverLetter?.trim())throw Error('Approve the resume and cover letter before preparing an application.');
 const url=await publicJobURL(data.url);
 let page=context.pages().find(p=>p.url()===url);page??=await openJobPage(context,url);await page.bringToFront();
 if(!supportedApplicationHost(new URL(page.url()).hostname))return {prepared:false,submitted:false,filled:[],skipped:[],message:'This site is open for manual application. Automatic filling supports standard Lever and Greenhouse forms; download your approved documents for other sites.'};
 const apply=page.getByRole('link',{name:/^apply(?: for this job)?$/i});if(await apply.count()===1&&await apply.isVisible())await apply.click({timeout:10000});
 if(!supportedApplicationHost(new URL(page.url()).hostname))throw Error('The application moved to a different site. Review it manually.');
 await page.locator('input:not([type="hidden"]):not([type="file"]),textarea').first().waitFor({state:'visible',timeout:10000}).catch(()=>{});
 return fillApplication(page,data);
}

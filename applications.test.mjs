import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Ollama} from 'ollama';
import {draftApplication,ollamaStatus,groqApplicationClient,applicationProviderStatus} from './applications.mjs';
import {documentBuffer,readCV,documentBlocks} from './application-documents.mjs';
import {supportedApplicationHost,publicJobURL} from './application-browser.mjs';

const facts='React developer with three years of experience.';
const draft={score:75,summary:'React matches; backend experience is unknown.',matches:['React'],gaps:['Backend experience not supplied'],resume:facts,coverLetter:'I am interested in the React role.',evidence:[{claim:'React experience',source:facts}]};
test('Groq generates validated documents without using a local Ollama model',async()=>{
 let body,authorization;
 const client=groqApplicationClient(async(url,options)=>{assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');const request=JSON.parse(options.body);body??=request;authorization=options.headers.Authorization;return Response.json({choices:[{finish_reason:'stop',message:{content:request.response_format?JSON.stringify(draft):request.messages[0].content.includes('complete tailored resume')?draft.resume:draft.coverLetter}}]})},'fixture-key');
 const input={provider:'groq',profile:facts,masterCV:facts,description:'React developer'};
 const result=await draftApplication(input,client);
 assert.equal(result.provider,'groq');assert.equal(result.model,'openai/gpt-oss-20b');assert.equal(result.score,75);
 assert.equal(result.resume,draft.resume);assert.equal(result.coverLetter,draft.coverLetter);
 assert.equal(authorization,'Bearer fixture-key');assert.equal(body.response_format.json_schema.strict,true);assert.ok(body.messages[1].content.includes(facts));
 assert.deepEqual(body.response_format.json_schema.schema.properties.score,{type:'integer'});assert.deepEqual(body.response_format.json_schema.schema.properties.evidence.items.properties.source,{type:'string',enum:['cv0']});
 await assert.rejects(()=>draftApplication(input,groqApplicationClient(async()=>Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({...draft,evidence:[{claim:'Expert',source:'Invented fact'}]})}}]}),'fixture-key')),/evidence/);
});
test('Groq assessment stays small and multiline documents use plain text requests',async()=>{
 const requests=[],resume='Applicant Name\nBuilt "React" interfaces.\nEmployment: Example Co',letter='Dear hiring team,\nI am interested in the role.';
 const client=groqApplicationClient(async(url,options)=>{const body=JSON.parse(options.body);requests.push(body);const content=body.response_format?JSON.stringify(draft):requests.length===2?resume:letter;return Response.json({choices:[{finish_reason:'stop',message:{content}}]})},'fixture-key');
 const result=await draftApplication({provider:'groq',profile:facts,masterCV:facts,description:'React developer'},client);
 assert.equal(requests.length,3);assert.equal(result.resume,resume);assert.equal(result.coverLetter,letter);
 assert.equal(requests[0].response_format.json_schema.schema.properties.resume,undefined);assert.equal(requests[0].response_format.json_schema.schema.properties.coverLetter,undefined);
 assert.equal(requests[1].response_format,undefined);assert.equal(requests[2].response_format,undefined);
});
test('Groq evidence IDs restore original CV quotes and reject unknown IDs before writing documents',async()=>{
 for(const reference of ['cv0','cv999']){
  let calls=0;
  const client=groqApplicationClient(async(url,options)=>{calls++;const request=JSON.parse(options.body);if(calls===1){assert.ok(request.messages.at(-1).content.includes(facts));assert.deepEqual(request.response_format.json_schema.schema.properties.evidence.items.properties.source.enum,['cv0'])}return Response.json({choices:[{finish_reason:'stop',message:{content:calls===1?JSON.stringify({...draft,evidence:[{claim:'React experience',source:reference}]}):facts}}]})},'fixture-key');
  const input={provider:'groq',profile:facts,masterCV:facts,description:'Requires Three.js and React'};
  if(reference==='cv0'){const result=await draftApplication(input,client);assert.equal(result.evidence[0].source,facts);assert.equal(calls,3)}else{await assert.rejects(()=>draftApplication(input,client),/quote not found/);assert.equal(calls,1)}
 }
});
test('evidence tolerates PDF whitespace and typography but rejects changed experience or missing skills',async()=>{
 const cv='Full Stack Engineer — React / Next.js\nFrontend Developer\tDec 2024 – Present\n3+ years shipping production apps';
 const input={model:'fixture',profile:'Frontend engineer',masterCV:cv,description:'Requires Three.js and WebGL'};
 const client=source=>({chat:async function*(){yield {message:{content:JSON.stringify({...draft,evidence:[{claim:'Experience',source}]})},done:true}}});
 await draftApplication(input,client('Full Stack Engineer - React / Next.js Frontend Developer Dec 2024 - Present'));
 for(const quote of ['5+ years shipping production apps','Three.js and WebGL'])await assert.rejects(()=>draftApplication(input,client(quote)),/quote not found/);
});
test('Groq does not return partial documents when a later generation is truncated',async()=>{
 let calls=0;
 const client=groqApplicationClient(async()=>{calls++;return Response.json({choices:[{finish_reason:calls===3?'length':'stop',message:{content:calls===1?JSON.stringify(draft):'Partial document'}}]})},'fixture-key');
 await assert.rejects(()=>draftApplication({provider:'groq',profile:facts,masterCV:facts,description:'React developer'},client),/output limit/);
 assert.equal(calls,3);
});
test('Groq schema rejection falls back once to JSON and still validates facts',async()=>{
 const input={provider:'groq',profile:facts,masterCV:facts,description:'React developer'};
 for(const [output,rejected] of [[draft,false],[{...draft,evidence:[{claim:'Expert',source:'Invented fact'}]},true]]){
  const requests=[];
  const client=groqApplicationClient(async(url,options)=>{requests.push(JSON.parse(options.body));return requests.length===1?Response.json({error:{message:'Invalid json_schema: unsupported constraint',code:'invalid_request_error'}},{status:400}):Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify(output)}}]})},'fixture-key');
  if(rejected)await assert.rejects(()=>draftApplication(input,client),/evidence/);else assert.equal((await draftApplication(input,client)).score,75);
  assert.equal(requests.length,rejected?2:4);assert.equal(requests[1].response_format.type,'json_object');assert.ok(requests[1].messages[0].content.includes('"score"'));
 }
});
test('Groq request errors retain details, redact keys and do not retry unrelated 400s',async()=>{
 let calls=0;
 const input={provider:'groq',profile:facts,masterCV:facts,description:'React developer'};
 await assert.rejects(()=>draftApplication(input,groqApplicationClient(async()=>{calls++;return Response.json({error:{message:'max_completion_tokens exceeds account limit; fixture-key gsk_secret'}},{status:400})},'fixture-key')),e=>e.message.includes('max_completion_tokens')&&!e.message.includes('fixture-key')&&!e.message.includes('gsk_secret'));
 assert.equal(calls,1);
});
test('Groq configuration, authentication, limits and incomplete output are actionable',async()=>{
 assert.throws(()=>groqApplicationClient(fetch,''),/Set GROQ_API_KEY/);
 const input={provider:'groq',profile:facts,masterCV:facts,description:'React developer'};
 for(const [status,pattern] of [[401,/key was rejected/],[429,/limit reached/]])await assert.rejects(()=>draftApplication(input,groqApplicationClient(async()=>Response.json({}, {status,headers:{'retry-after':'31'}}),'fixture-key')),pattern);
 await assert.rejects(()=>draftApplication(input,groqApplicationClient(async()=>Response.json({choices:[{finish_reason:'length',message:{content:'{}'}}]}),'fixture-key')),/output limit/);
 await assert.rejects(()=>applicationProviderStatus('invalid'),/Choose Groq or Ollama/);
});
test('Ollama SDK receives structured schema and factual sources',async()=>{
 let body;
 const client=new Ollama({fetch:async(url,options)=>{body=JSON.parse(options.body);return new Response([JSON.stringify({message:{content:JSON.stringify(draft).slice(0,30)},done:false}),JSON.stringify({message:{content:JSON.stringify(draft).slice(30)},done:true})].join('\n')+'\n')}});
 const result=await draftApplication({model:'qwen3:4b-cpu',profile:facts,masterCV:facts,description:'React developer role',title:'React developer'},client);
 assert.equal(result.score,75);assert.equal(body.format.properties.score.maximum,100);assert.equal(body.stream,true);assert.equal(body.think,false);assert.ok(body.messages[1].content.includes(facts));
});
test('unsubstantiated evidence and malformed model output are rejected',async()=>{
 const input={model:'fixture',profile:facts,masterCV:facts,description:'React developer'};
 await assert.rejects(()=>draftApplication(input,{chat:async function*(){yield {message:{content:JSON.stringify({...draft,evidence:[{claim:'Expert',source:'Ten years experience'}]})},done:true}}}),/evidence/);
 await assert.rejects(()=>draftApplication(input,{chat:async function*(){yield {message:{content:JSON.stringify({...draft,score:101})},done:true}}}),/score/);
 await assert.rejects(()=>draftApplication({...input,masterCV:''}),/masterCV/);
});
test('DOCX export round trips through the CV importer',async()=>{
 const text='Applicant Name\nReact developer\nEmployment: Example Co, 2022–2025';
 const buffer=await documentBuffer(text);const result=await readCV({name:'resume.docx',base64:buffer.toString('base64')});
 assert.ok(result.text.includes('Applicant Name'));assert.ok(result.text.includes('2022–2025'));
 await assert.rejects(()=>readCV({name:'resume.pdf',base64:buffer.toString('base64')}),/PDF or DOCX/);
});
test('resume DOCX preserves reading order and facts while removing Markdown formatting',async()=>{
 const text='# Alex Example\nalex@example.com | https://example.com\n## Professional Summary\nReact developer.\n## Technical Skills\nReact, Next.js, TypeScript\n## Work Experience\n**Frontend Developer — Example Co**\nDec 2024 – Present\n- Built React interfaces and REST API integrations.\n## Education\nBS Software Engineering';
 const buffer=await documentBuffer(text,{kind:'resume'});
 const result=await readCV({name:'resume.docx',base64:buffer.toString('base64')});
 const sections=['Alex Example','alex@example.com','Professional Summary','Technical Skills','Work Experience','Frontend Developer','Dec 2024','Built React','Education','BS Software Engineering'];
 let previous=-1;for(const section of sections){const position=result.text.toLowerCase().indexOf(section.toLowerCase());assert.ok(position>previous,section+' reading order');previous=position}
 assert.ok(!result.text.includes('**'));assert.ok(!result.text.includes('##'));
 await assert.rejects(()=>documentBuffer(text,{format:'exe'}),/DOCX or PDF/);
});
test('resume formatting removes rules and italics, and flattens Markdown tables in order',async()=>{
 const text='USAMA HASSAN\n---\nPROFESSIONAL EXPERIENCE\nFrontend Developer – Example Co\n*Dec 2024 – Present*\n* Built React interfaces\n***\nSELECTED PROJECTS\n| Project | Role | Tech Stack |\n|---------|------|------------|\n| Example App | Full-stack Developer | C++, React |\n___\nEDUCATION\n_BS Software Engineering_';
 const blocks=documentBlocks(text);
 assert.ok(blocks.every(b=>!b.text.includes('*')&&!/^[-_]{3}/.test(b.text)));
 assert.equal(blocks.find(b=>b.type==='date').text,'Dec 2024 – Present');assert.equal(blocks.find(b=>b.type==='entry').text,'Frontend Developer – Example Co');
 assert.ok(blocks.some(b=>b.text==='Example App'));assert.ok(blocks.some(b=>b.text==='Role: Full-stack Developer | Tech Stack: C++, React'));
 const result=await readCV({name:'resume.docx',base64:(await documentBuffer(text)).toString('base64')});
 assert.ok(result.text.includes('C++'));assert.ok(!result.text.includes('---------'));
});
test('PDF CV text is extracted',async()=>{
 const stream='BT /F1 12 Tf 72 720 Td (React developer CV) Tj ET';
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
 let pdf='%PDF-1.4\n';const offsets=[0];objects.forEach((object,i)=>{offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${object}\nendobj\n`});const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
 const result=await readCV({name:'resume.pdf',base64:Buffer.from(pdf).toString('base64')});assert.ok(result.text.includes('React developer CV'));
});
test('Ollama connectivity errors are actionable; application hosts are explicit',async()=>{
 await assert.rejects(()=>ollamaStatus({list:async()=>{throw Error('offline')}}),/Start Ollama/);
 assert.equal(supportedApplicationHost('jobs.lever.co'),true);assert.equal(supportedApplicationHost('jobs.lever.co.attacker.com'),false);
 await assert.rejects(()=>publicJobURL('http://localhost/jobs'),/public HTTPS/);
});

test('interrupted streams and timeout errors remain actionable',async()=>{
 const input={model:'fixture',profile:facts,masterCV:facts,description:'React developer'};
 await assert.rejects(()=>draftApplication(input,{chat:async function*(){yield {message:{content:JSON.stringify(draft)},done:false}}}),/stopped before completing/);
 await assert.rejects(()=>draftApplication(input,{chat:async()=>{throw Object.assign(Error('fetch failed'),{cause:{code:'UND_ERR_HEADERS_TIMEOUT'}})}}),/timeout/);
});

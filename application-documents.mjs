import {Document,Packer,Paragraph,TextRun} from 'docx';
import mammoth from 'mammoth';
import {PDFParse} from 'pdf-parse';
import {chromium} from 'playwright';

export async function readCV({name,base64}){
 if(typeof name!=='string'||typeof base64!=='string'||base64.length>7000000)throw Error('Upload a PDF or DOCX CV under 5 MB.');
 const buffer=Buffer.from(base64,'base64');if(!buffer.length||buffer.length>5*1024*1024)throw Error('Upload a CV under 5 MB.');
 let text;
 if(/\.pdf$/i.test(name)&&buffer.subarray(0,5).toString()==='%PDF-'){
  const parser=new PDFParse({data:buffer});try{text=(await parser.getText()).text}finally{await parser.destroy()}
 }else if(/\.docx$/i.test(name)&&buffer.subarray(0,2).toString()==='PK')text=(await mammoth.extractRawText({buffer})).value;
 else throw Error('Use a PDF or DOCX document.');
 if(!text?.trim())throw Error('No readable text was found. A scanned PDF needs OCR; paste the CV text into the editor instead.');
 if(text.length>50000)throw Error('CV text exceeds 50,000 characters. Upload a shorter CV.');
 return {text:text.trim(),name};
}
export function documentBlocks(text,kind='resume'){
 if(typeof text!=='string'||!text.trim()||text.length>50000)throw Error('Document text must contain 1–50,000 characters.');
 const headings=/^(professional summary|summary|profile|technical skills|skills|core competencies|work experience|professional experience|experience|employment history|selected projects|projects|education(?: & certifications)?|certifications|languages|additional information)\s*:?$/i;
 const clean=line=>line.trim().replace(/^#{1,6}\s+/,'').replace(/\*\*([^*]+)\*\*/g,'$1').replace(/__([^_]+)__/g,'$1').replace(/\*([^*]+)\*/g,'$1').replace(/(^|\s)_([^_]+)_(?=\s|$)/g,'$1$2').replace(/`([^`]+)`/g,'$1').replace(/\[([^\]]+)\]\(([^)]+)\)/g,(_,label,url)=>label.replace(/^https?:\/\//,'').replace(/\/$/,'')===url.replace(/^https?:\/\//,'').replace(/\/$/,'')?url:label+': '+url).replace(/\t+/g,'  ');
 const lines=text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!/^```/.test(line)&&!/^([-*_])(?:\s*\1){2,}$/.test(line));
 const cells=line=>line.replace(/^\|/,'').replace(/\|$/,'').split('|').map(clean);
 const tableRule=line=>/^\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?$/.test(line);
 const expanded=[];
 for(let i=0;i<lines.length;i++){
  if(lines[i].includes('|')&&tableRule(lines[i+1]||'')){
   const labels=cells(lines[i]);i+=2;
   for(;i<lines.length&&lines[i].includes('|');i++){const row=cells(lines[i]);expanded.push(row[0],row.slice(1).map((value,index)=>(labels[index+1]||'Detail')+': '+value).join(' | '))}
   i--;continue;
  }
  const bullet=/^[-*•]\s+/.test(lines[i]);expanded.push((bullet?'• ':'')+clean(bullet?lines[i].replace(/^[-*•]\s+/,''):lines[i]));
 }
 let section='';
 return expanded.filter(Boolean).map((line,index)=>{
  const bullet=/^[-*•]\s+/.test(line),heading=kind==='resume'&&headings.test(line);
  if(heading)section=line;
  if(/^(technical skills|skills|core competencies)/i.test(section)&&!heading)line=line.replace(/^([^|]{1,40})\s*\|\s*/,(_,label)=>label.trim()+': ');
  const date=/^(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+)?\d{4}\s*[–—-]\s*(?:Present|Current|(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+)?\d{4})$/i;
  const contact=kind==='resume'&&index>0&&index<5&&!expanded.slice(1,index+1).some(value=>headings.test(value))&&/@|https?:|www\.|linkedin\.com|github\.com|\+\d/.test(line);
  const entry=kind==='resume'&&(date.test(expanded[index+1]||'')||/^(Role|Tech Stack):/.test(expanded[index+1]||''));
  return {text:bullet?line.replace(/^[-*•]\s+/,''):heading?line.replace(/:$/,'').toUpperCase():line,type:heading?'heading':kind==='resume'&&index===0&&!bullet?'name':bullet?'bullet':contact?'contact':date.test(line)?'date':entry?'entry':'body'};
 });
}
export async function documentBuffer(text,{format='docx',kind='resume'}={}){
 if(!['docx','pdf'].includes(format)||!['resume','coverLetter'].includes(kind))throw Error('Choose DOCX or PDF and a supported document type.');
 const blocks=documentBlocks(text,kind);
 if(format==='pdf')return pdfBuffer(blocks);
 const document=new Document({styles:{default:{document:{run:{font:'Arial',size:21},paragraph:{spacing:{after:80,line:288}}}}},sections:[{properties:{page:{size:{width:11906,height:16838},margin:{top:864,bottom:864,left:936,right:936}}},children:blocks.map(block=>new Paragraph({children:[new TextRun({text:block.text,font:'Arial',size:block.type==='name'?40:block.type==='contact'?19:block.type==='heading'?22:21,bold:['name','heading','entry'].includes(block.type),italics:block.type==='date',color:['name','heading'].includes(block.type)?'24364B':['contact','date'].includes(block.type)?'4B5563':'111827'})],...(block.type==='bullet'?{bullet:{level:0}}:{}),keepNext:['name','heading','entry','date'].includes(block.type),widowControl:true,spacing:{before:block.type==='heading'?240:block.type==='entry'?120:0,after:block.type==='heading'?100:block.type==='contact'?40:80,line:288}}))}]});
 return Packer.toBuffer(document);
}
async function pdfBuffer(blocks){
 const escape=text=>text.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
 const groups=[];for(const block of blocks){if(!groups.length||block.type==='heading')groups.push([]);groups.at(-1).push(block)}
 const body=groups.map(group=>'<section class="'+(group.length<=12&&group.reduce((n,b)=>n+b.text.length,0)<=1800?'compact':'')+'">'+group.map(block=>'<p class="'+block.type+'">'+(block.type==='bullet'?'• ':'')+escape(block.text)+'</p>').join('')+'</section>').join('');
 const html='<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Application document</title><style>body{margin:0;color:#111827;font:10.5pt/1.2 Arial,sans-serif}p{margin:0 0 4pt;white-space:pre-wrap;overflow-wrap:break-word;orphans:2;widows:2}.compact{break-inside:avoid}.name{font-size:20pt;line-height:1.15;font-weight:bold;color:#24364b;margin-bottom:6pt;break-after:avoid}.contact{font-size:9.5pt;color:#4b5563;margin-bottom:2pt}.heading{font-size:11pt;font-weight:bold;color:#24364b;margin-top:12pt;margin-bottom:5pt;break-after:avoid}.entry{font-weight:bold;margin-top:6pt;break-after:avoid}.date{font-style:italic;color:#4b5563;break-after:avoid}.bullet{padding-left:12pt;text-indent:-10pt}</style></head><body>'+body+'</body></html>';
 let browser;
 try{browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({javaScriptEnabled:false});await context.route('**/*',route=>route.abort());const page=await context.newPage();await page.setContent(html);return await page.pdf({format:'A4',margin:{top:'0.6in',bottom:'0.6in',left:'0.65in',right:'0.65in'},displayHeaderFooter:false,tagged:true})}
 catch{throw Error('Could not create the PDF. Check that Google Chrome is installed, or download DOCX instead.')}
 finally{await browser?.close()}
}

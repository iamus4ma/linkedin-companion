import {test} from 'node:test';
import assert from 'node:assert/strict';
import {profileJobSearch,linkedInJobSearchURL,linkedInJobKey,searchLinkedInJobs} from './job-search.mjs';
test('profile role preferences take precedence over CV history and location comes from applicant facts',()=>{
 const masterCV='Alex Example\nFull Stack Software Engineer — React / Next.js\nIslamabad, Pakistan | applicant@example.com';
 assert.deepEqual(profileJobSearch({profile:'Frontend developer seeking React opportunities',masterCV}),{keywords:'Frontend Developer',location:'Islamabad, Pakistan'});
 assert.equal(profileJobSearch({profile:'Backend Developer\nPreferred location: Lahore, Pakistan',masterCV}).location,'Lahore, Pakistan');
 assert.equal(profileJobSearch({masterCV}).keywords,'Full Stack Developer');
 assert.throws(()=>profileJobSearch({}),/Add your profile/);
});
test('LinkedIn search respects explicit criteria, work mode and posting date without leaking CV text',()=>{
 const result=linkedInJobSearchURL({profile:'React developer',masterCV:'Private applicant facts',keywords:'React & Next.js',location:'Lahore, Pakistan',workMode:'remote',days:'7'}),u=new URL(result.url);
 assert.equal(u.origin,'https://www.linkedin.com');assert.equal(u.searchParams.get('keywords'),'React & Next.js');assert.equal(u.searchParams.get('location'),'Lahore, Pakistan');assert.equal(u.searchParams.get('f_WT'),'2');assert.equal(u.searchParams.get('f_TPR'),'r604800');assert.ok(!u.href.includes('Private'));
 assert.equal(linkedInJobSearchURL({profile:'React developer'}).keywords,'React Developer');
 assert.throws(()=>linkedInJobSearchURL({keywords:34}),/valid search/);
 assert.throws(()=>linkedInJobSearchURL({keywords:'React',workMode:'invalid'}),/work mode/);
});
test('job IDs deduplicate tracked and slugged LinkedIn URLs but keep other hosts separate',()=>{
 assert.equal(linkedInJobKey('https://www.linkedin.com/jobs/view/react-developer-12345/?trackingId=test'),'12345');
 assert.equal(linkedInJobKey('https://www.linkedin.com/jobs/view/12345/'),'12345');
 assert.notEqual(linkedInJobKey('https://www.linkedin.com.attacker.com/jobs/view/12345/'),'12345');
});
test('invalid search budgets are rejected before browser interaction',async()=>{
 await assert.rejects(()=>searchLinkedInJobs({}, {keywords:'React',limit:50}),/1–10/);
 await assert.rejects(()=>searchLinkedInJobs({}, {keywords:'React',seenUrls:[32]}),/Invalid saved/);
});

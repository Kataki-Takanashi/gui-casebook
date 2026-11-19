// Starts a throwaway copy of the app (port 8792, empty data folder) plus the fake Kimai, and fills it with
// fake cases so the in-app clips look lived-in. Never touches real data or a real Kimai.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import {chromium} from 'playwright-core';

const APP_ROOT=path.resolve('..');                       // IO_Shield_Casebook_Studio_Local/
export const BASE='http://127.0.0.1:8792';
export const MOCK='http://127.0.0.1:8799';
const DATA=process.env.REC_DATA_DIR||path.join(os.tmpdir(),'casebook-rec-data');
const SAMPLE=process.env.SAMPLE_BOOK||path.resolve('..','..','IO_Shield_Field_School_Casebook.xlsx');

async function waitUp(url){for(let i=0;i<60;i++){try{await fetch(url);return;}catch{await new Promise(r=>setTimeout(r,250));}}throw Error('Not up: '+url);}

// Fresh app + mock. Returns {bookId, down()}.
export async function up({seed=true}={}){
 fs.rmSync(DATA,{recursive:true,force:true});
 const mock=spawn(process.execPath,['tutorials/mock-kimai.mjs'],{stdio:'ignore'});
 const app=spawn(process.execPath,['server.mjs'],{cwd:APP_ROOT,stdio:'ignore',env:{...process.env,CASEBOOK_PORT:'8792',CASEBOOK_DATA_DIR:DATA}});
 const down=()=>{mock.kill();app.kill();};
 try{
  await waitUp(BASE+'/api/books');await waitUp(MOCK+'/api/users/me');
  const form=new FormData();form.append('file',new Blob([fs.readFileSync(SAMPLE)]),path.basename(SAMPLE));
  const r=await fetch(BASE+'/api/books',{method:'POST',body:form,headers:{Origin:BASE}});
  const {id}=await r.json();
  if(seed)await seedCases();
  return {bookId:id,down};
 }catch(e){down();throw e;}
}

export async function connectMockKimai(){
 const r=await fetch(BASE+'/api/kimai',{method:'PUT',headers:{'Content-Type':'application/json',Origin:BASE},body:JSON.stringify({url:MOCK,token:'mock-token'})});
 if(!r.ok)throw Error('connect failed: '+await r.text());
}

// One parent project, two cases and one logged session, made through the real UI.
async function seedCases(){
 const browser=await chromium.launch({channel:'chrome'});
 const page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage();
 await page.addInitScript(()=>localStorage.setItem('theme','light'));
 await page.goto(BASE);
 // Save, and if the form refuses, say why instead of waiting forever.
 const save=async()=>{await page.locator('.dialog-actions .primary-button').click();const dialog=page.locator('[role=dialog].entry-dialog').first();
  await Promise.race([dialog.waitFor({state:'detached'}),page.locator('.form-error').waitFor().then(async()=>{throw Error('Seeding form refused: '+await page.locator('.form-error').textContent());})]);};
 const pick=async(label,option)=>{await page.getByRole('combobox',{name:label}).click();await page.getByRole('option',{name:option,exact:true}).click();};
 const newCase=async(title,type,did,parent)=>{
  await page.getByRole('navigation').or(page.locator('[data-sidebar]')).getByText('Cases',{exact:true}).first().click();
  await page.getByRole('button',{name:'New case'}).first().click();
  await page.getByLabel('Case / Project').fill(title);
  await pick('Type',type);
  // New cases don't guess a domain, so pick one.
  await page.getByRole('combobox',{name:'Main Domain'}).click();await page.getByRole('option').filter({hasText:'Networking'}).first().click();
  if(parent){await page.getByRole('combobox',{name:'Parent project'}).click();await page.getByRole('option').filter({hasText:parent}).first().click();}
  await page.getByLabel('What I Did').fill(did);
  await page.getByRole('textbox',{name:'Scope / Permission'}).fill('Own lab equipment');
  await save();
 };
 await newCase('Lab Network Build','Parent Project','Built a small lab network to practice on.');
 await newCase('Network Inventory','Project Case','Listed every device on the lab network.','Lab Network Build');
 await newCase('Firewall Rules Review','Project Case','Reviewed the firewall rules for gaps.','Lab Network Build');
 // One older session on Network Inventory.
 await page.getByRole('button',{name:'Log session'}).first().click();
 await page.getByRole('combobox',{name:'Case'}).click();
 await page.getByRole('option').filter({hasText:'Network Inventory'}).click();
 await page.getByLabel('Date').fill(new Date(Date.now()-9*86400000).toISOString().slice(0,10));
 await page.getByLabel('What I Worked On').fill('Mapped the switch ports');
 await page.getByLabel('Start',{exact:true}).fill('19:00');
 await page.getByLabel('End',{exact:true}).fill('20:30');
 await save();
 await page.waitForTimeout(500);
 await browser.close();
}

// Everything an in-app clip needs: fresh fake app + fake Kimai, then a recording browser on the Cases page
// in light mode. Returns {rec, page, down}; pass rec to finish() from kit.mjs and call down() afterwards.
export async function openRecording({connected=false}={}){
 const {start,overlay}=await import('./kit.mjs');
 const env=await up();
 try{
  if(connected)await connectMockKimai();
  const rec=await start();
  await rec.page.addInitScript(()=>localStorage.setItem('theme','light'));
  await rec.page.goto(BASE);
  await rec.page.getByRole('heading',{name:'Cases'}).waitFor();
  await overlay(rec.page);
  const down=async()=>{if(process.env.REC_DEBUG)await rec.page.screenshot({path:process.env.REC_DEBUG}).catch(()=>{});await rec.context.close().catch(()=>{});env.down();};
  return {...rec,rec,down};
 }catch(e){env.down();throw e;}
}

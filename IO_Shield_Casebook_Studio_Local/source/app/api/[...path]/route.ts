import {db,bucket,identity,owned} from '@/lib/store';
import {parseWorkbook,exportWorkbook} from '@/lib/workbook';
import {validateEntry,rowsFor,excelDate,clockTime,domainCode,nextNumberedId,editable} from '@/lib/casebook';
import * as K from '@/lib/kimai';
import {zipSync,strToU8} from 'fflate';
const safeName=(v:string)=>v.replace(/[^A-Za-z0-9._-]/g,'_').slice(0,140)||'file';
const now=()=>new Date().toISOString();
const json=(data:any,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
// Validates and saves one row, applying review-status defaults and cascades. Shared by forms and Kimai sync.
async function saveEntry(b:any,owner:string,sheet:string,row:number,values:Record<string,string>,source?:string){
 const data=JSON.parse(b.parsed),edits=JSON.parse(b.edits);
 const current=validateEntry(data,edits,sheet,row,values),old=current?.values??{},defaults:any={};
  if(sheet==='Case Register')Object.assign(defaults,{L:'Pending Review',M:values.D==='Parent Project'?'0':'1',U:'No',S:'',T:''});
  if(sheet==='Competency Evidence')Object.assign(defaults,{N:'Pending Review',S:'No',O:'',P:'',U:'0.01',V:''});
  if(sheet==='Evidence Index')Object.assign(defaults,{L:'',M:''});
  if(sheet==='Portfolio')Object.assign(defaults,{F:'Private',J:'Pending Review',K:'',L:''});
  const updated={...values,...defaults};edits[sheet]??={};edits[sheet][row]={...edits[sheet][row],...updated};
  const cascades:any[]=[];
  if(current&&['Case Register','Session Ledger','Evidence Index'].includes(sheet)){
   const caseId=sheet==='Case Register'?values.A:sheet==='Session Ledger'?values.C:values.B;
   for(const claim of rowsFor(data,edits,'Competency Evidence').filter((r:any)=>r.values.B===caseId)){
    if(sheet==='Evidence Index'&&!claim.values.H?.split(/[,;\s]+/).includes(values.A))continue;
    const patch={N:'Pending Review',S:'No',O:'',P:'',V:''};edits['Competency Evidence']??={};edits['Competency Evidence'][claim.row]={...edits['Competency Evidence'][claim.row],...patch};cascades.push({sheet:'Competency Evidence',row:claim.row,before:claim.values,after:patch});
   }
   for(const item of rowsFor(data,edits,'Portfolio').filter((r:any)=>r.values.B===caseId)){const patch={J:'Pending Review',F:'Private',K:'',L:''};edits.Portfolio??={};edits.Portfolio[item.row]={...edits.Portfolio[item.row],...patch};cascades.push({sheet:'Portfolio',row:item.row,before:item.values,after:patch});}
   if(sheet!=='Case Register'){const c=rowsFor(data,edits,'Case Register').find((r:any)=>r.values.A===caseId);if(c){const patch={L:'Pending Review',U:'No',S:'',T:''};edits['Case Register']??={};edits['Case Register'][c.row]={...edits['Case Register'][c.row],...patch};cascades.push({sheet:'Case Register',row:c.row,before:c.values,after:patch});}}
  }
  const timestamp=now(),revision=b.revision+1;
  const results=await db().batch([
   db().prepare('UPDATE casebooks SET edits=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?').bind(JSON.stringify(edits),timestamp,b.id,owner,b.revision),
   db().prepare('INSERT INTO casebook_events (id,book_id,actor,revision,detail,created) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),b.id,owner,revision,JSON.stringify({sheet,row,before:old,after:updated,cascades,...(source?{source}:{})}),timestamp),
  ]);if(results[0].meta.changes!==1)throw json({error:'This casebook changed in another window. It is up to date now, so check the form and save again.'},409);
 b.revision=revision;b.edits=JSON.stringify(edits);b.updated=timestamp;
 return {revision,edits,updated:timestamp};
}

// Clears a row (the record disappears from the app and the export). History keeps the old values, so it can be restored.
async function deleteEntry(b:any,owner:string,sheet:string,row:number,source?:string){
 const data=JSON.parse(b.parsed),edits=JSON.parse(b.edits);
 if(!editable[sheet]||!data.sheets[sheet])throw Error('Unsupported sheet.');
 const current=rowsFor(data,edits,sheet).find((r:any)=>r.row===row);if(!current)throw Error('That record no longer exists.');
 const cleared=Object.fromEntries(editable[sheet].map((c:string)=>[c,'']));edits[sheet]??={};edits[sheet][row]={...edits[sheet][row],...cleared};
 const timestamp=now(),revision=b.revision+1;
 const results=await db().batch([
  db().prepare('UPDATE casebooks SET edits=?,revision=revision+1,updated=? WHERE id=? AND owner=? AND revision=?').bind(JSON.stringify(edits),timestamp,b.id,owner,b.revision),
  db().prepare('INSERT INTO casebook_events (id,book_id,actor,revision,detail,created) SELECT ?,?,?,?,?,? WHERE changes()=1').bind(crypto.randomUUID(),b.id,owner,revision,JSON.stringify({sheet,row,before:current.values,after:cleared,deleted:true,...(source?{source}:{})}),timestamp),
 ]);if(results[0].meta.changes!==1)throw json({error:'This casebook changed in another window. Reload the page, then try again.'},409);
 b.revision=revision;b.edits=JSON.stringify(edits);b.updated=timestamp;
 return {revision,edits,updated:timestamp,before:current.values};
}

// ---- Kimai two-way sync ----
// Each linked session stores what both sides looked like at the last sync. On sync, a side that changed since
// then wins; if both changed it is a conflict for the user to resolve. Nothing is deleted on either side.
const SESSIONS='Session Ledger',WINDOW_DAYS=120;
async function setting(key:string){return (await db().prepare('SELECT value FROM app_settings WHERE key=?').bind(key).first())?.value as string|undefined;}
async function setSetting(key:string,value:string|null){if(value===null)await db().prepare('DELETE FROM app_settings WHERE key=?').bind(key).run();else await db().prepare('INSERT INTO app_settings (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(key,value).run();}
async function kimaiConfig():Promise<K.KimaiConfig|null>{const url=await setting('kimai_url'),token=await setting('kimai_token');return url&&token?{url,token}:null;}
async function caseMap(bookId:string){const r=await db().prepare('SELECT case_id,project,activity FROM kimai_case_map WHERE book_id=?').bind(bookId).all();return Object.fromEntries(r.results.map((m:any)=>[m.case_id,{project:m.project,activity:m.activity}])) as Record<string,{project:number,activity:number}>;}
async function links(bookId:string){const r=await db().prepare('SELECT session_id,kimai_id,synced FROM kimai_links WHERE book_id=?').bind(bookId).all();return r.results.map((l:any)=>({...l,synced:JSON.parse(l.synced)})) as {session_id:string,kimai_id:number,synced:{app:K.SyncFields,kimai:K.SyncFields}}[];}
async function saveLink(bookId:string,sessionId:string,kimaiId:number,app:K.SyncFields,kimai:K.SyncFields){await db().prepare('INSERT INTO kimai_links (book_id,session_id,kimai_id,synced) VALUES (?,?,?,?) ON CONFLICT(book_id,session_id) DO UPDATE SET kimai_id=excluded.kimai_id,synced=excluded.synced').bind(bookId,sessionId,kimaiId,JSON.stringify({app,kimai})).run();}
const same=(a:K.SyncFields,b:K.SyncFields)=>a.date===b.date&&a.start===b.start&&a.end===b.end&&a.description===b.description&&a.project===b.project&&a.activity===b.activity;
const sinceDate=()=>new Date(Date.now()-WINDOW_DAYS*86400000).toISOString().slice(0,10);
function sessionRows(b:any){return rowsFor(JSON.parse(b.parsed),JSON.parse(b.edits),SESSIONS);}
function appFields(row:any,map:Record<string,{project:number,activity:number}>,fallback?:K.SyncFields):K.SyncFields|null{
 // A linked session keeps its Kimai activity; a new one uses the activity picked in the form, else the case's.
 const v=row.values,target=fallback?{project:fallback.project,activity:fallback.activity}:map[v.C];
 const date=excelDate(v.B),start=clockTime(v.J),end=clockTime(v.K);
 if(!target||!date||!start||!end)return null;
 return {date,start,end,description:v.D??'',project:target.project,activity:target.activity};
}
async function pullInto(b:any,owner:string,row:any,e:K.KimaiEntry){
 const values={...row.values,B:e.date,J:e.start,K:e.end,L:e.hours,D:e.description||row.values.D};
 for(const k of Object.keys(values))if(!['A','B','C','D','E','F','G','H','I','J','K','L','N','O','P','R'].includes(k))delete values[k];
 await saveEntry(b,owner,SESSIONS,row.row,values,'kimai');
}
async function kimaiStatus(b:any,owner:string,apply:boolean){
 const cfg=await kimaiConfig();if(!cfg)return {connected:false};
 const since=sinceDate(),remote=await K.entries(cfg,since),byId=new Map(remote.map(e=>[e.id,e]));
 const map=await caseMap(b.id),linkList=await links(b.id),linkedIds=new Set(linkList.map(l=>l.kimai_id)),linkedSessions=new Set(linkList.map(l=>l.session_id));
 const conflicts:any[]=[],missing:any[]=[];let pulled=0,pushed=0;
 for(const l of linkList){
  let e=byId.get(l.kimai_id)??null;if(!e&&linkList.length<=200)e=await K.entry(cfg,l.kimai_id);
  const row=sessionRows(b).find((r:any)=>r.values.A===l.session_id);
  if(!e||!row){missing.push({session_id:l.session_id,kimai_id:l.kimai_id,reason:!e?'kimai':'casebook'});continue;}
  const app=appFields(row,map,l.synced.kimai),kimai=K.entryFields(e);if(!app)continue;
  const appChanged=!same(app,l.synced.app),kimaiChanged=!same(kimai,l.synced.kimai);
  if(appChanged&&kimaiChanged){conflicts.push({session_id:l.session_id,kimai_id:l.kimai_id,app,kimai});continue;}
  if(!apply)continue;
  if(kimaiChanged){await pullInto(b,owner,row,e);const after=sessionRows(b).find((r:any)=>r.values.A===l.session_id);await saveLink(b.id,l.session_id,e.id,appFields(after,map,kimai)!,kimai);pulled++;}
  else if(appChanged){const u=await K.update(cfg,e.id,app);await saveLink(b.id,l.session_id,e.id,app,K.entryFields(u));pushed++;}
 }
 const rows=sessionRows(b),cases=rowsFor(JSON.parse(b.parsed),JSON.parse(b.edits),'Case Register');
 // Before anything is mapped, guess the case from words shared by the Kimai project and the case name.
 const words=(t:string)=>new Set((t.toLowerCase().match(/[a-z0-9]{3,}/g)??[]).filter(w=>!['the','and','project','case'].includes(w)));
 const byName=(e:K.KimaiEntry)=>{const k=words(e.projectName+' '+e.activityName);let best='',score=0;for(const c of cases){if(c.values.D==='Parent Project')continue;const n=[...words(c.values.C??'')].filter(w=>k.has(w)).length;if(n>score){score=n;best=c.values.A;}}return best;};
 // Exact activity match first, then a name match, then any case already linked to the same Kimai project.
 const suggest=(e:K.KimaiEntry)=>Object.entries(map).find(([,m])=>m.project===e.project&&m.activity===e.activity)?.[0]||byName(e)||Object.entries(map).find(([,m])=>m.project===e.project)?.[0]||'';
 const fresh=remote.filter(e=>!linkedIds.has(e.id)).map(e=>{const match=rows.find((r:any)=>!linkedSessions.has(r.values.A)&&excelDate(r.values.B)===e.date&&clockTime(r.values.J)===e.start);return {...e,suggested_case:match?.values.C??suggest(e),match_session:match?.values.A??null};});
 const matched=new Set(fresh.map(f=>f.match_session).filter(Boolean));
 const toSend=rows.filter((r:any)=>!linkedSessions.has(r.values.A)&&!matched.has(r.values.A)&&['T1','T2','T3'].includes(r.values.I)&&map[r.values.C]&&excelDate(r.values.B)>=since&&clockTime(r.values.J)&&clockTime(r.values.K))
  .map((r:any)=>({session_id:r.values.A,case_id:r.values.C,date:excelDate(r.values.B),start:clockTime(r.values.J),end:clockTime(r.values.K),description:r.values.D}));
 const syncedAt=new Date().toISOString();if(apply)await setSetting('kimai_synced_'+b.id,syncedAt);
 return {connected:true,user:await setting('kimai_user'),synced:apply?syncedAt:await setting('kimai_synced_'+b.id),pulled,pushed,new:fresh,to_send:toSend,conflicts,missing,map,linked:[...linkedSessions],cases:cases.filter((c:any)=>c.values.D!=='Parent Project').map((c:any)=>({id:c.values.A,name:c.values.C}))};
}
// Called after a session is saved from the form: keep a linked Kimai entry in step, or create one if asked.
async function afterSessionSave(b:any,sessionId:string,create:boolean,pick?:{project:number,activity:number}){
 const cfg=await kimaiConfig();if(!cfg)return undefined;
 try{
  const row=sessionRows(b).find((r:any)=>r.values.A===sessionId),map=await caseMap(b.id),link=(await links(b.id)).find(l=>l.session_id===sessionId);
  if(link){const app=appFields(row,map,link.synced.kimai);if(!app||same(app,link.synced.app))return {status:'linked'};
   const remote=await K.entry(cfg,link.kimai_id);if(!remote)return {status:'missing'};
   if(!same(K.entryFields(remote),link.synced.kimai))return {status:'conflict'};
   const u=await K.update(cfg,link.kimai_id,app);await saveLink(b.id,sessionId,link.kimai_id,app,K.entryFields(u));return {status:'updated'};}
  if(!create)return undefined;
  const app=appFields(row,pick?{...map,[row.values.C]:pick}:map);if(!app)return {status:'unmapped'};
  const e=await K.create(cfg,app);await saveLink(b.id,sessionId,e.id,app,K.entryFields(e));return {status:'created',kimai_id:e.id};
 }catch(e){return {status:'error',error:(e as Error).message};}
}
function importValues(b:any,e:K.KimaiEntry,caseId:string){
 const data=JSON.parse(b.parsed),edits=JSON.parse(b.edits),rows=rowsFor(data,edits,SESSIONS),c=rowsFor(data,edits,'Case Register').find((r:any)=>r.values.A===caseId);
 if(!c)throw Error('Choose a case for each Kimai entry.');
 const last=[...rows].reverse().find((r:any)=>r.values.C===caseId)?.values??{};
 let row=5;while(rows.some((r:any)=>r.row===row))row++;
 return {row,values:{A:nextNumberedId(rows.map((r:any)=>r.values.A),`${caseId}-S`),B:e.date,C:caseId,D:e.description||e.activityName||'Kimai entry',E:last.E||'Practical',F:c.values.E||'Internal Project',G:domainCode(c.values.H??'')||'01',H:domainCode(c.values.I??''),I:'T1',J:e.start,K:e.end,L:e.hours,N:last.N||'',O:'',P:last.P||'1',R:''}};
}
async function kimaiRoute(path:string[],method:string,request:Request,owner:string):Promise<Response|null>{
 if(path[0]==='kimai'){
  if(!path[1]&&method==='GET'){const url=await setting('kimai_url'),token=await setting('kimai_token');return json({connected:!!(url&&token),url:url??'https://clock.ioshield.io',user:await setting('kimai_user')??null});}
  if(!path[1]&&method==='PUT'){const body:any=await request.json(),url=String(body.url??'').trim().replace(/\/+$/,'');
   if(!/^https?:\/\/[^\s/]+/.test(url))throw Error('Enter the Kimai address, like https://clock.ioshield.io.');
   const token=String(body.token??'').trim()||await setting('kimai_token');if(!token)throw Error('Paste your Kimai API token.');
   const user=await K.me({url,token});await setSetting('kimai_url',url);await setSetting('kimai_token',token);await setSetting('kimai_user',user.name);return json({connected:true,url,user:user.name});}
  if(path[1]==='disconnect'&&method==='POST'){await setSetting('kimai_token',null);await setSetting('kimai_user',null);return json({connected:false});}
  if(path[1]==='catalog'&&method==='GET'){const cfg=await kimaiConfig();if(!cfg)throw Error('Connect Kimai first.');return json(await K.catalog(cfg));}
  return null;
 }
 if(path[0]!=='books'||path[2]!=='kimai')return null;
 const b=await owned(path[1],owner);
 if(!path[3]&&method==='GET')return json(await kimaiStatus(b,owner,false));
 if(path[3]==='sync'&&method==='POST')return json(await kimaiStatus(b,owner,true));
 const cfg=await kimaiConfig();if(!cfg)throw Error('Connect Kimai first.');
 const body:any=await request.json();
 if(path[3]==='map'&&method==='PUT'){
  if(body.case_id&&body.project===null){await db().prepare('DELETE FROM kimai_case_map WHERE book_id=? AND case_id=?').bind(b.id,body.case_id).run();return json({map:await caseMap(b.id)});}
  if(!body.case_id||!Number.isInteger(body.project)||!Number.isInteger(body.activity))throw Error('Choose a Kimai project and activity.');
  await db().prepare('INSERT INTO kimai_case_map (book_id,case_id,project,activity) VALUES (?,?,?,?) ON CONFLICT(book_id,case_id) DO UPDATE SET project=excluded.project,activity=excluded.activity').bind(b.id,body.case_id,body.project,body.activity).run();
  return json({map:await caseMap(b.id)});
 }
 if(path[3]==='import'&&method==='POST'){
  let done=0,names:any=null;const created:string[]=[],linked:string[]=[];
  for(const item of (body.items??[]).slice(0,200)){
   const e=await K.entry(cfg,+item.kimai_id);if(!e)continue;
   // A single timesheet comes back with the activity as a bare id, so look its name up for the session title.
   if(!e.activityName||!e.projectName){names??=await K.catalog(cfg);e.activityName||=names.activities.find((a:any)=>a.id===e.activity)?.name??'';e.projectName||=names.projects.find((p:any)=>p.id===e.project)?.name??'';}
   if(await db().prepare('SELECT 1 FROM kimai_links WHERE book_id=? AND kimai_id=?').bind(b.id,e.id).first())continue;
   let sessionId=item.link_session as string|undefined;
   if(!sessionId){const {row,values}=importValues(b,e,item.case_id);await saveEntry(b,owner,SESSIONS,row,values,'kimai');sessionId=values.A;created.push(values.A);}else linked.push(sessionId);
   const map=await caseMap(b.id),caseId=sessionRows(b).find((r:any)=>r.values.A===sessionId)?.values.C;
   if(caseId&&!map[caseId]){await db().prepare('INSERT INTO kimai_case_map (book_id,case_id,project,activity) VALUES (?,?,?,?)').bind(b.id,caseId,e.project,e.activity).run();map[caseId]={project:e.project,activity:e.activity};}
   const row=sessionRows(b).find((r:any)=>r.values.A===sessionId);
   await saveLink(b.id,sessionId!,e.id,appFields(row,map,K.entryFields(e))??K.entryFields(e),K.entryFields(e));done++;
  }
  return json({imported:done,created,linked,revision:b.revision,edits:JSON.parse(b.edits),updated:b.updated});
 }
 if(path[3]==='send'&&method==='POST'){const r=await afterSessionSave(b,String(body.session_id),true);if(r?.status==='error')throw Error(r.error);return json(r??{});}
 // Undo an import: unlink, and remove the sessions the import created. Kimai is not touched.
 if(path[3]==='unimport'&&method==='POST'){
  for(const id of [...(body.created??[]),...(body.linked??[])])await db().prepare('DELETE FROM kimai_links WHERE book_id=? AND session_id=?').bind(b.id,String(id)).run();
  for(const id of body.created??[]){const row=sessionRows(b).find((r:any)=>r.values.A===id);if(row)await deleteEntry(b,owner,SESSIONS,row.row,'kimai');}
  return json({ok:true,revision:b.revision,edits:JSON.parse(b.edits),updated:b.updated});
 }
 // Undo a send: delete the Kimai entry this app created and unlink the session.
 if(path[3]==='unsend'&&method==='POST'){
  const link=(await links(b.id)).find(l=>l.session_id===body.session_id);if(!link)throw Error('That session is not linked to Kimai.');
  await K.remove(cfg,link.kimai_id);await db().prepare('DELETE FROM kimai_links WHERE book_id=? AND session_id=?').bind(b.id,link.session_id).run();
  return json({ok:true});
 }
 if(path[3]==='resolve'&&method==='POST'){
  const link=(await links(b.id)).find(l=>l.session_id===body.session_id);if(!link)throw Error('That session is not linked to Kimai.');
  if(body.keep==='unlink'){await db().prepare('DELETE FROM kimai_links WHERE book_id=? AND session_id=?').bind(b.id,link.session_id).run();return json({ok:true});}
  const e=await K.entry(cfg,link.kimai_id);if(!e)throw Error('That entry was deleted in Kimai. Unlink it under Removed in Kimai review.');
  const map=await caseMap(b.id),row=sessionRows(b).find((r:any)=>r.values.A===link.session_id);
  if(body.keep==='kimai'){await pullInto(b,owner,row,e);const after=sessionRows(b).find((r:any)=>r.values.A===link.session_id);await saveLink(b.id,link.session_id,e.id,appFields(after,map,K.entryFields(e))!,K.entryFields(e));}
  else{const app=appFields(row,map,link.synced.kimai)!;const u=await K.update(cfg,e.id,app);await saveLink(b.id,link.session_id,e.id,app,K.entryFields(u));}
  return json({ok:true,revision:b.revision,edits:JSON.parse(b.edits),updated:b.updated});
 }
 return null;
}
async function handle(request:Request){try{
 const owner=await identity(),path=new URL(request.url).pathname.split('/').slice(2),method=request.method;
 if(method!=='GET'){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new Response('Cross-site writes are not allowed.',{status:403});}
 const kimaiResponse=await kimaiRoute(path,method,request,owner);if(kimaiResponse)return kimaiResponse;
 if(path[0]==='books'&&!path[1]){
  if(method==='GET'){const r=await db().prepare('SELECT id,name,revision,created,updated FROM casebooks WHERE owner=? ORDER BY updated DESC').bind(owner).all();return json(r.results);}
  if(method==='POST'){
   const count=await db().prepare('SELECT COUNT(*) AS n FROM casebooks WHERE owner=?').bind(owner).first();if(count.n>=20)throw Error('You can keep up to 20 casebooks.');
   const form=await request.formData(),file=form.get('file');if(!(file instanceof File)||!file.name.toLowerCase().endsWith('.xlsx'))throw Error('Choose a .xlsx casebook.');if(file.size>30*1024*1024)throw Error('Casebooks must be smaller than 30 MB.');
   const bytes=new Uint8Array(await file.arrayBuffer()),data=parseWorkbook(bytes),parsed=JSON.stringify(data);if(parsed.length>8000000)throw Error('This casebook is too large to open.');
   const id=crypto.randomUUID(),key=owner+'/'+id+'/original.xlsx',created=now();await bucket().put(key,bytes,{httpMetadata:{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}});
   await db().prepare('INSERT INTO casebooks (id,owner,name,original_key,parsed,edits,revision,created,updated) VALUES (?,?,?,?,?,\'{}\',0,?,?)').bind(id,owner,safeName(file.name),key,parsed,created,created).run();return json({id},201);
  }
 }
 if(path[0]==='files'&&path[1]&&method==='GET'){
  const f=await db().prepare('SELECT * FROM proof_files WHERE id=? AND owner=?').bind(path[1],owner).first();if(!f)throw new Response('File not found.',{status:404});await owned(f.book_id,owner);const o=await bucket().get(f.object_key);if(!o)throw Error('File is temporarily unavailable.');return new Response(o.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="${safeName(f.name)}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'private, no-store'}});
 }
 if(path[0]!=='books'||!path[1])throw new Response('Not found.',{status:404});
 const b=await owned(path[1],owner),data=JSON.parse(b.parsed),edits=JSON.parse(b.edits);
 if(!path[2]&&method==='GET'){const fs=await db().prepare('SELECT id,name,hash,bytes,created FROM proof_files WHERE book_id=? AND owner=? ORDER BY created DESC').bind(b.id,owner).all();return json({id:b.id,name:b.name,revision:b.revision,created:b.created,updated:b.updated,data,edits,files:fs.results});}
 if(path[2]==='original'&&method==='GET'){const o=await bucket().get(b.original_key);if(!o)throw Error('Original unavailable.');return new Response(o.body,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${safeName(b.name)}"`,'Cache-Control':'no-store'}});}
 if(path[2]==='entries'&&method==='PUT'){
  if(+(request.headers.get('content-length')??0)>100000)throw Error('Entry is too large.');const body:any=await request.json();if(body.revision!==b.revision)return json({error:'This casebook changed in another window. It is up to date now, so check the form and save again.'},409);
  const {sheet,row,values}=body;if(!values||typeof values!=='object')throw Error('Entry fields are missing.');
  const saved=await saveEntry(b,owner,sheet,row,values,body.source==='restore'?'restore':undefined);
  const kimai=sheet==='Session Ledger'?await afterSessionSave(b,values.A,!!body.kimai,body.kimai?.activity?{project:+body.kimai.project,activity:+body.kimai.activity}:undefined):undefined;
  return json({...saved,kimai});
 }
 if(path[2]==='entries'&&path[3]==='delete'&&method==='POST'){
  const body:any=await request.json();if(body.revision!==b.revision)return json({error:'This casebook changed in another window. Reload the page, then try again.'},409);
  const r=await deleteEntry(b,owner,body.sheet,+body.row);
  if(body.sheet==='Session Ledger'&&r.before.A)await db().prepare('DELETE FROM kimai_links WHERE book_id=? AND session_id=?').bind(b.id,r.before.A).run();
  return json(r);
 }
 if(path[2]==='files'&&method==='POST'){
  const totals=await db().prepare('SELECT SUM(bytes) AS bytes,COUNT(*) AS n FROM proof_files WHERE book_id=?').bind(b.id).first(),form=await request.formData(),f=form.get('file');if(!(f instanceof File))throw Error('Choose a file.');
  if(!/\.(pdf|png|jpg|jpeg|webp|txt|md|csv|json|log|pcap|pcapng|conf|yaml|yml|docx|xlsx)$/i.test(f.name))throw Error(`${f.name} can't be attached. Use a PDF, image, text, log, config, Word, Excel or packet capture file.`);
  if(f.size<=0)throw Error(`${f.name} is empty.`);if(f.size>10*1024*1024)throw Error(`${f.name} is over 10 MB.`);if((totals.bytes??0)+f.size>40*1024*1024||totals.n>=100)throw Error('A casebook can hold up to 100 proof files (40 MB in all).');
  const bytes=await f.arrayBuffer(),hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join(''),id=crypto.randomUUID(),name=safeName(f.name),key=owner+'/'+b.id+'/proof/'+id,created=now();await bucket().put(key,bytes);
  await db().prepare('INSERT INTO proof_files (id,book_id,owner,name,object_key,hash,bytes,created) VALUES (?,?,?,?,?,?,?,?)').bind(id,b.id,owner,name,key,hash,f.size,created).run();return json({id,name,hash,bytes:f.size,created,ref:`attachments/${id}/${name}`},201);
 }
 if(path[2]==='history'&&method==='GET'){const r=await db().prepare('SELECT revision,detail,created FROM casebook_events WHERE book_id=? ORDER BY revision DESC LIMIT 100').bind(b.id).all();return json(r.results);}
 if((path[2]==='export'||path[2]==='bundle')&&method==='GET'){
  const o=await bucket().get(b.original_key);if(!o)throw Error('The original workbook is unavailable.');const bytes=exportWorkbook(new Uint8Array(await o.arrayBuffer()),edits),filename=b.name.replace(/\.xlsx$/i,'')+`_revision_${b.revision}.xlsx`;
  if(path[2]==='export')return new Response(bytes as any,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="${filename}"`,'Cache-Control':'no-store'}});
  const fs=await db().prepare('SELECT * FROM proof_files WHERE book_id=? AND owner=?').bind(b.id,owner).all(),out:Record<string,Uint8Array>={[filename]:bytes};
  for(const f of fs.results){const obj=await bucket().get(f.object_key);if(!obj)throw Error(`A proof file is unavailable: ${f.name}.`);out[`attachments/${f.id}/${f.name}`]=new Uint8Array(await obj.arrayBuffer());}
  const history=await db().prepare('SELECT revision,detail,created FROM casebook_events WHERE book_id=? ORDER BY revision').bind(b.id).all();out['casebook-change-history.json']=strToU8(JSON.stringify(history.results,null,2));out['README.txt']=strToU8('Casebook Studio export\nOpen the workbook in Excel or LibreOffice to recalculate its preserved formulas.\nSupporting files are in attachments/. Evidence Index file references are relative to this folder.\nSHA-256 hashes document uploaded bytes; they do not certify authenticity or chain of custody.\nOriginal imported workbook remains available separately in the portal.\n');return new Response(zipSync(out,{level:0}) as any,{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="casebook_revision_${b.revision}_with_proof.zip"`,'Cache-Control':'no-store'}});
 }
 throw new Response('Not found.',{status:404});
 }catch(e){if(e instanceof Response)return e;console.error('Casebook request failed',e);return json({error:e instanceof Error?e.message:'The request could not be completed. Your entry has not been discarded.'},400);}}
export const GET=handle;export const POST=handle;export const PUT=handle;

// Kimai 2 client for two-way session sync. Runs on the local server only: Kimai sends no CORS headers,
// and the API token never reaches the browser.
// Times are wall-clock. Kimai returns begin/end in the user's Kimai timezone with an offset ("2026-10-26T18:12:00+0000");
// we keep the local date and time and ignore the offset, and send times back without one. That matches how
// analysts type times into Kimai and avoids the 5-hour shift.
export type KimaiConfig={url:string,token:string};
export type KimaiEntry={id:number,date:string,start:string,end:string,hours:string,project:number,projectName:string,activity:number,activityName:string,description:string};
export type SyncFields={date:string,start:string,end:string,description:string,project:number,activity:number};

export class KimaiError extends Error{constructor(message:string,public status=0){super(message);}}

async function call(cfg:KimaiConfig,path:string,init:RequestInit={}):Promise<{body:any,headers:Headers}>{
 let r:Response;
 try{r=await fetch(cfg.url.replace(/\/+$/,'')+path,{...init,headers:{Authorization:`Bearer ${cfg.token}`,Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{})},signal:AbortSignal.timeout(12000)});}
 catch{throw new KimaiError('Kimai is not reachable right now.');}
 const text=await r.text();
 if(r.status===401||r.status===403)throw new KimaiError('Kimai did not accept this API token.',r.status);
 if(r.status>=500||!(r.headers.get('content-type')??'').includes('json')&&text)throw new KimaiError('Kimai is not reachable right now.',r.status);
 if(!r.ok){let message=`Kimai said no (${r.status}).`;try{const e=JSON.parse(text);message=e.message??message;}catch{}throw new KimaiError(message,r.status);}
 return {body:text?JSON.parse(text):null,headers:r.headers};
}

const local=(s:string)=>({date:s.slice(0,10),time:s.slice(11,16)});
function toEntry(raw:any):KimaiEntry|null{
 if(!raw?.end)return null; // still running
 const b=local(raw.begin),e=local(raw.end),p=raw.project??{},a=raw.activity??{};
 return {id:raw.id,date:b.date,start:b.time,end:e.time,hours:String(Math.round((raw.duration??0)/36)/100),
  project:typeof p==='object'?p.id:p,projectName:typeof p==='object'?p.name??'':'',
  activity:typeof a==='object'?a.id:a,activityName:typeof a==='object'?a.name??'':'',description:raw.description??''};
}
export const entryFields=(e:KimaiEntry):SyncFields=>({date:e.date,start:e.start,end:e.end,description:e.description,project:e.project,activity:e.activity});

export async function me(cfg:KimaiConfig){const {body}=await call(cfg,'/api/users/me');return {id:body.id as number,name:(body.alias||body.username) as string};}
export async function catalog(cfg:KimaiConfig){
 const [p,a]=await Promise.all([call(cfg,'/api/projects?visible=1'),call(cfg,'/api/activities?visible=1')]);
 return {projects:p.body.map((x:any)=>({id:x.id,name:x.name})),activities:a.body.map((x:any)=>({id:x.id,name:x.name,project:x.project??null}))};
}
// The user's own finished entries that started on or after `since` (YYYY-MM-DD).
export async function entries(cfg:KimaiConfig,since:string):Promise<KimaiEntry[]>{
 const out:KimaiEntry[]=[];
 for(let page=1;page<=20;page++){
  const {body,headers}=await call(cfg,`/api/timesheets?full=true&size=250&page=${page}&begin=${since}T00:00:00&order=ASC&orderBy=begin`);
  for(const raw of body){const e=toEntry(raw);if(e)out.push(e);}
  if(page>=+(headers.get('x-total-pages')??1))break;
 }
 return out;
}
export async function entry(cfg:KimaiConfig,id:number):Promise<KimaiEntry|null>{
 try{const {body}=await call(cfg,`/api/timesheets/${id}`);return toEntry(body);}
 catch(e){if(e instanceof KimaiError&&e.status===404)return null;throw e;}
}
function payload(f:SyncFields){
 const endDate=f.end<=f.start?new Date(Date.parse(f.date+'T00:00:00Z')+86400000).toISOString().slice(0,10):f.date;
 return JSON.stringify({begin:`${f.date}T${f.start}:00`,end:`${endDate}T${f.end}:00`,project:f.project,activity:f.activity,description:f.description});
}
export async function create(cfg:KimaiConfig,f:SyncFields){const {body}=await call(cfg,'/api/timesheets',{method:'POST',body:payload(f)});return toEntry(body)!;}
export async function update(cfg:KimaiConfig,id:number,f:SyncFields){const {body}=await call(cfg,`/api/timesheets/${id}`,{method:'PATCH',body:payload(f)});return toEntry(body)!;}

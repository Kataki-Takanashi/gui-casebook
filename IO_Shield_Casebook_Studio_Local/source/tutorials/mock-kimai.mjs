// A tiny fake Kimai 2 API on 127.0.0.1:8799 for recording tutorial clips. Fake data only, accepts any Bearer token.
// Usage: node tutorials/mock-kimai.mjs   (Ctrl+C to stop; entries live in memory only)
import http from 'node:http';

const projects=[{id:1,name:'Lab Network Build'},{id:2,name:'Training Range'}];
const activities=[{id:1,name:'Network Inventory',project:1},{id:2,name:'Firewall Review',project:1},{id:3,name:'Exercise',project:2}];
const day=n=>{const d=new Date(Date.now()-n*86400000);return d.toISOString().slice(0,10);};
const mk=(id,ago,start,end,project,activity,description)=>{
 const b=new Date(`${day(ago)}T${start}:00Z`),e=new Date(`${day(ago)}T${end}:00Z`);
 return {id,begin:`${day(ago)}T${start}:00+0000`,end:`${day(ago)}T${end}:00+0000`,duration:(e-b)/1000,project,activity,description};
};
let nextId=104;
const sheets=[
 mk(101,7,'18:00','20:15',1,1,'Listed switches and servers on the lab rack'),
 mk(102,5,'17:30','19:00',1,2,'Reviewed firewall rule export'),
 mk(103,2,'18:30','20:00',2,3,'Ran the scan exercise on the training range'),
];
const full=s=>({...s,project:projects.find(p=>p.id===s.project),activity:activities.find(a=>a.id===s.activity)});
const send=(res,body,headers={})=>{res.writeHead(200,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(body));};
const readBody=req=>new Promise(r=>{let t='';req.on('data',c=>t+=c);req.on('end',()=>r(t?JSON.parse(t):{}));});

http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://x'),p=u.pathname,id=+(p.match(/^\/api\/timesheets\/(\d+)$/)?.[1]??0);
 if(p==='/api/users/me')return send(res,{id:1,username:'analyst',alias:'Analyst'});
 if(p==='/api/projects')return send(res,projects);
 if(p==='/api/activities')return send(res,activities);
 if(p==='/api/timesheets'&&req.method==='GET'){
  const begin=u.searchParams.get('begin')?.slice(0,10)??'',size=+(u.searchParams.get('size')??50),page=+(u.searchParams.get('page')??1);
  const rows=sheets.filter(s=>s.begin.slice(0,10)>=begin).sort((a,b)=>a.begin.localeCompare(b.begin));
  const slice=rows.slice((page-1)*size,page*size).map(s=>u.searchParams.get('full')?full(s):s);
  return send(res,slice,{'X-Total-Pages':String(Math.max(1,Math.ceil(rows.length/size)))});
 }
 if(id&&req.method==='GET'){const s=sheets.find(x=>x.id===id);return s?send(res,full(s)):(res.writeHead(404,{'Content-Type':'application/json'}),res.end('{"message":"Not found"}'));}
 if(p==='/api/timesheets'&&req.method==='POST'){
  const b=await readBody(req),s={id:nextId++,begin:b.begin+'+0000',end:b.end+'+0000',project:b.project,activity:b.activity,description:b.description??''};
  s.duration=(Date.parse(b.end+'Z')-Date.parse(b.begin+'Z'))/1000;sheets.push(s);return send(res,full(s));
 }
 if(id&&req.method==='PATCH'){
  const s=sheets.find(x=>x.id===id),b=await readBody(req);if(!s){res.writeHead(404,{'Content-Type':'application/json'});return res.end('{"message":"Not found"}');}
  if(b.begin)s.begin=b.begin+'+0000';if(b.end)s.end=b.end+'+0000';if(b.project)s.project=b.project;if(b.activity)s.activity=b.activity;if('description'in b)s.description=b.description;
  s.duration=(Date.parse(s.end.slice(0,19)+'Z')-Date.parse(s.begin.slice(0,19)+'Z'))/1000;return send(res,full(s));
 }
 res.writeHead(404,{'Content-Type':'application/json'});res.end('{"message":"Not found"}');
}).listen(8799,'127.0.0.1',()=>console.log('Mock Kimai on http://127.0.0.1:8799'));

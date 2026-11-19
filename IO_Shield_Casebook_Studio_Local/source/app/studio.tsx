'use client';
import React,{useEffect,useId,useMemo,useRef,useState} from 'react';
import {Upload,Plus,Download,FolderOpen,Clock,Layers,Search,Shield,FileText,Check,ChevronsUpDown,ChevronDown,ChevronLeft,History,Paperclip,X,Pencil,Sun,Moon,RefreshCw,Link2,Play,Pause,Timer,CircleHelp,FileSpreadsheet,FileArchive,FileDown,Trash2} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {Select,SelectTrigger,SelectValue,SelectContent,SelectItem} from '@/components/ui/select';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Checkbox} from '@/components/ui/checkbox';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
import {Command,CommandInput,CommandList,CommandEmpty,CommandItem} from '@/components/ui/command';
import {SidebarProvider,Sidebar,SidebarHeader,SidebarContent,SidebarMenu,SidebarMenuItem,SidebarMenuButton,SidebarInset,SidebarTrigger,useSidebar} from '@/components/ui/sidebar';
import {Toaster,toast} from 'sonner';
import {BookData,Edits,Row,editable,required,dateColumns,labels,timeNames,levels,rowsFor,excelDate,domainCode,clockTime,hoursBetween,nextNumberedId,nextCaseId,proofTypeFor,addHours} from '@/lib/casebook';
type FileRecord={id:string,name:string,hash:string,bytes:number,created:string};
type Book={id:string,name:string,revision:number,updated:string,data:BookData,edits:Edits,files:FileRecord[]};
type PendingFile={id:string,name:string,hash:string,ref:string};
type Form={sheet:string,row:number,existing:boolean};
const CASES='Case Register',SESSIONS='Session Ledger',PROOF='Evidence Index',CLAIMS='Competency Evidence',PORTFOLIO='Portfolio';
const idSuffix:Record<string,string>={[SESSIONS]:'S',[PROOF]:'P',[CLAIMS]:'D',[PORTFOLIO]:'PORT'};
const caseCol=(sheet:string)=>sheet===SESSIONS?'C':'B';
// Form layout: rows of related fields side by side. "more" holds optional or rarely changed fields.
const layouts:Record<string,{rows:string[][],more:string[]}>={
 [CASES]:{rows:[['C'],['B','D','E'],['F','G','N'],['H','I'],['X'],['W']],more:['K','J','Y','V','Z','A']},
 [SESSIONS]:{rows:[['C','B'],['D'],['J','K','L','I'],['O'],['KIMAI']],more:['E','F','P','G','H','N','R','A']},
 [PROOF]:{rows:[['B','C'],['F'],['E'],['D','H'],['I','J']],more:['K','N','A']},
 [CLAIMS]:{rows:[['B','C'],['E'],['H'],['K','J'],['D','G']],more:['L','M','Q','R','T','A']},
 [PORTFOLIO]:{rows:[['B','C'],['D'],['E','G'],['M'],['I']],more:['H','A']},
};
// Will's own definitions from the casebook template, shown when hovering a field label.
const fieldTips:Record<string,string>={
 'Main Domain':'The technical area where you want the most depth.',
 'Support Domain':'A second area that makes the main domain stronger. Add it only when it truly matters.',
 'Scope / Permission':'Required for assessment, professional, or investigative work.',
 'Time Class':'How well the time is proven. Do not guess old hours.',
 'Work Level':'Pick the level you worked at. The reviewer makes the final call.',
 'What It Shows':'Write what the proof actually shows, not just the file name.',
 'NICE Link':'Draft mapping to the NIST NICE framework. Still being refined.',
 'Type':'Parent projects group smaller cases and normally get no extra case credit.',
 'Context':'Label practice work. Training and simulation stay clearly marked.',
};
// Free-text fields where earlier answers are offered as suggestions.
const suggestCols:Record<string,string[]>={[CASES]:['J'],[SESSIONS]:['N'],[PROOF]:['K']};
const longFields=['What I Did','Result','Notes','What I Worked On','What It Shows','Scope / Permission','Fix / Recovery','Privacy / Cleanup'];
// Used only when an older import has no dropdown lists stored with it.
const fallbackLists:Record<string,Record<string,string[]>>={
 [CASES]:{D:['Training Case','Project Case','Investigation Case','Assessment Case','Engineering Case','Research Case','Professional Case','Parent Project'],E:['Training','Simulation','Internal Project','Professional','Research','Mentorship'],K:['Ongoing','Completed','On Hold','Closed','Archived']},
 [SESSIONS]:{E:['Instructional','Practical','Professional','Research','Review','Mentorship'],F:['Training','Simulation','Internal Project','Professional','Research','Mentorship']},
 [PROOF]:{D:['Screenshot','Configuration','Command Log','Report','Diagram','Source Code','Ticket','PCAP','Forensic Image','Hash','Photo','Email/Message','External Record','Other'],H:['Public','Internal','Sensitive','Client/Restricted','Law-Enforcement / Controlled'],I:['Yes','No','Conditional','N/A'],J:['Yes','No','Conditional','N/A']},
 [CLAIMS]:{G:['Training','Simulation','Internal Project','Professional','Research','Mentorship'],K:['Met','Needs Correction','Not Yet','Safety / Scope Stop'],L:['Yes','No'],Q:['Yes','No']},
 [PORTFOLIO]:{E:['Project Page','Write-up','Diagram','Lab Report','Presentation'],G:['Yes','No','N/A']},
};
const today=()=>new Date().toLocaleDateString('en-CA');
// 1.17 -> "1h 10m"; whole hours stay short.
const plural=(n:number,w:string)=>`${n} ${w}${n===1?'':'s'}`;
const fmtH=(h:string|number)=>{const m=Math.round(+h*60);if(!m)return '0h';const hh=Math.floor(m/60),mm=m%60;return hh&&mm?`${hh}h ${mm}m`:hh?`${hh}h`:`${mm}m`;};
// A few sheet headers read better in the app.
const friendly:Record<string,string>={'Proof IDs':'Proof','Hours Entered':'Hours'};
async function api(path:string,init?:RequestInit):Promise<any>{let r:Response;try{r=await fetch('/api/'+path,init);}catch{throw Error('Casebook Studio is not running. Start it again; nothing here is lost.');}if(!r.ok){let message='The request could not be completed.';try{const t=await r.text();try{message=JSON.parse(t).error??message;}catch{message=t;}}catch{}throw Error(message);}return r.json();}
function downloadBlob(blob:Blob,name:string){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
type Option=[string,string]|[string,string,string];
// The form dialog sees Escape before an open dropdown does, so open dropdowns register how to close themselves.
let closeOpenMenu:(()=>void)|null=null;
let menuClosedAt=0;
const trackMenu=(open:boolean,close:()=>void)=>{if(!open)menuClosedAt=Date.now();closeOpenMenu=open?close:closeOpenMenu===close?null:closeOpenMenu;};
// Safety net: if no dialog or menu is open but the page is still locked against clicks, unlock it.
if(typeof document!=='undefined'){new MutationObserver(()=>{if(document.body.style.pointerEvents!=='none')return;setTimeout(()=>{const open=document.querySelector('[role=dialog][data-state=open],[data-slot=select-content],[data-radix-popper-content-wrapper]');if(!open&&document.body.style.pointerEvents==='none')document.body.style.pointerEvents='';},400);}).observe(document.body,{attributes:true,attributeFilter:['style']});}
// Dialogs here have no Radix trigger, so remember what had focus outside them and return there on close.
let lastOutside:HTMLElement|null=null;
if(typeof document!=='undefined')document.addEventListener('focusin',e=>{const t=e.target as HTMLElement;if(t!==document.body&&!t.closest('[role=dialog],[data-radix-popper-content-wrapper]'))lastOutside=t;});
function returnFocus(e:Event){if(lastOutside?.isConnected){e.preventDefault();lastOutside.focus({preventScroll:true});}}
// After a failed save, mark required fields that are still empty so they turn red and read as invalid.
const isEmpty=(el:HTMLInputElement)=>el.tagName==='INPUT'||el.tagName==='TEXTAREA'?!el.value:el.hasAttribute('data-placeholder')||/Choose…/.test(el.textContent??'');
function markEmptyRequired(){setTimeout(()=>{document.querySelectorAll<HTMLInputElement>('.entry-dialog [aria-required=true]').forEach(el=>{if(isEmpty(el))el.setAttribute('aria-invalid','true');});document.querySelector<HTMLElement>('.entry-dialog [aria-invalid=true]')?.focus();},0);}
// Every dialog runs this first on Escape: close the open dropdown or suggestion list, not the dialog.
function menuEscape(e:KeyboardEvent){if(Date.now()-menuClosedAt<250){e.preventDefault();return true;}if(closeOpenMenu){e.preventDefault();menuClosedAt=Date.now();const c=closeOpenMenu;closeOpenMenu=null;c();return true;}if(document.querySelector('.suggest-list')){e.preventDefault();(document.activeElement as HTMLElement|null)?.blur();return true;}return false;}
function Choice({value,onChange,options,label}:{value:string,onChange:(v:string)=>void,options:Option[],label:string}){const [open,setOpenRaw]=useState(false),close=useRef(()=>setOpenRaw(false)).current,setOpen=(o:boolean)=>{setOpenRaw(o);trackMenu(o,close);};const safe:Option[]=value&&!options.some(o=>o[0]===value)?[[value,value],...options]:options;const tip=safe.find(o=>o[0]===value)?.[2];return <Select open={open} onOpenChange={setOpen} value={value||undefined} onValueChange={onChange}><SelectTrigger aria-label={label} className="w-full" title={tip}><SelectValue placeholder="Choose…"/></SelectTrigger><SelectContent className="choice-menu">{safe.map(([v,l,t])=><SelectItem key={v} value={v} hint={t||undefined}>{l}</SelectItem>)}</SelectContent></Select>;}
function SearchChoice({value,onChange,options,label,placeholder='Choose…'}:{value:string,onChange:(v:string)=>void,options:[string,string][],label:string,placeholder?:string}){const [open,setOpenRaw]=useState(false),close=useRef(()=>setOpenRaw(false)).current,setOpen=(o:boolean)=>{setOpenRaw(o);trackMenu(o,close);};return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="outline" className="picker" role="combobox" aria-expanded={open} aria-label={label}><span>{options.find(o=>o[0]===value)?.[1]??(value||placeholder)}</span><ChevronsUpDown size={15}/></Button></PopoverTrigger><PopoverContent portal={false} className="picker-pop p-0" align="start"><Command><CommandInput placeholder="Search…"/><CommandList><CommandEmpty>No matches.</CommandEmpty>{options.map(([id,name])=><CommandItem key={id||'none'} value={id+' '+name} onSelect={()=>{setOpen(false);onChange(id);}}>{value===id?<Check size={15}/>:<span className="w-[15px]"/>}<span>{name}</span></CommandItem>)}</CommandList></Command></PopoverContent></Popover>;}
// On a phone the sidebar is a sheet; close it once a page is picked.
function CloseSheetOnRoute(){const {setOpenMobile}=useSidebar();useEffect(()=>{const f=()=>setOpenMobile(false);window.addEventListener('hashchange',f);return()=>window.removeEventListener('hashchange',f);},[setOpenMobile]);return null;}
export default function Studio({displayName}:{displayName:string}){
 const [books,setBooks]=useState<any[]>([]),[book,setBook]=useState<Book|null>(null),[view,setView]=useState<'cases'|'case'|'skills'|'history'>('cases'),[openCase,setOpenCase]=useState(''),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false),[error,setError]=useState(''),[search,setSearch]=useState('');
 const [form,setForm]=useState<Form|null>(null),[values,setValues]=useState<Record<string,string>>({}),[pending,setPending]=useState<PendingFile[]>([]),[formError,setFormError]=useState(''),[saving,setSaving]=useState(false),[history,setHistory]=useState<any[]>([]),[portfolio,setPortfolio]=useState<Row|null>(null),[publicCheck,setPublicCheck]=useState(false),[dragging,setDragging]=useState(false);
 type Kimai={connected:boolean,url:string,user:string|null};type KCatalog={projects:{id:number,name:string}[],activities:{id:number,name:string,project:number|null}[]};
 const [kimai,setKimai]=useState<Kimai|null>(null),[kstatus,setKstatus]=useState<any>(null),[kcatalog,setKcatalog]=useState<KCatalog|null>(null),[kimaiView,setKimaiView]=useState<''|'connect'|'review'>(''),[ksyncing,setKsyncing]=useState(false),[kchoice,setKchoice]=useState(''),[kpick,setKpick]=useState<Record<number,string>>({});
 const [initial,setInitial]=useState(''),[confirmDiscard,setConfirmDiscard]=useState(false),[confirmKimai,setConfirmKimai]=useState(false),[fieldErrors,setFieldErrors]=useState<Record<string,string>>({}),[conflict,setConflict]=useState<{fields:string[],theirs:Record<string,string>}|null>(null),[timer,setTimer]=useState<{start:string|null,case:string|null}>({start:null,case:null}),[tick,setTick]=useState(0),[lim,setLim]=useState<any>({fileMb:10,totalMb:40,files:100}),[limOpen,setLimOpen]=useState(false),[noAsk,setNoAsk]=useState(false),[kTouched,setKTouched]=useState(false);
 const [moreOpen,setMoreOpen]=useState(false),[errorRetry,setErrorRetry]=useState<(()=>void)|null>(null);
 const [kSel,setKSel]=useState<Record<number,boolean>>({}),[kEdit,setKEdit]=useState<Record<number,boolean>>({});
 const [menuOpen,setMenuOpen]=useState(false),[helpOpen,setHelpOpen]=useState(false),[helpClip,setHelpClip]=useState(0);
 const [dark,setDark]=useState(()=>document.documentElement.classList.contains('dark'));
 function toggleTheme(){const next=!dark;setDark(next);document.documentElement.classList.toggle('dark',next);try{localStorage.setItem('theme',next?'dark':'light');}catch{}}
 const uploadRef=useRef<HTMLInputElement>(null),fileRef=useRef<HTMLInputElement>(null),lastForm=useRef<Form|null>(null);
 if(form)lastForm.current=form;
 const shown=form??lastForm.current;
 const labelFor=(sheet:string,col:string)=>{const h=book?.data.sheets[sheet]?.headers[col]??col;return friendly[h]??h;};
 const getRows=(s:string)=>book?rowsFor(book.data,book.edits,s):[];
 const cases=getRows(CASES),sessions=getRows(SESSIONS),claims=getRows(CLAIMS),proof=getRows(PROOF),stories=getRows(PORTFOLIO);
 const domains:Option[]=book?.data.sheets['Domain Framework']?.rows.filter(r=>/^\d+(\.0+)?$/.test(r.values.A.trim())).map(r=>[domainCode(r.values.A),domainCode(r.values.A)+' · '+r.values.C])??[];
 const domainLabel=(v:string)=>domains.find(d=>d[0]===domainCode(v))?.[1]??v;
 const catalog=book?.data.sheets['Competency Catalog']?.rows??[];
 const defs=useMemo(()=>{const out={level:{} as Record<string,[string,string]>,time:{} as Record<string,[string,string]>,caseType:{} as Record<string,string>};for(const r of book?.data.sheets['Lists & Definitions']?.rows??[]){const v=r.values;if(/^[0-5](\.0+)?$/.test(v.A??'')&&v.B)out.level[String(parseInt(v.A))]??=[v.B,v.C??''];if(/^T[1-5]$/.test(v.E??'')&&v.F)out.time[v.E]??=[v.F,[v.G,v.H].filter(Boolean).join(' ')];if(/Case$|^Parent Project$/.test(v.A??'')&&v.B)out.caseType[v.A]=v.B;}return out;},[book?.id]);
 const domainTip=(code:string)=>book?.data.sheets['Domain Framework']?.rows.find(r=>domainCode(r.values.A)===code)?.values.D;
 const findCase=(id:string)=>cases.find(r=>r.values.A===id);
 const isParent=(r:Row)=>r.values.D==='Parent Project';
 // Parent Project may hold the parent's ID or (in older sheets) its name.
 const parentOf=(r:Row)=>{const p=(r.values.B??'').trim();return p?cases.find(c=>c!==r&&(c.values.A===p||c.values.C?.trim()===p)):undefined;};
 const listFor=(sheet:string,col:string)=>book?.data.sheets[sheet]?.lists?.[col]??fallbackLists[sheet]?.[col];
 const suggestions=(sheet:string,col:string)=>[...new Set(getRows(sheet).map(r=>r.values[col]?.trim()).filter(Boolean))].slice(-30) as string[];
 async function refreshBooks(){const list=await api('books');setBooks(list);return list;}
 async function openBook(id:string){setBusy(true);setError('');try{setBook(await api('books/'+id));setSearch('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 useEffect(()=>{refreshBooks().then(list=>list.length&&openBook(list[0].id)).catch(e=>setError(e.message)).finally(()=>setLoaded(true));},[]);
 useEffect(()=>{api('kimai').then(setKimai).catch(()=>{});api('settings/limits').then(setLim).catch(()=>{});api('settings/timer').then(setTimer).catch(()=>{});},[]);
 useEffect(()=>{if(!timer.start)return;const t=setInterval(()=>setTick(n=>n+1),1000);return()=>clearInterval(t);},[timer.start]);
 // Shortcuts when not typing: L log session, N new case, / search, ? help.
 useEffect(()=>{const onKey=(e:KeyboardEvent)=>{const t=e.target as HTMLElement;if(e.metaKey||e.ctrlKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)||t.isContentEditable||document.querySelector('[role=dialog]')||!book)return;
  if(e.key==='l'&&cases.some(r=>!isParent(r))){e.preventDefault();start(SESSIONS);}else if(e.key==='n'){e.preventDefault();start(CASES);}else if(e.key==='?'){e.preventDefault();setHelpOpen(true);}else if(e.key==='/'){e.preventDefault();const focus=()=>document.querySelector<HTMLInputElement>('.search input')?.focus();if(document.querySelector('.search input'))focus();else{go('#/');setTimeout(focus,80);}}};
  window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);});
 useEffect(()=>{if(kimai?.connected&&book){kimaiSync(true);api('kimai/catalog').then(setKcatalog).catch(()=>{});}},[kimai?.connected,book?.id]);
 const [historyFailed,setHistoryFailed]=useState(false);
 const loadHistory=()=>{if(!book)return;setHistoryFailed(false);api(`books/${book.id}/history`).then(setHistory).catch(()=>setHistoryFailed(true));};
 useEffect(()=>{if(view==='history')loadHistory();},[view,book?.id,book?.revision]);
 async function importBook(file:File){setBusy(true);setError('');try{const f=new FormData();f.set('file',file);const {id}=await api('books',{method:'POST',body:f});await refreshBooks();await openBook(id);toast.success('Casebook imported.');}catch(e){setError((e as Error).message);}finally{setBusy(false);if(uploadRef.current)uploadRef.current.value='';}}
 // The URL hash is the source of truth for the page; navigating just changes it.
 const go=(hash:string)=>{setSearch('');if(location.hash===hash)return;location.hash=hash;};
 function goCase(id:string){go(`#/case/${encodeURIComponent(id)}`);}
 // Pages live in the URL hash so Back, Forward and refresh keep your place.
 useEffect(()=>{const read=()=>{const h=decodeURIComponent(location.hash.slice(1));const m=/^\/case\/(.+)$/.exec(h);if(m){setOpenCase(m[1]);setView('case');}else if(h==='/skills')setView('skills');else if(h==='/history')setView('history');else{if(h&&h!=='/')window.history.replaceState(null,'','#/');setView('cases');}};read();window.addEventListener('hashchange',read);return()=>window.removeEventListener('hashchange',read);},[book?.id]);

 // Everything the user would otherwise retype comes from the case and the last session on it.
 function inferFromCase(sheet:string,caseId:string,base:Record<string,string>,keepId=false){
  const c=findCase(caseId),last=[...sessions].reverse().find(r=>r.values.C===caseId),next={...base,[caseCol(sheet)]:caseId};
  const ids=getRows(sheet).map(r=>r.values.A);
  if(!keepId){const suffix=idSuffix[sheet];next.A=nextNumberedId(ids,`${caseId||'CASE'}-${suffix}`);}
  if(!c)return next;
  const main=domainCode(c.values.H??''),support=domainCode(c.values.I??''),context=c.values.E??'';
  if(sheet===SESSIONS)Object.assign(next,{F:context||next.F,G:main||next.G,H:support,I:['T1','T2','T3'].includes(last?.values.I??'')?last!.values.I:'T1',P:last?.values.P||next.P||'1',N:(last?.values.N??next.N??'').replace(/\s*\n+\s*/g,'; '),E:last?.values.E||next.E||'Practical'});
  if(sheet===CLAIMS){const known=new Set(proof.filter(r=>r.values.B===caseId).map(r=>r.values.A));Object.assign(next,{D:main||next.D,G:context||next.G,J:last?.values.P||next.J||'1',H:(last?.values.O??'').split(/[,;\s]+/).filter(id=>known.has(id)).join(', ')});}
  if(sheet===PORTFOLIO)Object.assign(next,{C:main||next.C,D:next.D||c.values.C||'',I:[...new Set(claims.filter(r=>r.values.B===caseId).map(r=>r.values.F))].join(', ')});
  return next;
 }
 function start(sheet:string,row?:Row,caseId?:string){
  if(!book)return;setFormError('');setPending([]);
  const used=getRows(sheet);let rowNum=row?.row??5;while(!row&&used.some(r=>r.row===rowNum))rowNum++;
  if(rowNum>book.data.sheets[sheet].capacity){toast.error('This template has reached its supported capacity.');return;}
  let init:Record<string,string>={};for(const c of editable[sheet])init[c]=row?.values[c]??'';
  for(const c of dateColumns[sheet]??[])if(c in init)init[c]=excelDate(init[c]);
  for(const c of ['H','I'])if(sheet===CASES)init[c]=domainCode(init[c]);
  if(sheet===SESSIONS){init.G=domainCode(init.G);init.H=domainCode(init.H);init.J=clockTime(init.J)||init.J;init.K=clockTime(init.K)||init.K;}
  if(sheet===CLAIMS||sheet===PORTFOLIO){const k=sheet===CLAIMS?'D':'C';init[k]=domainCode(init[k]);}
  if(!row){
   const target=caseId??(view==='case'?openCase:'');
   const fallbackCase=target||[...sessions].reverse()[0]?.values.C||cases.filter(r=>!isParent(r)).at(-1)?.values.A||'';
   if(sheet===CASES)Object.assign(init,{A:nextCaseId(cases.map(r=>r.values.A),'',new Date().getFullYear()),D:cases.filter(r=>!isParent(r)).at(-1)?.values.D||'Training Case',E:cases.filter(r=>!isParent(r)).at(-1)?.values.E||'Training',F:today(),H:domainCode(book.data.profile['Main Domain']??''),I:'',K:'Ongoing',N:'T1'});
   // From inside a case, a new case goes under the same parent project.
   const here=view==='case'?findCase(openCase):undefined,parentHere=here?(isParent(here)?here.values.A:here.values.B):'';
   if(sheet===CASES&&(caseId||parentHere))init=withParent(init,caseId||parentHere);
   if(sheet===SESSIONS)init=inferFromCase(sheet,fallbackCase,{...init,B:today(),E:'Practical',F:'Training',G:'01',I:'T1',P:'1'});
   if(sheet===PROOF)init=inferFromCase(sheet,fallbackCase,{...init,C:today(),D:'',H:'Internal',I:'No',J:'No',K:book.data.profile.Name??displayName});
   if(sheet===CLAIMS)init=inferFromCase(sheet,fallbackCase,{...init,C:today(),D:'01',G:'Training',J:'1',K:'',L:'No',Q:'No'});
   if(sheet===PORTFOLIO)init=inferFromCase(sheet,fallbackCase,{...init,E:'Project Page',G:'No'});
  }
  setValues(init);setInitial(JSON.stringify(init));setConfirmDiscard(false);setConfirmKimai(false);setFieldErrors({});setConflict(null);setKTouched(false);setForm({sheet,row:rowNum,existing:!!row});setMoreOpen(layouts[sheet].more.some(c=>required[sheet].includes(c)&&!init[c]));
  if(sheet===SESSIONS)setKchoice(row?'':kDefault(init.C,init.I));
 }
 const dirty=()=>!!form&&(JSON.stringify(values)!==initial||pending.length>0);
 function closeForm(){if(saving)return;if(dirty()&&!confirmDiscard){setConfirmDiscard(true);return;}setForm(null);setConfirmDiscard(false);}
 const titleCol:Record<string,string>={[CASES]:'C',[SESSIONS]:'D',[PROOF]:'E',[CLAIMS]:'F',[PORTFOLIO]:'D'};
 const latestRev=useMemo(()=>{const m:Record<string,number>={};for(const h of history){const d=JSON.parse(h.detail);const k=`${d.sheet}:${d.row}`;if(!(k in m)||h.revision>m[k])m[k]=h.revision;}return m;},[history]);
 // Undo from History: put back what was there before this change.
 async function undoEvent(d:any){if(!book)return;try{const cur=await api('books/'+book.id);let r;
  if(!d.before?.A)r=await api(`books/${book.id}/entries/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheet:d.sheet,row:d.row,revision:cur.revision})});
  else r=await put(cur.revision,d.sheet,d.row,Object.fromEntries(editable[d.sheet].map(c=>[c,d.before[c]??''])),{source:'restore'});
  setBook(b=>b&&{...b,revision:r.revision,edits:r.edits,updated:r.updated});toast.success('Change undone.');}catch(e){toast.error((e as Error).message);}}
 // A Kimai entry that already covers this session's time: adding again would duplicate it.
 const kimaiOverlap=useMemo(()=>{if(form?.sheet!==SESSIONS||!values.B||!values.J||!values.K)return null;const a=clockTime(values.J),b=clockTime(values.K);return (kstatus?.new??[]).find((e:any)=>e.date===values.B&&e.start<b&&e.end>a)??null;},[form,values.B,values.J,values.K,kstatus]);
 useEffect(()=>{if(form?.sheet===SESSIONS&&!form.existing&&!kTouched&&kstatus)setKchoice(kimaiOverlap?'':kDefault(values.C,values.I));},[kstatus?.map,form,kimaiOverlap?.id,values.C,values.I]);
 useEffect(()=>{if(confirmDiscard)setTimeout(()=>document.querySelector<HTMLElement>('.discard-keep')?.focus(),0);},[confirmDiscard]);
 // Not on first load; on every later route change, including the first one.
 const lastRoute=useRef<string|null>(null);
 useEffect(()=>{if(!book)return;const key=view+'|'+openCase;if(lastRoute.current===null||lastRoute.current===key){lastRoute.current=key;return;}lastRoute.current=key;const t=setTimeout(()=>{if(document.querySelector('[role=dialog]'))return;const h=document.querySelector<HTMLElement>('.workspace h1');if(h){h.tabIndex=-1;h.focus({preventScroll:true});}},0);return()=>clearTimeout(t);},[view,openCase,!!book]);
 useEffect(()=>{const page=view==='case'?(findCase(openCase)?.values.C??'Case'):view==='skills'?'Skills':view==='history'?'History':'Cases';document.title=`${page} · Casebook Studio`;},[view,openCase,book?.revision]);
 const kimaiNote=shown?.sheet===SESSIONS&&kimai?.connected?(kstatus?.linked?.includes(values.A)?'':kimaiOverlap&&!kchoice?`Already in Kimai (${kimaiOverlap.start}–${kimaiOverlap.end}). Import it from Kimai review instead.`:!['T4','T5'].includes(values.I)&&kchoice&&+values.L>0&&+values.L<=24?`Adds ${fmtH(values.L)} to Kimai`:''):'';
 const formTitle=(f:Form)=>f.existing?`Edit ${f.sheet===CLAIMS?'skill claim':f.sheet===PORTFOLIO?'story':labels[f.sheet].toLowerCase()}`:({[CASES]:'New case',[SESSIONS]:'Log session',[PROOF]:'Add proof',[CLAIMS]:'Claim skill',[PORTFOLIO]:'Write story'} as Record<string,string>)[f.sheet];
 // The filled-in values hidden under More, so nothing is a surprise.
 const moreSummary=(sheet:string)=>{const skip=new Set(['A',...longCols(sheet)]);return layouts[sheet].more.filter(c=>!skip.has(c)&&values[c]&&values[c]!=='No').map(c=>{const v=values[c],l=labelFor(sheet,c);return l==='Work Level'?levels[+v]?.slice(4):l.includes('Domain')?domainLabel(v).replace(/^\d+ · /,''):v;}).filter(Boolean).slice(0,4).join(' · ');};
 const longCols=(sheet:string)=>(editable[sheet]??[]).filter(c=>longFields.includes(labelFor(sheet,c)));
 function withParent(next:Record<string,string>,parentId:string){const p=findCase(parentId);next.B=p?.values.A??'';next.A=nextCaseId(cases.map(r=>r.values.A),p?.values.A??'',new Date().getFullYear());if(p)Object.assign(next,{D:next.D==='Training Case'?'Project Case':next.D,E:p.values.E||next.E,H:domainCode(p.values.H??'')||next.H,I:domainCode(p.values.I??'')||next.I,J:p.values.J||next.J});return next;}
 function change(col:string,v:string){setFormError('');setConfirmKimai(false);setFieldErrors(e=>{if(!(col in e))return e;const n={...e};delete n[col];return n;});setValues(old=>{
  if(!form)return old;const sheet=form.sheet;let next={...old,[col]:v};
  if(!form.existing&&col===caseCol(sheet)&&sheet!==CASES){next=inferFromCase(sheet,v,next);}
  if(sheet===CASES&&col==='B'&&!form.existing)next=withParent(next,v);
  if(sheet===SESSIONS&&(col==='J'||col==='K')){const h=hoursBetween(next.J,next.K);if(h)next.L=h;}
  if(sheet===SESSIONS&&col==='L'&&next.J)next.K=addHours(next.J,v);
  if(sheet===SESSIONS&&col==='I'&&['T4','T5'].includes(v))Object.assign(next,{J:'',K:'',L:''});
  if(sheet===CLAIMS&&col==='E'){const skill=catalog.find(r=>r.values.A===v);if(skill){next.F=skill.values.C;next.D=domainCode(skill.values.B);}}
  return next;});}
 async function uploadFiles(list:FileList|File[]){
  if(!book||!form)return;setSaving(true);setFormError('');
  // Check type and size here so a big file isn't sent only to be refused; say which files were skipped.
  const ok=/\.(pdf|png|jpg|jpeg|webp|txt|md|csv|json|log|pcap|pcapng|conf|yaml|yml|docx|xlsx)$/i,skipped:string[]=[];
  list=Array.from(list).filter(f=>{const why=!ok.test(f.name)?'not a supported file type':f.size===0?'empty':f.size>lim.fileMb*1024*1024?`over ${lim.fileMb} MB`:'';if(why)skipped.push(`${f.name} (${why})`);return !why;});
  if(skipped.length)setFormError(`Not attached: ${skipped.join(', ')}.`);
  try{for(const file of list){const f=new FormData();f.set('file',file);const r=await api(`books/${book.id}/files`,{method:'POST',body:f});setBook(b=>b&&{...b,files:[r,...b.files]});formUploads.current.push(r.id);
   if(form.sheet===PROOF){setValues(v=>({...v,F:r.ref,G:'SHA256:'+r.hash,D:proofTypeFor(r.name),E:v.E||r.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ')}));}
   else setPending(p=>[...p,{id:r.id,name:r.name,hash:r.hash,ref:r.ref}]);}}
  catch(e){setFormError(m=>(m?m+' ':'')+(e as Error).message);}finally{setSaving(false);if(fileRef.current)fileRef.current.value='';}
 }
 async function put(rev:number,sheet:string,row:number,vals:Record<string,string>,extra:Record<string,any>={}){return api(`books/${book!.id}/entries`,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheet,row,revision:rev,values:vals,...extra})});}
 const send=(path:string,body:any,method='POST')=>api(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 async function kimaiSync(quiet=false){if(!book)return;setKsyncing(true);try{const st=await api(`books/${book.id}/kimai/sync`,{method:'POST'});setKstatus(st);if(st.pulled)setBook(await api('books/'+book.id));if(!quiet&&(st.pulled||st.pushed))toast.success(`Kimai: ${[st.pulled&&`${st.pulled} updated here`,st.pushed&&`${st.pushed} updated in Kimai`].filter(Boolean).join(', ')}.`);}catch(e){setKstatus((old:any)=>({...(old??{}),connected:true,offline:(e as Error).message}));if(!quiet)toast.error((e as Error).message);}finally{setKsyncing(false);}}
 async function kimaiAct(path:string,body:any){if(!book)return;try{const r=await send(`books/${book.id}/kimai/${path}`,body);if(r.edits)setBook(b=>b&&{...b,revision:r.revision,edits:r.edits,updated:r.updated});await kimaiSync(true);return r;}catch(e){toast.error(`Kimai: ${(e as Error).message}`,{duration:10000});}}
 // Every Kimai write says what it did and offers Undo.
 async function kimaiImport(items:any[]){const r=await kimaiAct('import',{items});if(!r)return;
  if(r.failed?.length)toast.error(`${r.failed.length} ${r.failed.length===1?'entry':'entries'} not imported: ${r.failed[0].reason}`,{duration:10000});if(!r.imported)return;
  toast.success(`Imported ${r.imported} from Kimai.`,{action:{label:'Undo',onClick:()=>kimaiAct('unimport',{created:r.created,linked:r.linked}).then(x=>x&&toast('Import undone.'))},duration:10000});}
 async function kimaiSend(ids:string[]){const done:string[]=[];for(const id of ids){const r=await kimaiAct('send',{session_id:id});if(r)done.push(id);}if(!done.length)return;
  toast.success(`Added ${done.length} to Kimai.`,{action:{label:'Undo',onClick:async()=>{for(const id of done)await kimaiAct('unsend',{session_id:id});toast('Removed from Kimai.');}},duration:10000});}
 // The record a save just wrote gets a brief highlight so it's easy to spot in the list.
 const [landed,setLanded]=useState('');
 useEffect(()=>{if(!landed)return;const t=setTimeout(()=>setLanded(''),1400);return()=>clearTimeout(t);},[landed]);
 // Files uploaded in a form that is then closed without saving are removed again, so they don't count toward the limits.
 const formUploads=useRef<string[]>([]);
 useEffect(()=>{if(form||!book||!formUploads.current.length)return;const ids=formUploads.current;formUploads.current=[];send(`books/${book.id}/files/forget`,{ids}).then(r=>{if(r.removed)api('books/'+book.id).then(fresh=>setBook(b=>b&&{...b,files:fresh.files})).catch(()=>{});}).catch(()=>{});},[form]);
 // Timer: start it when the work starts; stopping opens Log session with the date and times filled in.
 const pad=(n:number)=>String(n).padStart(2,'0'),hm=(d:Date)=>`${pad(d.getHours())}:${pad(d.getMinutes())}`,ymd=(d:Date)=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
 const elapsed=timer.start?Math.max(0,Math.floor((Date.now()-Date.parse(timer.start))/1000)):0;void tick;
 const clock=`${Math.floor(elapsed/3600)}:${pad(Math.floor(elapsed/60)%60)}:${pad(elapsed%60)}`;
 async function startTimer(){try{setTimer(await send('settings/timer',{start:new Date().toISOString(),case:view==='case'?openCase:''},'PUT'));}catch(e){toast.error((e as Error).message);}}
 async function stopTimer(){if(!timer.start)return;const a=new Date(timer.start),b=new Date(),caseId=timer.case&&findCase(timer.case)?timer.case:undefined;
  try{setTimer(await send('settings/timer',{start:null},'PUT'));}catch(e){toast.error((e as Error).message);return;}
  start(SESSIONS,undefined,caseId);setValues(v=>({...v,B:ymd(a),J:hm(a),K:hm(b),L:hm(a)===hm(b)?'':hoursBetween(hm(a),hm(b)),I:'T1'}));}
 async function cancelTimer(){try{setTimer(await send('settings/timer',{start:null},'PUT'));}catch(e){toast.error((e as Error).message);}}
 const kmapFor=(caseId:string)=>kstatus?.map?.[caseId];
 // Only timed (T1) sessions go to Kimai by default; rebuilt time is added only when picked.
 const kDefault=(caseId:string,tclass:string)=>{const m=kmapFor(caseId);return m&&tclass==='T1'?`${m.project}:${m.activity}`:'';};
 const kOptions:[string,string][]=(kcatalog?.activities??[]).map(a=>[`${a.project??''}:${a.id}`,`${kcatalog?.projects.find(p=>p.id===a.project)?.name??'Any project'} · ${a.name}`]);
 // Files dropped on a session or skill claim become proof records on the same case first.
 // Editing a session that is already in Kimai changes the Kimai entry too, so ask first (unless the analyst turned that off).
 function askThenSave(){const linked=form?.sheet===SESSIONS&&form.existing&&kimai?.connected&&kstatus?.linked?.includes(values.A);let skip=false;try{skip=localStorage.getItem('kimai-edit-noask')==='1';}catch{}
  if(linked&&dirty()&&!skip&&!confirmKimai){setNoAsk(false);setConfirmKimai(true);return;}
  if(confirmKimai&&noAsk){try{localStorage.setItem('kimai-edit-noask','1');}catch{}}setConfirmKimai(false);saveEntry();}
 async function saveEntry(){if(!form||!book)return;setSaving(true);setFormError('');
  try{
   let rev=book.revision,edits=book.edits,updated=book.updated;const vals={...values},caseId=vals[caseCol(form.sheet)];
   if(pending.length&&form.sheet!==PROOF){
    const live=rowsFor(book.data,edits,PROOF);let row=5;const ids=live.map(r=>r.values.A),made:string[]=[];
    for(const f of pending){while(live.some(r=>r.row===row))row++;const id=nextNumberedId([...ids,...made],`${caseId}-P`);
     const r=await put(rev,PROOF,row,{A:id,B:caseId,C:vals.B&&form.sheet===SESSIONS?vals.B:vals.C||today(),D:proofTypeFor(f.name),E:(form.sheet===SESSIONS?vals.D:vals.F)||f.name,F:f.ref,G:'SHA256:'+f.hash,H:'Internal',I:'No',J:'No',K:book.data.profile.Name??displayName,N:''});
     rev=r.revision;edits=r.edits;updated=r.updated;made.push(id);row++;}
    const col=form.sheet===SESSIONS?'O':'H';vals[col]=[...(vals[col]?vals[col].split(/[,;\s]+/).filter(Boolean):[]),...made].join(', ');
    // The proof is saved now: keep its IDs in the form so a failed save below doesn't attach it twice.
    setPending([]);setValues(v=>({...v,[col]:vals[col]}));
   }
   // A new record takes the first free row and the next ID at save time, so a change from another window can't block it.
   let rowNum=form.row;
   if(!form.existing){const live=rowsFor(book.data,edits,form.sheet);if(live.some(r=>r.row===rowNum)){rowNum=5;while(live.some(r=>r.row===rowNum))rowNum++;}
    if(live.some(r=>r.values.A===vals.A)){const ids=live.map(r=>r.values.A);vals.A=form.sheet===CASES?nextCaseId(ids,vals.B,new Date().getFullYear()):nextNumberedId(ids,`${caseId||'CASE'}-${idSuffix[form.sheet]}`);}
    if(rowNum!==form.row||vals.A!==values.A){setForm({...form,row:rowNum});setValues(v=>({...v,A:vals.A}));}}
   let extra={};
   if(form.sheet===SESSIONS&&kimai?.connected&&!kstatus?.linked?.includes(vals.A)&&kchoice&&!['T4','T5'].includes(vals.I)){const [project,activity]=kchoice.split(':').map(Number);if(!kmapFor(caseId))await send(`books/${book.id}/kimai/map`,{case_id:caseId,project,activity},'PUT');extra={kimai:{project,activity}};}
   const r=await put(rev,form.sheet,rowNum,vals,extra);
   setBook({...book,revision:r.revision,edits:r.edits,updated:r.updated});setForm(null);setPending([]);await refreshBooks();
   if(r.kimai?.status==='error')toast.error(`Saved in your casebook, not in Kimai. ${r.kimai.error} You can add it from Kimai review.`);else if(r.kimai?.status==='conflict')toast.warning('Saved here. It also changed in Kimai, so check Kimai review.');
   if(r.kimai)kimaiSync(true);
   if(form.sheet===CASES&&!form.existing)goCase(vals.A);
   formUploads.current=[];setLanded(vals.A);toast.success(`${labels[form.sheet]} saved.`);
  }catch(e){let msg=(e as Error).message;
   if(form.existing&&/another window/.test(msg)){try{const fresh=await api('books/'+book.id),now=rowsFor(fresh.data,fresh.edits,form.sheet).find(r=>r.row===form.row)?.values??{},was=JSON.parse(initial),norm=(c:string,v='')=>(dateColumns[form.sheet]??[]).includes(c)?excelDate(v):/Domain/.test(labelFor(form.sheet,c))?domainCode(v):form.sheet===SESSIONS&&(c==='J'||c==='K')?clockTime(v)||v:v,diffCols=editable[form.sheet].filter(c=>norm(c,now[c])!==(was[c]??'')&&norm(c,now[c])!==(values[c]??''));
    if(diffCols.length){const theirs={...values};for(const c of editable[form.sheet])theirs[c]=norm(c,now[c]);setBook(fresh);setConflict({fields:diffCols.map(c=>labelFor(form.sheet,c)),theirs});return;}}catch{}}
   setFormError(msg);markEmptyRequired();
   {const errs:Record<string,string>={};for(const c of required[form.sheet])if(!values[c]?.trim())errs[c]='Fill this in.';
    if(form.sheet===SESSIONS&&['T1','T2','T3'].includes(values.I)&&!(+values.L>0&&+values.L<=24))errs.L=values.L?'Enter hours above 0, up to 24.':'Enter start and end times, or hours.';setFieldErrors(errs);}if(layouts[form.sheet].more.some(c=>msg.includes(labelFor(form.sheet,c))))setMoreOpen(true);try{setBook(await api('books/'+book.id));}catch{}}finally{setSaving(false);}
 }
 // Delete clears the row; Undo writes the old values back into the same row.
 async function deleteEntry(){if(!form||!book)return;setSaving(true);
  try{const f=form,r=await api(`books/${book.id}/entries/delete`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sheet:f.sheet,row:f.row,revision:book.revision})});
   setBook(b=>b&&{...b,revision:r.revision,edits:r.edits,updated:r.updated});setForm(null);
   toast(`Deleted ${r.before.A}.`,{action:{label:'Undo',onClick:async()=>{try{const cur=await api('books/'+book.id);const back=await put(cur.revision,f.sheet,f.row,Object.fromEntries(editable[f.sheet].map(c=>[c,r.before[c]??''])),{source:'restore'});setBook(b=>b&&{...b,revision:back.revision,edits:back.edits,updated:back.updated});toast.success(`Restored ${r.before.A}.`);}catch(e){toast.error((e as Error).message);}}},duration:10000});
  }catch(e){setFormError((e as Error).message);}finally{setSaving(false);}
 }
 // How many saves since the last Excel download, so it's clear the .xlsx on disk is behind.
 const [exportedRev,setExportedRev]=useState<number|null>(null);
 useEffect(()=>{if(!book)return;try{setExportedRev(+(localStorage.getItem('exported:'+book.id)??0));}catch{setExportedRev(0);}},[book?.id]);
 const unsaved=book&&exportedRev!==null?Math.max(0,book.revision-exportedRev):0;
 async function download(kind:string){if(!book)return;setBusy(true);setErrorRetry(()=>()=>download(kind));try{let r:Response;try{r=await fetch(`/api/books/${book.id}/${kind}`);}catch{throw Error('Casebook Studio is not running. Start it again; nothing here is lost.');}if(!r.ok)throw Error((await r.json() as any).error??'Download failed.');const name=/filename="([^"]+)"/.exec(r.headers.get('content-disposition')??'')?.[1]??'casebook.xlsx';downloadBlob(await r.blob(),name);setErrorRetry(null);if(kind!=='original'){setExportedRev(book.revision);try{localStorage.setItem('exported:'+book.id,String(book.revision));}catch{}}}catch(e){setError(`Download failed: ${(e as Error).message}`);}finally{setBusy(false);}}

 // Wraps each field so a failed save can say, right under it, what it needs.
 function field(col:string){const el=fieldInner(col);const err=fieldErrors[col];return el&&err?React.cloneElement(el as React.ReactElement<any>,{error:err}):el;}
 function fieldInner(col:string){
  const form=shown;if(!book||!form)return null;const sheet=form.sheet,label=labelFor(sheet,col),value=values[col]??'',set=(v:string)=>change(col,v),req=required[sheet].includes(col),wide=longFields.includes(label)||sheet===PORTFOLIO&&col==='M';
  if(sheet!==CASES&&col===caseCol(sheet))return <Field key={col} label="Case" required={req}><SearchChoice value={value} onChange={set} options={cases.filter(r=>!isParent(r)).map(r=>[r.values.A,r.values.A+' · '+r.values.C])} label="Case"/></Field>;
  if(sheet===CASES&&col==='B')return <Field key={col} label="Parent project"><SearchChoice value={findCase(value)?.values.A??value} onChange={set} placeholder="None" options={[['','None'],...cases.filter(r=>isParent(r)&&r.values.A!==values.A).map(r=>[r.values.A,r.values.A+' · '+r.values.C] as [string,string])]} label="Parent project"/></Field>;
  if(sheet===CLAIMS&&col==='E'){const c=findCase(values.B),rank=(r:Row)=>{const d=domainCode(r.values.B);return d===domainCode(c?.values.H??'')?0:d===domainCode(c?.values.I??'')?1:2;};const sorted=[...catalog].sort((a,b)=>rank(a)-rank(b));const claimed=new Set(claims.filter(r=>r.values.B===values.B&&r.values.A!==values.A).map(r=>r.values.E));return <Field key={col} label="Skill" required><SearchChoice value={value} onChange={set} options={sorted.map(r=>[r.values.A,r.values.C+'  ·  '+r.values.A+(claimed.has(r.values.A)?'  ·  already claimed here':'')])} label="Skill"/></Field>;}
  if(sheet===CLAIMS&&col==='H'){const chosen=value.split(/[,;\s]+/).filter(Boolean),mine=proof.filter(r=>r.values.B===values.B);const toggle=(id:string)=>set((chosen.includes(id)?chosen.filter(x=>x!==id):[...chosen,id]).join(', '));
   return <Field key={col} label="Proof" required wide group><div className="chips">{mine.map(r=><button type="button" key={r.values.A} className={'chip'+(chosen.includes(r.values.A)?' on':'')} onClick={()=>toggle(r.values.A)} title={r.values.E}>{chosen.includes(r.values.A)&&<Check size={13}/>}{r.values.A}<span>{r.values.E}</span></button>)}{pending.map(f=><span key={f.id} className="chip on"><Paperclip size={13}/>{f.name}</span>)}{AttachButton()}</div></Field>;}
  if(sheet===SESSIONS&&col==='O')return <Field key={col} label={label} wide group><div className="chips">{value.split(/[,;]+/).map(v=>v.trim()).filter(Boolean).map(id=><span key={id} className="chip on">{id}</span>)}{pending.map(f=><span key={f.id} className="chip on"><Paperclip size={13}/>{f.name}</span>)}{AttachButton()}</div></Field>;
  if(sheet===SESSIONS&&col==='KIMAI'){if(!kimai?.connected)return null;if(form.existing&&kstatus?.linked?.includes(values.A))return <Field key={col} label="Kimai" group><span className="linked-note"><Link2 size={14}/>Linked to a Kimai entry</span></Field>;if(['T4','T5'].includes(values.I))return null;if(!kstatus||!kcatalog)return null;const mp=kmapFor(values.C)?.project,ordered=[...kOptions].sort((a,b)=>+(b[0].split(':')[0]===String(mp))-+(a[0].split(':')[0]===String(mp)));return <Field key={col} label="Add to Kimai"><Choice label="Add to Kimai" value={kchoice||'none'} onChange={v=>{setKTouched(true);setKchoice(v==='none'?'':v);}} options={[['none',"Don't add"],...ordered]}/></Field>;}
  const noHours=sheet===SESSIONS&&['T4','T5'].includes(values.I);
  if(sheet===SESSIONS&&['J','K'].includes(col))return <Field key={col} label={label}><Input type="time" value={noHours?'':clockTime(value)||value} onChange={e=>set(e.target.value)} aria-label={label} disabled={noHours}/></Field>;
  if(sheet===SESSIONS&&col==='L')return <Field key={col} label="Hours"><div className="hours-input"><Input type="number" step="0.25" min={0} max={24} value={noHours?'':value} placeholder={noHours?'None for '+values.I:undefined} onChange={e=>set(e.target.value)} aria-label="Hours" disabled={noHours} aria-invalid={!noHours&&value!==''&&(+value<=0||+value>24)||undefined} aria-describedby={!noHours&&+value>24?'hours-over':undefined}/>{!noHours&&+value>24?<span id="hours-over" className="warn-text over" role="status">Over 24 h</span>:!noHours&&+value>0&&<span className="muted" aria-hidden="true">{fmtH(value)}</span>}</div></Field>;
  if(sheet===PROOF&&col==='F')return <Field key={col} label="File or link" required wide>{value.startsWith('attachments/')?<div className="file-chip"><FileText size={16}/><span>{value.replace(/^attachments\/[^/]+\//,'')}</span><button type="button" aria-label="Remove file" onClick={()=>setValues(v=>({...v,F:'',G:''}))}><X size={14}/></button></div>:<div className="drop"><Button type="button" variant="outline" onClick={()=>fileRef.current?.click()} disabled={saving}><Upload size={15}/>Choose file</Button>{book.files.length>0&&<Choice label="Saved file" value="" onChange={id=>{const f=book.files.find(f=>f.id===id)!;setValues(v=>({...v,F:`attachments/${f.id}/${f.name}`,G:'SHA256:'+f.hash,D:proofTypeFor(f.name)}));}} options={book.files.map(f=>[f.id,f.name])}/>}<Input placeholder="or paste a link" value={value} onChange={e=>set(e.target.value)} aria-label="Link"/></div>}</Field>;
  if(sheet===PROOF&&col==='G')return null;
  let options:Option[]|undefined;
  if(label.includes('Domain')||sheet===CLAIMS&&col==='D')options=domains.map(([v,l])=>[v,l,domainTip(v)??'']);
  else if(label==='Time Class')options=Object.keys(timeNames).map(k=>[k,`${k} · ${defs.time[k]?.[0]??timeNames[k as keyof typeof timeNames].slice(5)}`,defs.time[k]?.[1]??'']);
  else if(label==='Work Level')options=levels.map(v=>[v[0],`${v[0]} · ${defs.level[v[0]]?.[0]??v.slice(4)}`,defs.level[v[0]]?.[1]??'']);
  else{const list=listFor(sheet,col);if(list)options=list.map(v=>[v,v,sheet===CASES&&col==='D'?defs.caseType[v]??'':'']);}
  if(sheet===CLAIMS&&col==='F')return null;
  if(options)return <Field key={col} label={label} required={req}><Choice label={label} options={options} value={label.includes('Domain')||sheet===CLAIMS&&col==='D'?domainCode(value):value} onChange={set}/></Field>;
  if(wide)return <Field key={col} label={sheet===PORTFOLIO&&col==='M'?'Story':label} required={req} wide><Textarea aria-label={sheet===PORTFOLIO&&col==='M'?'Story':label} rows={3} value={value} onChange={e=>set(e.target.value)}/></Field>;
  const date=(dateColumns[sheet]??[]).includes(col);
  if(suggestCols[sheet]?.includes(col))return <Field key={col} label={label} required={req}><SuggestInput label={label} value={value} onChange={set} options={suggestions(sheet,col)}/></Field>;
  return <Field key={col} label={label} required={req}><Input aria-label={label} value={value} type={date?'date':'text'} onChange={e=>set(e.target.value)} readOnly={col==='A'&&form.existing}/></Field>;
 }
 function AttachButton(){return <button type="button" className="chip add" onClick={()=>fileRef.current?.click()} disabled={saving}><Paperclip size={13}/>Attach</button>;}

 const current=findCase(openCase);
 const q=search.toLowerCase(),match=(r:Row)=>!q||Object.values(r.values).join(' ').toLowerCase().includes(q);
 const tracked=sessions.filter(r=>r.values.I==='T1').reduce((n,r)=>n+(+r.values.L||0),0),rebuilt=sessions.filter(r=>['T2','T3'].includes(r.values.I)).reduce((n,r)=>n+(+r.values.L||0),0);
 const caseHours=(id:string)=>sessions.filter(r=>r.values.C===id).reduce((n,r)=>n+(+r.values.L||0),0);
 const nav=[{id:'cases',label:'Cases',icon:FolderOpen},{id:'skills',label:'Skills',icon:Layers},{id:'history',label:'History',icon:History}] as const;
 const searchKeys=(e:React.KeyboardEvent<HTMLInputElement>)=>{if(e.key==='Escape'){if(search)setSearch('');else e.currentTarget.blur();}};
 const bookLabel=book?.data.profile.Name||book?.name.replace(/\.xlsx$/i,'')||'Casebook';
 const tone=(v:string)=>v==='Verified'||v==='Approved'?' ok':v==='Rejected'||v==='Safety / Scope Stop'?' bad':v==='Needs Correction'?' warn':'';
 const status=(v?:string)=>v?<span className={'badge'+tone(v)}>{v}</span>:null;
 // In lists, Pending Review is the default state, so only other states are shown there.
 const rowStatus=status;
 const fileFor=(ref?:string)=>book?.files.find(f=>ref?.includes(f.id));
 const parents=cases.filter(isParent),loose=cases.filter(r=>!isParent(r)&&!parentOf(r));

 return <SidebarProvider defaultOpen={typeof matchMedia==='undefined'||!matchMedia('(max-width:1023px)').matches} style={{'--sidebar-width':'13rem'} as React.CSSProperties}><Toaster position="bottom-right" theme={dark?'dark':'light'}/><CloseSheetOnRoute/>
 <Sidebar className="studio-sidebar" collapsible="icon"><SidebarHeader><div className="brand"><Shield size={18}/><strong>Casebook Studio</strong></div></SidebarHeader><SidebarContent><nav aria-label="Pages"><SidebarMenu>{nav.map(s=><SidebarMenuItem key={s.id}><SidebarMenuButton tooltip={s.label} aria-current={view===s.id||s.id==='cases'&&view==='case'?'page':undefined} isActive={view===s.id||s.id==='cases'&&view==='case'} onClick={()=>go(s.id==='cases'?'#/':`#/${s.id}`)} disabled={!book}><s.icon/><span>{s.label}</span></SidebarMenuButton></SidebarMenuItem>)}</SidebarMenu></nav><button className="theme-btn" onClick={toggleTheme} aria-label={dark?'Switch to light mode':'Switch to dark mode'} title={dark?'Switch to light mode':'Switch to dark mode'}>{dark?<Sun size={16}/>:<Moon size={16}/>}</button></SidebarContent></Sidebar>
 <SidebarInset><header className="topbar"><div className="topbar-left"><SidebarTrigger/>{view==='case'&&current&&<button className="crumb" onClick={()=>go('#/')}><ChevronLeft size={16}/>Cases</button>}</div>
  <div className="topbar-actions"><button className="icon-btn" aria-label="Help" title="Help (?)" onClick={()=>setHelpOpen(true)}><CircleHelp size={17}/></button>{book&&cases.some(r=>!isParent(r))&&(timer.start?<><Button variant="outline" size="sm" className="timer-run" title="Stop the timer and log the session" onClick={stopTimer}><span className="timer-dot" aria-hidden="true"/><span className="num">{clock}</span><span className="wide-only">Stop</span></Button><ConfirmButton className="icon-btn timer-cancel" ariaLabel="Cancel the timer" title="Cancel the timer" label={<X size={15}/>} confirmLabel="Cancel timer?" onConfirm={cancelTimer}/></>:<button className="icon-btn" aria-label="Start timer" title="Start timer" onClick={startTimer}><Timer size={17}/></button>)}{book&&<Button className="primary-button" size="sm" title={cases.some(r=>!isParent(r))?'Log session (L)':'Create a case first'} onClick={()=>start(SESSIONS)} disabled={busy||!cases.some(r=>!isParent(r))}><Clock size={15}/><span className="wide-only">Log session</span><span className="narrow-only">Log</span></Button>}
  <Popover open={menuOpen} onOpenChange={setMenuOpen}><PopoverTrigger asChild><Button variant="ghost" size="sm" className="book-menu" aria-label={`${bookLabel}, casebook menu`}><span className="wide-only">{bookLabel}</span><span className="narrow-only">{bookLabel.split(/[\s_]+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase()}</span><ChevronDown size={15}/></Button></PopoverTrigger><PopoverContent align="end" className="menu w-64 p-1.5" onClick={e=>{if((e.target as HTMLElement).closest('.menu-item'))setMenuOpen(false);}}>
   {books.length>1&&<>{books.map(b=><button key={b.id} className="menu-item" onClick={()=>openBook(b.id)}>{book?.id===b.id?<Check size={15}/>:<span className="w-[15px]"/>}<span className="truncate">{b.name}</span></button>)}<hr/></>}
   <button className="menu-item" onClick={()=>uploadRef.current?.click()}><Upload size={15}/>Import casebook</button>
   {book&&<button className="menu-item" onClick={()=>setKimaiView('connect')}><Clock size={15}/>{kimai?.connected?'Kimai':'Connect Kimai'}</button>}
   <button className="menu-item" onClick={()=>setLimOpen(true)}><Paperclip size={15}/>Upload limits</button>
   {book&&<><hr/><button className="menu-item" onClick={()=>download('export')}><FileSpreadsheet size={15}/>Download Excel{unsaved>0&&<span className="muted"> · {plural(unsaved,'change')}</span>}</button><button className="menu-item" onClick={()=>download('bundle')}><FileArchive size={15}/>Download Excel + proof files</button><button className="menu-item" onClick={()=>download('original')}><FileDown size={15}/>Download the file you imported</button></>}
  </PopoverContent></Popover></div></header>
 <input ref={uploadRef} type="file" accept=".xlsx" className="hidden" onChange={e=>e.target.files?.[0]&&importBook(e.target.files[0])}/>
 <input ref={fileRef} type="file" multiple className="hidden" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.json,.log,.pcap,.pcapng,.conf,.yaml,.yml,.docx,.xlsx" onChange={e=>e.target.files?.length&&uploadFiles(e.target.files)}/>
 <div className="workspace">
 {error&&<div role="alert" className="error-banner">{error}<Button variant="ghost" size="sm" onClick={()=>{const again=errorRetry;setError('');setErrorRetry(null);again?.();}}>{errorRetry?'Try again':'Dismiss'}</Button></div>}
 {!book?<section className={'import'+(dragging?' over':'')} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f&&!busy)importBook(f);}}><h1>Import your casebook</h1><p>Drop your Field School casebook (.xlsx) here. No casebook yet? Ask Will for it.</p><Button className="primary-button" disabled={busy||!loaded} onClick={()=>uploadRef.current?.click()}><Upload size={16}/>{busy?'Importing…':'Choose file'}</Button></section>:
 view==='cases'?<>
  <div className="heading"><h1>Cases</h1><div className="heading-actions"><div className="search"><Search size={15}/><Input placeholder="Search" aria-label="Search cases" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={searchKeys}/></div><Button variant="outline" title="New case (N)" onClick={()=>start(CASES)}><Plus size={15}/>New case</Button></div></div>
  <p className="summary-line"><span>{plural(cases.filter(r=>!isParent(r)).length,'case')}</span><span title={defs.time.T1?.[1]??'Exact time record exists.'}><b className="num">{fmtH(tracked)}</b> tracked (T1)</span>{+rebuilt>0&&<span title="Hours rebuilt from records (T2) or proven minimum (T3). Kept separate from tracked."><b className="num">{fmtH(rebuilt)}</b> rebuilt (T2, T3)</span>}<span>{plural(claims.length,'skill claim')}</span></p>
  {kimai?.connected&&KimaiBar()}
  {cases.length===0?<div className="empty"><p>No cases yet.</p><Button variant="outline" onClick={()=>start(CASES)}><Plus size={15}/>New case</Button></div>:
  q&&!cases.some(match)?<div className="empty"><p>No cases match “{search}”.</p><Button variant="ghost" onClick={()=>setSearch('')}>Clear search</Button></div>:[...parents.map(p=>({p,kids:cases.filter(r=>!isParent(r)&&parentOf(r)===p)})),{p:undefined,kids:loose}].filter(g=>g.kids.length||g.p).map(g=>{const kids=g.kids.filter(match);if(q&&!kids.length&&!(g.p&&match(g.p)))return null;return <section className="group" key={g.p?.values.A??'loose'}>
   {g.p?<div className="group-head"><span className="mono">{g.p.values.A}</span><h2>{g.p.values.C}</h2><button className="icon-btn" aria-label="Edit project" onClick={()=>start(CASES,g.p)}><Pencil size={14}/></button><button className="text-btn" onClick={()=>start(CASES,undefined,g.p!.values.A)}><Plus size={14}/>Add case to project</button></div>:parents.length>0&&g.kids.length>0&&<div className="group-head"><h2>Other cases</h2></div>}
   <div className="list">{kids.map(r=><div key={r.row} className={"case-row with-action"+(landed===r.values.A?" landed":"")} onClick={()=>goCase(r.values.A)}><span className="mono">{r.values.A}</span><button type="button" className="case-name link" onClick={e=>{e.stopPropagation();goCase(r.values.A);}}>{r.values.C}</button><span className="muted" title={domainLabel(r.values.H??'')}>{domainLabel(r.values.H??'').replace(/ · .*/,'')} · {domainLabel(r.values.H??'').replace(/^\d+ · /,'').split(/[,&]/)[0].trim()}</span><span className="muted num">{fmtH(caseHours(r.values.A))}</span>{rowStatus(r.values.L)??<span/>}<button className="row-action" aria-label={`Log session for ${r.values.A}`} title="Log session" onClick={e=>{e.stopPropagation();start(SESSIONS,undefined,r.values.A);}}><Clock size={15}/></button></div>)}</div>
  </section>;})}
 </>:
 view==='case'&&current?CaseView():view==='case'?<div className="empty"><p>No case “{openCase}” in this casebook.</p><Button variant="outline" onClick={()=>go('#/')}>Back to cases</Button></div>:
 view==='skills'?<>
  <div className="heading"><h1>Skills</h1><div className="heading-actions"><div className="search"><Search size={15}/><Input placeholder="Search" aria-label="Search skills" value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={searchKeys}/></div><Button variant="outline" onClick={()=>start(CLAIMS)} disabled={!cases.length}><Plus size={15}/>Claim skill</Button></div></div>
  {claims.length===0?<div className="empty"><p>No skill claims yet.{!cases.length&&' Start a case first.'}</p><Button variant="outline" onClick={()=>start(CLAIMS)} disabled={!cases.length}><Plus size={15}/>Claim skill</Button></div>:q&&!claims.some(match)?<div className="empty"><p>No skills match “{search}”.</p><Button variant="ghost" onClick={()=>setSearch('')}>Clear search</Button></div>:domains.map(([code,name])=>{const mine=claims.filter(r=>domainCode(r.values.D)===code&&match(r));if(!mine.length)return null;return <section className="group" key={code}><div className="group-head"><h2>{name}</h2></div><div className="list">{mine.map(r=><button key={r.row} className={"case-row"+(landed===r.values.A?" landed":"")} onClick={()=>start(CLAIMS,r)}><span className="mono">{r.values.E}</span><span className="case-name">{r.values.F}</span><span className="muted">{findCase(r.values.B)?.values.C??r.values.B}</span><span className="muted" title="Work level">{levels[+r.values.J]?.slice(4)}</span>{r.values.K?<span className={'badge'+tone(r.values.K)} title="Result">{r.values.K}</span>:<span/>}{rowStatus(r.values.N)}</button>)}</div></section>;})}
 </>:
 view==='history'?<>
  <div className="heading"><h1>History</h1></div>
  {historyFailed?<div className="empty"><p>Couldn't load History.</p><Button variant="outline" onClick={loadHistory}>Try again</Button></div>:history.length===0?<div className="empty"><p>No changes yet.</p></div>:Object.entries(history.reduce((g:Record<string,any[]>,h)=>{const day=new Date(h.created).toLocaleDateString(undefined,{weekday:'short',month:'short',day:'numeric',year:'numeric'});(g[day]??=[]).push(h);return g;},{}) as Record<string,any[]>).map(([day,items])=><section className="group" key={day}><div className="group-head"><h2>{day}</h2></div><div className="list">{items.map(h=>{const d=JSON.parse(h.detail),added=!d.before?.A,removed=!!d.deleted,changed=Object.keys(d.after).filter(k=>(d.before?.[k]??'')!==(d.after[k]??'')).map(k=>labelFor(d.sheet,k));const what=removed?'Deleted':d.source==='restore'?'Restored':added?'Added':'Edited',rec=removed?d.before:{...d.before,...d.after},caseOf=findCase(rec[caseCol(d.sheet)])?.values.C,title=rec[titleCol[d.sheet]]??'';const latest=latestRev[`${d.sheet}:${d.row}`]===h.revision;return <div className="history-item" key={h.revision}><details className="history-row"><summary><span className="case-name">{what} {labels[d.sheet]?.toLowerCase()} <span className="mono id">{rec.A}</span> {title}{d.sheet!==CASES&&caseOf&&<span className="muted"> · {caseOf}</span>}{d.source==='kimai'&&<span className="badge">from Kimai</span>}</span><span className="muted truncate">{added||removed?'':changed.join(', ')}</span><span className="muted num">{new Date(h.created).toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})}</span></summary><div className="history-diff">{Object.keys(d.after).filter(k=>(d.before?.[k]??'')!==(d.after[k]??'')).map(k=><div key={k}><span className="muted">{labelFor(d.sheet,k)}</span><span>{(()=>{const l=labelFor(d.sheet,k),f=(v:string)=>!v?v:l==='Hours'?fmtH(v):(dateColumns[d.sheet]??[]).includes(k)?excelDate(v):d.sheet===SESSIONS&&(k==='J'||k==='K')?clockTime(v)||v:v;return <>{d.before?.[k]?<><s>{f(d.before[k])}</s> → </>:''}{f(d.after[k])||'(empty)'}</>;})()}</span></div>)}</div></details>{latest&&<ConfirmButton className="text-btn history-undo" ariaLabel={`Undo: ${what} ${rec.A??''}`} title="Undo this change. Only the latest change to a record can be undone." label="Undo" confirmLabel={removed?`Restore ${rec.A}?`:added?`Delete ${rec.A}?`:'Put back the old values?'} onConfirm={()=>undoEvent(d)}/>}</div>;})}</div></section>)}
 </>:null}
 </div></SidebarInset>

 <Dialog open={!!form} onOpenChange={open=>{if(!open)closeForm();}}><DialogContent onCloseAutoFocus={returnFocus} className="entry-dialog" onOpenAutoFocus={e=>{if(matchMedia('(pointer:coarse)').matches){e.preventDefault();return;}const empty=[...document.querySelectorAll<HTMLInputElement>('.entry-dialog .form-rows [aria-required=true]')].find(x=>!x.disabled&&isEmpty(x)&&x.type!=='date'),el=empty??document.querySelector<HTMLElement>('.entry-dialog .form-rows textarea:not([disabled]), .entry-dialog .form-rows input:not([disabled]):not([type=date])');if(el){e.preventDefault();setTimeout(()=>el.focus(),0);}}} onEscapeKeyDown={e=>{if(menuEscape(e))return;if(conflict){e.preventDefault();setConflict(null);return;}if(confirmKimai){e.preventDefault();setConfirmKimai(false);return;}if(confirmDiscard){e.preventDefault();setConfirmDiscard(false);return;}if(dirty()){e.preventDefault();setConfirmDiscard(true);}}}><DialogHeader><DialogTitle>{shown&&formTitle(shown)}</DialogTitle><DialogDescription className="sr-only">{values.A}</DialogDescription></DialogHeader>
  <div className={'entry-scroll'+(dragging?' over':'')} onDragOver={e=>{if(form?.sheet!==CASES&&form?.sheet!==PORTFOLIO){e.preventDefault();setDragging(true);}}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);if(e.dataTransfer.files.length)uploadFiles(e.dataTransfer.files);}} onPaste={e=>{const files=[...e.clipboardData.files];if(files.length&&form?.sheet!==CASES&&form?.sheet!==PORTFOLIO){e.preventDefault();uploadFiles(files);}}}>
  {formError&&<div className="form-error" role="alert">{formError}</div>}
  {shown&&<><div className="form-rows">{layouts[shown.sheet].rows.map((row,i)=>{const cells=row.map(c=>field(c)).filter(Boolean);return cells.length?<div key={i} className={'form-row'+(row.includes('J')||shown.sheet===CASES&&row.includes('F')?' times':'')} style={{gridTemplateColumns:`repeat(${cells.length},minmax(0,1fr))`}}>{cells}</div>:null;})}</div>
  <details className="more" open={moreOpen} onToggle={e=>setMoreOpen((e.currentTarget as HTMLDetailsElement).open)}><summary>More <span className="muted">{moreSummary(shown.sheet)}</span></summary><div className="form-grid">{layouts[shown.sheet].more.map(c=>field(c))}</div></details></>}
  </div>
  <div className="dialog-actions">{shown?.existing&&<ConfirmButton className="delete-btn" label={<><Trash2 size={15}/>Delete</>} confirmLabel={shown.sheet===SESSIONS&&kstatus?.linked?.includes(values.A)?'Delete here? Kimai keeps its entry':`Delete ${values.A}?`} onConfirm={deleteEntry} disabled={saving}/>}{conflict?<><span className="discard-q" role="alert">Changed in another window: {conflict.fields.join(', ')}.</span><Button key="theirs" variant="outline" onClick={()=>{setValues(conflict.theirs);setInitial(JSON.stringify(conflict.theirs));setConflict(null);setFormError('');}}>Use theirs</Button><Button key="mine" className="primary-button" autoFocus onClick={()=>{setConflict(null);saveEntry();}} disabled={saving}>Keep mine</Button></>:confirmKimai?<><span className="discard-q" role="alert">This also changes the entry in Kimai.</span><label className="check noask"><Checkbox checked={noAsk} onCheckedChange={v=>setNoAsk(v===true)}/>Don't ask again</label><Button key="back" variant="ghost" onClick={()=>setConfirmKimai(false)}>Back</Button><Button key="confirm" className="primary-button" autoFocus onClick={askThenSave} disabled={saving}>Save and update Kimai</Button></>:confirmDiscard?<><span className="discard-q" role="alert">Discard your changes?</span><Button key="keep" variant="ghost" className="discard-keep" autoFocus onClick={()=>setConfirmDiscard(false)}>Keep editing</Button><Button key="discard" variant="outline" className="discard-yes" onClick={()=>setForm(null)}>Discard</Button></>:<>{kimaiNote&&!kimaiNote.startsWith('Adds')&&<span className="save-note">{kimaiNote}</span>}<Button key="cancel" variant="ghost" onClick={closeForm} disabled={saving}>Cancel</Button><Button key="save" className="primary-button" onClick={askThenSave} disabled={saving}>{saving?'Saving…':kimaiNote.startsWith('Adds')?`Save and add ${fmtH(values.L)} to Kimai`:shown?.sheet===SESSIONS&&shown.existing&&kimai?.connected&&kstatus?.linked?.includes(values.A)?'Save and update Kimai':'Save'}</Button></>}</div>
 </DialogContent></Dialog>

 <Dialog open={!!portfolio} onOpenChange={open=>!open&&setPortfolio(null)}><DialogContent onCloseAutoFocus={returnFocus} className="portfolio-dialog" onEscapeKeyDown={menuEscape}><DialogHeader><DialogTitle>{portfolio?.values.D}</DialogTitle><DialogDescription>{portfolio?.values.J??'Pending Review'}</DialogDescription></DialogHeader><p className="portfolio-story">{portfolio?.values.M||'No story yet.'}</p>{portfolio?.values.I&&<p className="muted">{portfolio.values.I}</p>}<label className="confirm-label"><Checkbox checked={publicCheck} onCheckedChange={v=>setPublicCheck(v===true)}/><span>Reviewed and OK to share</span></label><Button className="primary-button" disabled={!publicCheck||portfolio?.values.G!=='Yes'||!portfolio?.values.M} title={portfolio?.values.G!=='Yes'?'Set Cleaned Up to Yes first':undefined} onClick={()=>{if(!portfolio)return;const escape=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));const title=escape(portfolio.values.D),story=escape(portfolio.values.M),skills=escape(portfolio.values.I??''),state=escape(portfolio.values.J==='Approved'?'Approved project record':'Learning record · Pending Review');const html=`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:18px/1.7 system-ui;color:#1b2a33;background:#f6f7f8;margin:0;padding:7vw}main{max-width:850px;margin:auto;background:white;padding:5vw;border-radius:10px}h1{font-size:2.5em;line-height:1.15}p{white-space:pre-wrap}.meta{font-size:14px;color:#5b6b75}</style><main><p class="meta">I/O Shield · Project portfolio</p><h1>${title}</h1><p class="meta">${state}</p><p>${story}</p><h2>Skills described</h2><p>${skills}</p></main></html>`;downloadBlob(new Blob([html],{type:'text/html'}),'portfolio-project.html');}}><Download size={15}/>Download page</Button></DialogContent></Dialog>
 {KimaiConnect()}
 {LimitsDialog()}
 <Dialog open={helpOpen} onOpenChange={setHelpOpen}><DialogContent onCloseAutoFocus={returnFocus} className="entry-dialog help-dialog" onEscapeKeyDown={menuEscape}><DialogHeader><DialogTitle>Help</DialogTitle><DialogDescription className="sr-only">Short clips showing how to use Casebook Studio</DialogDescription></DialogHeader><div className="help-tabs">{tutorials.map((t,i)=><button key={t.src} aria-pressed={i===helpClip} className={'chip'+(i===helpClip?' on':'')} onClick={()=>setHelpClip(i)}>{t.title}</button>)}</div><Clip key={tutorials[helpClip].src} src={tutorials[helpClip].src} label={tutorials[helpClip].steps}/><p className="sr-only">{tutorials[helpClip].steps}</p><p className="shortcuts"><span><kbd>L</kbd> Log session</span><span><kbd>N</kbd> New case</span><span><kbd>/</kbd> Search</span><span><kbd>?</kbd> Help</span><span>Click <Clock size={13} aria-label="the clock"/> on a case to log a session</span></p></DialogContent></Dialog>
 {KimaiReview()}
 </SidebarProvider>;

 // Render helpers below are called as functions, not used as <Components/>: defining components inside Studio
 // would remount them on every render (scroll, focus and typed text lost).
 function KimaiBar(){
  const st=kstatus,parts=st&&!st.offline?[st.new?.length&&`${st.new.length} new`,st.to_send?.length&&`${st.to_send.length} to send`,st.conflicts?.length&&<span className="warn-text">{st.conflicts.length} changed on both sides</span>,st.missing?.length&&`${st.missing.length} removed`].filter(Boolean):[];
  const ago=st?.synced?Math.max(0,Math.round((Date.now()-Date.parse(st.synced))/60000)):null;
  return <div className="kimai-bar" aria-live="polite"><Clock size={15}/><span>{!st||(ksyncing&&!st.synced)?<>Checking Kimai…</>:st.offline?<>{/reachable/.test(st.offline)?'Kimai offline':st.offline}</>:parts.length?<>Kimai · {parts.map((x:any,i:number)=><span key={i}>{i?' · ':''}{x}</span>)}</>:<>Kimai up to date</>}</span>{ago!==null&&<span className="muted">{ago<1?'just now':ago<60?`${ago} min ago`:`${Math.round(ago/60)} h ago`}</span>}<button className="icon-btn" aria-label="Sync with Kimai" title="Sync" onClick={()=>kimaiSync()} disabled={ksyncing}><RefreshCw size={14} className={ksyncing&&kstatus?'spin':''}/></button>{parts.length>0&&<button className="text-btn" onClick={()=>setKimaiView('review')}>Review</button>}{st?.offline&&<span className="muted" title={st.offline}>Using your last sync</span>}{st?.offline&&!/reachable/.test(st.offline)&&<button className="text-btn" onClick={()=>setKimaiView('connect')}>Connect again</button>}</div>;
 }
 // Proof upload limits. Totals count everything stored in a casebook, not one upload.
 function LimitsDialog(){
  const [draft,setDraft]=useState<any>(lim),[err,setErr]=useState(''),[busyL,setBusyL]=useState(false);
  useEffect(()=>{if(limOpen){setDraft(lim);setErr('');}},[limOpen]);
  async function saveLimits(){setBusyL(true);setErr('');try{const r=await send('settings/limits',draft,'PUT');setLim(r);setLimOpen(false);toast.success('Upload limits saved.');}catch(e){setErr((e as Error).message);}finally{setBusyL(false);}}
  const row=(k:string,label:string,unit:string)=><Field key={k} label={label}><div className="hours-input"><Input type="number" min={1} max={lim.max?.[k]} value={draft[k]??''} onChange={e=>setDraft((d:any)=>({...d,[k]:e.target.value}))} aria-label={label}/><span className="muted" aria-hidden="true">{unit}</span></div></Field>;
  return <Dialog open={limOpen} onOpenChange={setLimOpen}><DialogContent onCloseAutoFocus={returnFocus} className="entry-dialog limits-dialog" onEscapeKeyDown={menuEscape}><DialogHeader><DialogTitle>Upload limits</DialogTitle><DialogDescription>Per casebook. Totals count every proof file stored, not one upload.</DialogDescription></DialogHeader>
   {err&&<div className="form-error" role="alert">{err}</div>}
   <div className="form-row" style={{gridTemplateColumns:'repeat(3,minmax(0,1fr))'}}>{row('fileMb','Largest file','MB')}{row('totalMb','All proof files','MB')}{row('files','Number of files','files')}</div>
   <div className="dialog-actions"><Button variant="ghost" onClick={()=>setLimOpen(false)}>Cancel</Button><Button className="primary-button" onClick={saveLimits} disabled={busyL}>Save</Button></div></DialogContent></Dialog>;
 }
 function KimaiConnect(){
  const [url,setUrl]=useState(kimai?.url??'https://clock.ioshield.io'),[token,setToken]=useState(''),[busyK,setBusyK]=useState(false),[err,setErr]=useState('');
  useEffect(()=>{if(kimaiView==='connect'){setUrl(kimai?.url??'https://clock.ioshield.io');setToken('');setErr('');}},[kimaiView]);
  async function connect(){setBusyK(true);setErr('');try{const k=await send('kimai',{url,token},'PUT');setKimai(k);toast.success(`Connected to Kimai as ${k.user}.`);}catch(e){setErr((e as Error).message);}finally{setBusyK(false);}}
  async function disconnect(){try{const k=await send('kimai/disconnect',{});setKimai({...kimai!,...k,user:null});setKstatus(null);}catch(e){toast.error((e as Error).message);}}
  const mapped=cases.filter(r=>!isParent(r));
  return <Dialog open={kimaiView==='connect'} onOpenChange={o=>!o&&setKimaiView('')}><DialogContent onCloseAutoFocus={returnFocus} className="entry-dialog" onOpenAutoFocus={e=>e.preventDefault()} onEscapeKeyDown={menuEscape}><DialogHeader><DialogTitle>Kimai</DialogTitle><DialogDescription>{kimai?.connected?`Connected as ${kimai.user}`:'Not connected. Connecting lets you import Kimai entries as sessions and add sessions to Kimai.'}</DialogDescription></DialogHeader><div className="entry-scroll">
   {err&&<div className="form-error" role="alert">{err}</div>}
   <div className="form-rows"><div className="form-row" style={{gridTemplateColumns:'1fr 1fr'}}><Field label="Kimai address"><Input value={url} onChange={e=>setUrl(e.target.value)}/></Field><Field label="API token"><Input type="password" autoComplete="off" placeholder={kimai?.connected?'Leave blank to keep the saved token':''} value={token} onChange={e=>setToken(e.target.value)}/></Field></div></div>
   <details className="more tutorial"><summary>How to get an API token</summary><Clip src="/tutorials/kimai-api-token.mp4" label="In Kimai, open your profile menu, choose API access, create a token, and copy it."/></details>
   {kimai?.connected&&kcatalog&&mapped.length>0&&<details className="more" open><summary>Cases and Kimai activities <span className="muted">Changes here save right away</span></summary><div className="list">{mapped.map(c=>{const m=kmapFor(c.values.A);return <div key={c.row} className="map-row"><span className="mono">{c.values.A}</span><span className="case-name">{c.values.C}</span><Choice label={`Kimai activity for ${c.values.A}`} value={m?`${m.project}:${m.activity}`:'none'} onChange={async v=>{try{const [project,activity]=v==='none'?[null,null]:v.split(':').map(Number);await send(`books/${book!.id}/kimai/map`,{case_id:c.values.A,project,activity},'PUT');await kimaiSync(true);}catch(e){toast.error((e as Error).message);}}} options={[['none','Not linked'],...kOptions]}/></div>;})}</div></details>}
  </div><div className="dialog-actions">{kimai?.connected&&<ConfirmButton className="ghost-left" label="Disconnect" confirmLabel="Disconnect and forget the token?" onConfirm={disconnect}/>}<Button className="primary-button" onClick={connect} disabled={busyK||!!kimai?.connected&&!token&&url===kimai.url}>{busyK?'Checking…':kimai?.connected?'Save connection':'Connect'}</Button></div></DialogContent></Dialog>;
 }
 function KimaiReview(){
  const st=kstatus??{},caseName=(id:string)=>findCase(id)?.values.C??id;
  const fmt=(e:any)=>`${e.date} · ${e.start}–${e.end}${e.end<=e.start?' (next day)':''}`;
  const show=(k:string,v:any)=>k==='project'?kcatalog?.projects.find(p=>p.id===v)?.name??v:k==='activity'?kcatalog?.activities.find(a=>a.id===v)?.name??v:v;
  const bad=(e:any)=>!e.match_session&&(+e.hours<=0||+e.hours>24);
  const pick=(e:any)=>e.id in kpick?kpick[e.id]:e.suggested_case??'';
  const caseOpts:Option[]=(st.cases??[]).map((c:any)=>[c.id,c.name,c.id]);
  return <Dialog open={kimaiView==='review'} onOpenChange={o=>!o&&setKimaiView('')}><DialogContent onCloseAutoFocus={returnFocus} className="entry-dialog review-dialog" onEscapeKeyDown={menuEscape}><DialogHeader><DialogTitle>Kimai review</DialogTitle><DialogDescription className="sr-only">New Kimai entries to import, sessions to add to Kimai, and changes on both sides.</DialogDescription></DialogHeader><div className="entry-scroll">
   {st.new?.length>0&&(()=>{
    const groups=Object.entries(st.new.reduce((g:Record<string,any[]>,e:any)=>{const k=e.match_session?'__match':e.suggested_case||'__none';(g[k]??=[]).push(e);return g;},{})) as [string,any[]][];
    const sel=st.new.filter((e:any)=>kSel[e.id]),ready=(list:any[])=>list.every((e:any)=>e.match_session||pick(e)&&!bad(e));
    const items=(list:any[])=>list.map((e:any)=>({kimai_id:e.id,case_id:pick(e),link_session:e.match_session??undefined}));
    return <section className="group"><div className="group-head"><h2>New in Kimai</h2><span className="muted">{st.new.length}</span></div>
     {groups.map(([k,list])=><div key={k} className="review-group"><div className="review-group-head"><label className="check"><Checkbox checked={list.every((e:any)=>kSel[e.id])?true:list.some((e:any)=>kSel[e.id])?'indeterminate':false} onCheckedChange={v=>setKSel(p=>({...p,...Object.fromEntries(list.map((e:any)=>[e.id,v===true]))}))}/>{k==='__match'?'Already logged here':k==='__none'?'Pick a case':caseName(k)}</label><span className="muted">{list.length} · {fmtH(list.reduce((n:number,e:any)=>n+ +e.hours,0))}</span></div>
      <div className="list">{list.map((e:any)=><div key={e.id} className="review-row selectable"><Checkbox aria-label={`Select ${e.description||e.activityName}, ${fmt(e)}`} checked={!!kSel[e.id]} onCheckedChange={v=>setKSel(p=>({...p,[e.id]:v===true}))}/><div><strong>{e.description||<span className="muted">No description</span>}</strong><span className="muted">{fmt(e)} · {fmtH(e.hours)} · {e.activityName}</span></div>{k==='__match'?<span className="muted">Same as {e.match_session}</span>:bad(e)?<span className="warn-text">{+e.hours>24?'Over 24 hours':'No time'}. Fix it in Kimai.</span>:k==='__none'||kEdit[e.id]?<Choice label="Case" value={pick(e)} onChange={v=>setKpick(p=>({...p,[e.id]:v}))} options={caseOpts}/>:<button type="button" className="text-btn" onClick={()=>setKEdit(p=>({...p,[e.id]:true}))}>Change case</button>}</div>)}</div></div>)}
     <div className="sticky-bar">{(()=>{const base=sel.length?sel:st.new,target=base.filter((e:any)=>e.match_session||pick(e)&&!bad(e)),missing=base.length-target.length;return <><span className="muted">{missing?`${missing} skipped (no case, or hours not between 0 and 24)`:'Imports add sessions here. Kimai is not changed.'}</span><ConfirmButton variant="outline" className="primary-confirm" label={sel.length?`Import ${target.length} selected`:`Import all ${target.length}`} confirmLabel={`Import ${target.length} as sessions?`} disabled={!target.length} onConfirm={()=>{kimaiImport(items(target));setKSel({});setKEdit({});}}/></>;})()}</div>
    </section>;})()}
   {st.to_send?.length>0&&<section className="group"><div className="group-head"><h2>Not in Kimai yet</h2><span className="muted">{st.to_send.length}</span><ConfirmButton variant="outline" className="head-action" label={`Add all ${st.to_send.length} to Kimai`} confirmLabel={`Add ${st.to_send.length} to Kimai?`} onConfirm={()=>kimaiSend(st.to_send.map((x:any)=>x.session_id))}/></div><div className="list">{st.to_send.map((x:any)=><div key={x.session_id} className="review-row"><div><strong>{x.description}</strong><span className="muted">{fmt(x)} · {caseName(x.case_id)}</span></div><span/><Button size="sm" variant="outline" onClick={()=>kimaiSend([x.session_id])}>Add to Kimai</Button></div>)}</div></section>}
   {st.conflicts?.length>0&&<section className="group"><div className="group-head"><h2>Changed on both sides</h2></div><div className="list">{st.conflicts.map((c:any)=>{const diff=(['date','start','end','description','project','activity'] as const).filter(k=>c.app[k]!==c.kimai[k]);return <div key={c.session_id} className="review-row conflict"><div><strong>{c.session_id}</strong>{diff.map(k=><span key={k} className="diff"><span className="muted">{k[0].toUpperCase()+k.slice(1)}</span> here <b>{show(k,c.app[k])||'empty'}</b>, Kimai <b>{show(k,c.kimai[k])||'empty'}</b></span>)}</div><ConfirmButton variant="outline" label="Keep casebook" confirmLabel="Replace the Kimai entry?" onConfirm={()=>kimaiAct('resolve',{session_id:c.session_id,keep:'app'})}/><ConfirmButton variant="outline" label="Keep Kimai" confirmLabel="Replace this session?" onConfirm={()=>kimaiAct('resolve',{session_id:c.session_id,keep:'kimai'})}/></div>;})}</div></section>}
   {st.missing?.length>0&&<section className="group"><div className="group-head"><h2>Removed</h2></div><div className="list">{st.missing.map((m:any)=><div key={m.session_id} className="review-row"><div><strong>{m.session_id}</strong><span className="muted">{m.reason==='kimai'?'Deleted in Kimai':'Not in this casebook'}</span></div><span/><Button size="sm" variant="outline" onClick={()=>kimaiAct('resolve',{session_id:m.session_id,keep:'unlink'})}>Unlink</Button></div>)}</div></section>}
   {!st.new?.length&&!st.to_send?.length&&!st.conflicts?.length&&!st.missing?.length&&<div className="empty"><p>Everything matches Kimai.</p></div>}
  </div></DialogContent></Dialog>;
 }
 function CaseView(){
  const c=current!,id=c.values.A,mySessions=sessions.filter(r=>r.values.C===id).sort((a,b)=>(excelDate(a.values.B)+clockTime(a.values.J)).localeCompare(excelDate(b.values.B)+clockTime(b.values.J))),myProof=proof.filter(r=>r.values.B===id),myClaims=claims.filter(r=>r.values.B===id),myStories=stories.filter(r=>r.values.B===id),parent=parentOf(c);
  return <>
   <div className="case-head"><div><div className="title-row"><h1>{c.values.C}</h1>{status(c.values.L)}</div><p className="meta-line"><span className="mono">{id}</span>{[parent?.values.C,c.values.D,c.values.E,domainLabel(c.values.H??''),c.values.K].filter(Boolean).join(' · ')}</p></div><button className="icon-btn" aria-label="Edit case" title="Edit case" onClick={()=>start(CASES,c)}><Pencil size={15}/></button></div>
   {c.values.X&&<p className="case-summary">{c.values.X}</p>}
   <Section title="Sessions" count={mySessions.length} extra={fmtH(caseHours(id))} add={()=>start(SESSIONS,undefined,id)} addLabel="Log session">
    {mySessions.map(r=><button key={r.row} className={"case-row"+(landed===r.values.A?" landed":"")} onClick={()=>start(SESSIONS,r)}><span className="muted num">{excelDate(r.values.B)}</span><span className="case-name">{r.values.D}</span><span className="muted num">{clockTime(r.values.J)&&clockTime(r.values.K)?`${clockTime(r.values.J)}–${clockTime(r.values.K)}`:''}</span><span className="muted num">{r.values.L?fmtH(r.values.L):''}</span><span className="row-marks">{kstatus?.linked?.includes(r.values.A)&&<Link2 size={14} aria-label="In Kimai"><title>In Kimai</title></Link2>}<span className={'badge tclass '+r.values.I}>{r.values.I}</span></span></button>)}
   </Section>
   <Section title="Proof" count={myProof.length} add={()=>start(PROOF,undefined,id)} addLabel="Add proof">
    {myProof.map(r=>{const f=fileFor(r.values.F);return <div key={r.row} className={"case-row"+(landed===r.values.A?" landed":"")}><span className="mono">{r.values.A}</span><button className="case-name link" onClick={()=>start(PROOF,r)}>{r.values.E}</button><span className="muted">{r.values.D}</span>{f?<a className="text-btn" href={'/api/files/'+f.id}><Download size={14}/>{f.name}</a>:<span className="muted truncate">{r.values.F}</span>}</div>;})}
   </Section>
   <Section title="Skills" count={myClaims.length} add={()=>start(CLAIMS,undefined,id)} addLabel="Claim skill">
    {myClaims.map(r=><button key={r.row} className={"case-row"+(landed===r.values.A?" landed":"")} onClick={()=>start(CLAIMS,r)}><span className="mono">{r.values.E}</span><span className="case-name">{r.values.F}</span><span className="muted" title="Work level">{levels[+r.values.J]?.slice(4)??''}</span>{r.values.K?<span className={'badge'+tone(r.values.K)} title="Result">{r.values.K}</span>:<span/>}{rowStatus(r.values.N)}</button>)}
   </Section>
   <Section title="Portfolio" count={myStories.length} add={()=>start(PORTFOLIO,undefined,id)} addLabel="Write story">
    {myStories.map(r=><div key={r.row} className={"case-row"+(landed===r.values.A?" landed":"")}><span className="mono">{r.values.A}</span><button className="case-name link" onClick={()=>start(PORTFOLIO,r)}>{r.values.D}</button>{rowStatus(r.values.J)}<button className="text-btn" onClick={()=>{setPortfolio(r);setPublicCheck(false);}}>Preview</button></div>)}
   </Section>
  </>;
 }
}
// Built-in tutorial clips, recorded by the scripts in source/tutorials/. Silent looping MP4s, shown like GIFs.
const tutorials=[
 {title:'Log a session',src:'/tutorials/log-session.mp4',steps:'Click the clock on a case. Say what you worked on, set start and end times, and save.'},
 {title:'Connect Kimai',src:'/tutorials/connect-kimai.mp4',steps:'Open the menu at the top right, choose Connect Kimai, enter the Kimai address and your API token, and connect.'},
 {title:'Import from Kimai',src:'/tutorials/import-kimai.mp4',steps:'On Cases, click Review next to Kimai. Pick the case for an entry and import it as a session.'},
 {title:'Get a Kimai API token',src:'/tutorials/kimai-api-token.mp4',steps:'In Kimai, open your profile menu, choose API access, create a token, and copy it.'},
];
function Clip({src,label}:{src:string,label:string}){
 const ref=useRef<HTMLVideoElement>(null),[missing,setMissing]=useState(false),still=typeof matchMedia!=='undefined'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
 useEffect(()=>{if(!still)ref.current?.play().catch(()=>{});},[src]);
 const [paused,setPaused]=useState(still);
 if(missing)return null;
 const toggle=()=>{const v=ref.current;if(!v)return;if(v.paused)v.play().catch(()=>{});else v.pause();};
 return <div className="clip-wrap"><video ref={ref} className="clip" src={src} aria-label={label} muted playsInline loop autoPlay={!still} controls={still} preload="metadata" onPlay={()=>setPaused(false)} onPause={()=>setPaused(true)} onClick={toggle} onError={()=>setMissing(true)}/>{!still&&<button type="button" className="clip-toggle" onClick={toggle} aria-label={paused?'Play clip':'Pause clip'}>{paused?<Play size={15}/>:<Pause size={15}/>}</button>}</div>;
}
function SuggestInput({value,onChange,options,label}:{value:string,onChange:(v:string)=>void,options:string[],label:string}){
 const [open,setOpen]=useState(false),[active,setActive]=useState(-1),id=useRef('s'+Math.random().toString(36).slice(2,8)).current;
 const list=[...new Set(options.map(o=>o.replace(/\s*\n+\s*/g,', ').trim()).filter(Boolean))].filter(o=>o!==value&&o.toLowerCase().includes(value.toLowerCase())).slice(0,8),shown=open&&list.length>0;
 const pick=(o:string)=>{onChange(o);setOpen(false);setActive(-1);};
 // Up/Down move through suggestions, Enter picks one; Escape is handled by the dialog (menuEscape blurs).
 const onKey=(e:React.KeyboardEvent)=>{if(!list.length)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(a=>{const n=list.length;return e.key==='ArrowDown'?(a+1)%n:(a<=0?n-1:a-1);});}else if(e.key==='Enter'&&shown&&active>=0){e.preventDefault();pick(list[active]);}};
 return <div className="suggest"><Input aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={id} aria-activedescendant={shown&&active>=0?`${id}-${active}`:undefined} value={value} onChange={e=>{onChange(e.target.value);setOpen(true);setActive(-1);}} onKeyDown={onKey} onFocus={()=>setOpen(true)} onBlur={()=>setTimeout(()=>{setOpen(false);setActive(-1);},120)}/>{shown&&<div className="suggest-list" role="listbox" id={id} aria-label={label}>{list.map((o,i)=><button type="button" tabIndex={-1} role="option" id={`${id}-${i}`} aria-selected={i===active} className={i===active?'active':''} key={o} onMouseDown={e=>{e.preventDefault();pick(o);}}>{o}</button>)}</div>}</div>;
}
// Two-step button for actions that can't be taken back: the first click asks, the second does it.
function ConfirmButton({label,confirmLabel,onConfirm,disabled,className='',variant='ghost',ariaLabel,title}:{label:React.ReactNode,confirmLabel:string,onConfirm:()=>void,disabled?:boolean,className?:string,variant?:'ghost'|'outline',ariaLabel?:string,title?:string}){
 const [armed,setArmed]=useState(false);
 useEffect(()=>{if(!armed)return;const t=setTimeout(()=>setArmed(false),4000);return()=>clearTimeout(t);},[armed]);
 return <Button type="button" size="sm" variant={variant} className={className+(armed?' armed':'')} disabled={disabled} title={title} aria-label={armed?confirmLabel:ariaLabel} aria-live="polite" onClick={()=>{if(armed){setArmed(false);onConfirm();}else setArmed(true);}}>{armed?confirmLabel:label}</Button>;
}
function TipButton({label,tip}:{label:string,tip:string}){const [open,setOpenRaw]=useState(false),close=useRef(()=>setOpenRaw(false)).current,setOpen=(o:boolean)=>{setOpenRaw(o);trackMenu(o,close);};
 return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><button type="button" className="tip-btn" aria-label={`What ${label} means`}>?</button></PopoverTrigger><PopoverContent side="top" className="tip-pop">{tip}</PopoverContent></Popover>;}
function Section({title,count,extra,add,addLabel,children}:{title:string,count:number,extra?:string,add:()=>void,addLabel:string,children:React.ReactNode}){return <section className="group"><div className="group-head"><h2>{title}</h2><span className="muted">{count||''}{extra&&count?` · ${extra}`:''}</span><button className="text-btn" onClick={add}><Plus size={14}/>{addLabel}</button></div>{count>0&&<div className="list">{children}</div>}</section>;}
function Field({label,required=false,wide=false,group=false,error,children}:{label:string,required?:boolean,wide?:boolean,group?:boolean,error?:string,children:React.ReactNode}){
 // With a definition, the "?" button must sit outside the <label>, or its text joins the field's accessible name.
 // Every control passes its own aria-label, so a plain wrapper is fine then.
 const tip=fieldTips[label],Tag=group||tip?'div':'label',ref=useRef<HTMLElement>(null),errId=useId();
 useEffect(()=>{ref.current?.querySelectorAll<HTMLElement>('input,textarea,[role=combobox]').forEach(el=>{if(error){el.setAttribute('aria-describedby',errId);el.setAttribute('aria-invalid','true');}else if(el.getAttribute('aria-describedby')===errId)el.removeAttribute('aria-describedby');});},[error]);
 // Controls carry their own aria-label, so mark them required directly for screen readers.
 useEffect(()=>{if(!required)return;ref.current?.querySelectorAll<HTMLInputElement>('input,textarea,[role=combobox]').forEach(el=>{el.setAttribute('aria-required','true');if(!isEmpty(el))el.removeAttribute('aria-invalid');});});
 const text=<>{label}{required&&<><b aria-hidden="true"> *</b><span className="sr-only"> (required)</span></>}</>;
 return <Tag ref={ref as any} className={'field '+(wide?'wide':'')}>{tip?<span className="field-label"><span>{text}</span><TipButton label={label} tip={tip}/></span>:<span>{text}</span>}{children}{error&&<span id={errId} className="field-error">{error}</span>}</Tag>;
}

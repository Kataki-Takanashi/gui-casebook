import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import schema from './schema.sql';
export const appRoot=path.dirname(fileURLToPath(import.meta.url));
export const dataRoot=path.resolve(process.env.CASEBOOK_DATA_DIR||path.join(appRoot,'data'));
fs.mkdirSync(path.join(dataRoot,'objects'),{recursive:true});
const database=new DatabaseSync(path.join(dataRoot,'casebooks.sqlite'));
database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
const version=database.prepare('PRAGMA user_version').get().user_version;
if(version===0){database.exec('BEGIN');try{database.exec(schema.replaceAll('--> statement-breakpoint',''));database.exec('PRAGMA user_version=1; COMMIT;');}catch(e){database.exec('ROLLBACK');throw e;}}
// v2: Kimai settings, case-to-project mapping, and session links for two-way sync.
if(version<2){database.exec('BEGIN');try{database.exec(`
CREATE TABLE IF NOT EXISTS app_settings (key text PRIMARY KEY NOT NULL, value text NOT NULL);
CREATE TABLE IF NOT EXISTS kimai_case_map (book_id text NOT NULL, case_id text NOT NULL, project integer NOT NULL, activity integer NOT NULL, PRIMARY KEY (book_id, case_id));
CREATE TABLE IF NOT EXISTS kimai_links (book_id text NOT NULL, session_id text NOT NULL, kimai_id integer NOT NULL, synced text NOT NULL, PRIMARY KEY (book_id, session_id));
CREATE UNIQUE INDEX IF NOT EXISTS idx_kimai_links_entry ON kimai_links (book_id, kimai_id);
PRAGMA user_version=2;`);database.exec('COMMIT');}catch(e){database.exec('ROLLBACK');throw e;}}
if(version>2)throw Error('This data folder needs a newer Casebook Studio release.');
const prepared=(sql,values=[])=>({bind(...v){return prepared(sql,v);},async run(){const r=database.prepare(sql).run(...values);return {meta:{changes:Number(r.changes)}};},async first(){return database.prepare(sql).get(...values)??null;},async all(){return {results:database.prepare(sql).all(...values)};}});
const objectPath=key=>{if(!/^[A-Za-z0-9_./-]+$/.test(key)||key.split('/').includes('..'))throw Error('Invalid file key.');return path.join(dataRoot,'objects',...key.split('/'));};
export const env={DB:{prepare:prepared,async batch(statements){database.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());database.exec('COMMIT');return result;}catch(e){database.exec('ROLLBACK');throw e;}}},BUCKET:{async delete(key){fs.rmSync(objectPath(key),{force:true});},async put(key,bytes){const filename=objectPath(key);fs.mkdirSync(path.dirname(filename),{recursive:true});const temp=filename+'.'+crypto.randomUUID()+'.tmp';fs.writeFileSync(temp,new Uint8Array(bytes));fs.renameSync(temp,filename);},async get(key){const filename=objectPath(key);if(!fs.existsSync(filename))return null;const bytes=fs.readFileSync(filename);return {body:bytes,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};}}};
export function closeStorage(){database.close();}
// Backups: one folder per day under data/backups, with a consistent copy of the database and the proof files
// (hard links, so they take almost no extra space). The newest 14 are kept.
const backupRoot=path.join(dataRoot,'backups'),KEEP=14;
const today=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;};
function linkTree(from,to){if(!fs.existsSync(from))return;fs.mkdirSync(to,{recursive:true});for(const e of fs.readdirSync(from,{withFileTypes:true})){const a=path.join(from,e.name),b=path.join(to,e.name);if(e.isDirectory())linkTree(a,b);else if(!e.name.endsWith('.tmp')&&!fs.existsSync(b)){try{fs.linkSync(a,b);}catch{fs.copyFileSync(a,b);}}}}
export function listBackups(){if(!fs.existsSync(backupRoot))return [];return fs.readdirSync(backupRoot).filter(n=>/^\d{4}-\d{2}-\d{2}$/.test(n)&&fs.existsSync(path.join(backupRoot,n,'casebooks.sqlite'))).sort().reverse();}
export function backup(force=false){
 const name=today(),dir=path.join(backupRoot,name),db=path.join(dir,'casebooks.sqlite');
 if(fs.existsSync(db)&&!force)return name;
 fs.mkdirSync(dir,{recursive:true});const temp=db+'.tmp';fs.rmSync(temp,{force:true});
 database.exec(`VACUUM INTO '${temp.replaceAll("'","''")}'`);fs.renameSync(temp,db);
 linkTree(path.join(dataRoot,'objects'),path.join(dir,'objects'));
 for(const old of listBackups().slice(KEEP))fs.rmSync(path.join(backupRoot,old),{recursive:true,force:true});
 return name;
}

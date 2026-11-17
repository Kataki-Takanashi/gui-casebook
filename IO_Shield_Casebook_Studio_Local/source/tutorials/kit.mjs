// Shared helpers for recording the built-in tutorial clips with Playwright + your installed Chrome.
// Each clip is a small script in this folder. Run one with:  node tutorials/<clip>.mjs
// Output: web/public/tutorials/<name>.mp4 (copied into the app on the next build).
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright-core';

export const VIEWPORT={width:1280,height:800};
export const OUT_DIR=path.resolve('web/public/tutorials');
const MAX_SECONDS=12;

// Opens Chrome with video recording. profileDir keeps a login between runs (used for Kimai).
export async function start({profileDir,headless=true}={}){
 const videoDir=fs.mkdtempSync(path.join(os.tmpdir(),'casebook-clip-'));
 const opts={channel:'chrome',headless,viewport:VIEWPORT,deviceScaleFactor:1,recordVideo:{dir:videoDir,size:VIEWPORT}};
 const context=profileDir?await chromium.launchPersistentContext(profileDir,opts):await (await chromium.launch({channel:'chrome',headless})).newContext(opts);
 const page=context.pages()[0]??await context.newPage();
 return {context,page,videoDir};
}

// A visible cursor and caption, since recordings don't show the real mouse.
const OVERLAY=`(()=>{if(document.getElementById('__rec_cursor__'))return;
 const c=document.createElement('div');c.id='__rec_cursor__';
 c.innerHTML='<svg width="22" height="22" viewBox="0 0 22 22"><path d="M3 2l15 9-7 1.5L7.5 19z" fill="#111" stroke="#fff" stroke-width="1.5"/></svg>';
 Object.assign(c.style,{position:'fixed',left:'640px',top:'420px',zIndex:2147483647,pointerEvents:'none',transition:'left .5s ease,top .5s ease,transform .12s'});
 const p=document.createElement('div');p.id='__rec_caption__';
 Object.assign(p.style,{position:'fixed',left:'50%',bottom:'28px',transform:'translateX(-50%)',zIndex:2147483647,pointerEvents:'none',background:'rgba(17,24,28,.88)',color:'#fff',font:'500 16px system-ui,-apple-system,sans-serif',padding:'9px 16px',borderRadius:'999px',opacity:'0',transition:'opacity .25s'});
 document.documentElement.append(c,p);})()`;
export async function overlay(page){await page.addInitScript(OVERLAY);await page.evaluate(OVERLAY).catch(()=>{});}
export const hold=(page,ms=700)=>page.waitForTimeout(ms);
export async function caption(page,text){
 if(/[–—]/.test(text))throw Error(`No dashes in captions: ${text}`);
 await page.evaluate(t=>{const p=document.getElementById('__rec_caption__');if(!p)return;p.textContent=t;p.style.opacity=t?'1':'0';},text);
}
export async function moveTo(page,locator){
 await locator.waitFor({state:'visible'});const b=await locator.boundingBox();
 await page.evaluate(([x,y])=>{const c=document.getElementById('__rec_cursor__');if(c){c.style.left=x+'px';c.style.top=y+'px';}},[b.x+b.width/2,b.y+b.height/2]);
 await page.waitForTimeout(550);
}
export async function click(page,locator){
 await moveTo(page,locator);
 await page.evaluate(()=>{const c=document.getElementById('__rec_cursor__');if(c){c.style.transform='scale(.8)';setTimeout(()=>c.style.transform='',150);}});
 await locator.click();await hold(page,500);
}
export async function type(page,locator,text){await click(page,locator);await locator.pressSequentially(text,{delay:45});await hold(page,400);}
// Blur anything that must never appear in a clip (tokens, emails). Applied before it renders.
export async function blur(page,selectors){await page.addStyleTag({content:`${selectors.join(',')}{filter:blur(7px)!important}`});}

// Stops recording, encodes MP4 (optionally cropped to a region for a zoomed-in look), checks length.
export async function finish({context,page,videoDir},name,{crop}={}){
 const video=page.video();await context.close();const webm=await video.path();
 fs.mkdirSync(OUT_DIR,{recursive:true});const out=path.join(OUT_DIR,name+'.mp4');
 const filters=[crop&&`crop=${crop.width}:${crop.height}:${crop.x}:${crop.y}`,crop&&`scale=${VIEWPORT.width}:-2:flags=lanczos`,'fps=12','format=yuv420p'].filter(Boolean).join(',');
 execFileSync('ffmpeg',['-y','-loglevel','error','-i',webm,'-vf',filters,'-c:v','libx264','-preset','slow','-crf','28','-movflags','+faststart','-an',out]);
 fs.rmSync(videoDir,{recursive:true,force:true});
 const seconds=+execFileSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',out]).toString();
 const kb=Math.round(fs.statSync(out).size/1024);
 console.log(`${path.relative(process.cwd(),out)}  ${seconds.toFixed(1)} s  ${kb} KB`);
 if(seconds>MAX_SECONDS)throw Error(`${name} is ${seconds.toFixed(1)} s, over the ${MAX_SECONDS} s limit. Trim pauses and record again.`);
 return out;
}

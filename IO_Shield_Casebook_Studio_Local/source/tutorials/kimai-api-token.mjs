// Clip: kimai-api-token. Runs against YOUR LIVE Kimai in a visible Chrome window.
// Usage: node tutorials/kimai-api-token.mjs [profile-folder] [kimai-url]
// 1. Chrome opens on the Kimai API access page. If Kimai asks for your password, type it yourself in that
//    window (the script never does). It waits up to 30 minutes.
// 2. It then records a second tab: start page, user menu, API access, Create, name, Save.
//    The new token, the tables, your name/title and any email are blurred before they ever render.
// 3. It deletes the token it created ("Casebook Studio tutorial") and prints the tokens that remain.
//    Other tokens are never touched.
import {start,overlay,blurOnLoad,caption,click,type,hold,finish} from './kit.mjs';

const profileDir=process.argv[2];
if(!profileDir)throw Error('Pass the profile folder you signed in with: node tutorials/kimai-api-token.mjs <profile-folder> [kimai-url]');
const BASE=(process.argv[3]||'https://clock.ioshield.io').replace(/\/+$/,'');
const TOKEN_NAME='Casebook Studio tutorial';

const BLUR=[
 // start page and dashboard: tables, widgets, cards (real client and project names)
 `html:not(:has(a.action-create[href*="access-token"])) .page-body{filter:blur(9px)!important}`,
 // any table (token list too), the new token and anything holding it
 `table,.codeblock,.codeblock *,pre,code{filter:blur(8px)!important}`,
 `input[type=password],input[type=email],a[href^="mailto:"]{filter:blur(8px)!important}`,
 // user name and job title in the top bar, and the user dropdown header
 `.nav-link:has(.avatar) .avatar~*,.nav-link:has(.avatar) .d-xl-block,.dropdown-header{filter:blur(6px)!important}`,
];

const unlockPrompt=page=>page.locator('input[name=_password]');
async function ensureUnlocked(page){
 await page.goto(`${BASE}/`);
 await page.waitForLoadState('domcontentloaded');
 const link=page.locator('a[href$="/api-token"]').first();
 if(await link.count()===0&&await unlockPrompt(page).count()===0)await page.waitForLoadState('networkidle');
 const href=await link.getAttribute('href').catch(()=>null);
 const apiUrl=href?new URL(href,BASE).href:null;
 if(apiUrl)await page.goto(apiUrl);
 await page.waitForLoadState('networkidle');
 if(await unlockPrompt(page).count()>0){
  console.log('Unlock Kimai in the Chrome window (type your password there). Waiting up to 30 minutes...');
  await unlockPrompt(page).waitFor({state:'detached',timeout:30*60*1000});
  await page.waitForLoadState('networkidle');
 }
 let found=apiUrl;
 if(!found){// The link only appears once unlocked and signed in, so look again now.
  await page.goto(`${BASE}/`);await page.waitForLoadState('networkidle');
  const h=await page.locator('a[href$="/api-token"]').first().getAttribute('href').catch(()=>null);
  found=h?new URL(h,BASE).href:null;
 }
 if(!found)throw Error('Could not find API access in the Kimai menu.');
 const apiUrl2=found;
 if(!/api-token/.test(page.url()))await page.goto(apiUrl2);
 if(await unlockPrompt(page).count()>0){
  console.log('Kimai wants the password once more for API access. Waiting...');
  await unlockPrompt(page).waitFor({state:'detached',timeout:30*60*1000});
  if(!/api-token/.test(page.url()))await page.goto(apiUrl2);
 }
 await page.locator('a.action-create[href*="access-token"]').waitFor({timeout:30000});
 return apiUrl2;
}

const rec=await start({profileDir,headless:false});
const {context}=rec;
let created=false,deleted=false,recorded=false,failure=null,pageB,apiPage;
try{
 const pageA=rec.page;
 apiPage=await ensureUnlocked(pageA);
 console.log('Unlocked. Recording...');

 // Page B: same session, clean video from here.
 const t0=Date.now();
 pageB=await context.newPage();
 await pageA.close();
 await blurOnLoad(pageB,BLUR);
 await overlay(pageB);
 // Start on the profile page, not the timesheet, so no hours or project names are ever on screen.
 await pageB.goto(apiPage.replace(/\/api-token\/?$/,''));
 const menu=pageB.locator('a[aria-label="Open personal menu"]:visible, .nav-item.dropdown:has(a[href$="/api-token"]) > .nav-link:visible').first();
 const hasMenu=await menu.waitFor({state:'visible',timeout:8000}).then(()=>true,()=>false);
 await pageB.waitForLoadState('networkidle');
 await overlay(pageB);
 const trim=Math.max(0,(Date.now()-t0)/1000-0.4);

 if(hasMenu){
  await caption(pageB,'Open your profile menu');
  await click(pageB,menu);
  await caption(pageB,'Choose API access');
  await click(pageB,pageB.locator('a.dropdown-item[href$="/api-token"]:visible').first());
 }else{
  // Menu hidden at this window size: go straight to the page and say where it lives.
  await caption(pageB,'Profile menu, then API access');
  await hold(pageB,900);
  await pageB.goto(apiPage);
 }
 const create=pageB.locator('a.action-create[href*="access-token"]');
 await create.waitFor();
 rec.apiAt=(Date.now()-t0)/1000;
 await overlay(pageB);
 await caption(pageB,'Create a token');
 await click(pageB,create);
 const modal=pageB.locator('.modal.show,.modal:visible').first();
 await modal.waitFor({state:'visible'});
 const nameField=modal.getByLabel(/name/i).first().or(modal.locator('input[type=text]').first());
 await caption(pageB,'Name it Casebook Studio');
 await type(pageB,nameField,TOKEN_NAME);
 created=true; // from the click below, a token may exist in Kimai
 await caption(pageB,'Save');
 await click(pageB,modal.getByRole('button',{name:/save/i}).or(modal.locator('button[type=submit]')).first());
 await pageB.locator('.codeblock').waitFor({state:'attached',timeout:20000});
 await caption(pageB,'Copy it into Casebook Studio');
 await hold(pageB,1500);
 recorded=true;
 rec.trim=trim;
}catch(e){failure=e;console.error('Recording step failed:',e.message);}

// Cleanup (always): remove the token we created, nothing else.
try{
 const page=await context.newPage();
 page.on('dialog',d=>d.accept().catch(()=>{}));
 if(pageB&&!pageB.isClosed())await pageB.close();
 const apiUrl=apiPage;if(!apiUrl)throw Error('Never reached the API access page, so no token was created.');
 await page.goto(apiUrl);
 await page.waitForLoadState('networkidle');
 if(await unlockPrompt(page).count()>0){
  console.log('Unlock Kimai again in the Chrome window to finish cleanup. Waiting up to 30 minutes...');
  await unlockPrompt(page).waitFor({state:'detached',timeout:30*60*1000});
  await page.goto(apiUrl);await page.waitForLoadState('networkidle');
 }
 const rows=()=>page.locator('table tbody tr').filter({has:page.locator('td:first-child',{hasText:new RegExp(`^\\s*${TOKEN_NAME}\\s*$`)})});
 for(let i=0;i<5&&await rows().count()>0;i++){
  await rows().first().locator('a.api-link, a[data-method="DELETE"]').first().click();
  const confirm=page.locator('.modal.show .btn-danger, .modal.show button:has-text("Yes"), .modal.show button:has-text("Confirm"), .modal.show button:has-text("OK")').first();
  await confirm.click({timeout:3000}).catch(()=>{});
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await page.goto(apiUrl);await page.waitForLoadState('networkidle');
 }
 const left=await page.locator('table tbody tr td:first-child').allInnerTexts();
 deleted=!left.some(n=>n.trim()===TOKEN_NAME);
 console.log(deleted?`CLEANUP OK: "${TOKEN_NAME}" is gone.`:`CLEANUP FAILED: "${TOKEN_NAME}" is STILL in the list. Delete it by hand.`);
 console.log('Remaining tokens:',left.map(n=>n.trim()).join(' | ')||'(none)');
}catch(e){
 console.error(`CLEANUP ERROR: ${e.message}`);
 if(created)console.error(`A test token named "${TOKEN_NAME}" MAY STILL EXIST. Check Kimai > profile menu > API access and delete it.`);
}

if(failure||!recorded){await context.close().catch(()=>{});process.exit(1);}
// Backup blur in the video itself: the start page until API access is open, the token box, and the name and title.
const trimmed=t=>Math.max(0,t-(rec.trim??0));
await finish({...rec,page:pageB},'kimai-api-token',{trim:rec.trim,blurRegions:[
 {x:300,y:515,width:920,height:75},
 {x:1190,y:6,width:90,height:42},
]});

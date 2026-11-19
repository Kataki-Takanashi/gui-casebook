// UI regression checks with real key presses in Chrome. Never saves anything.
// Usage: node test-ui.mjs [app-url]   (the app must already be running, with at least one case)
import {chromium} from 'playwright-core';
const BASE=process.argv[2]||'http://127.0.0.1:8765';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage();
const results=[];
const check=(name,ok,detail='')=>{results.push({name,ok});console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);};
const dialogOpen=()=>page.locator('[role=dialog]').count().then(n=>n>0);
const pageLocked=()=>page.evaluate(()=>document.body.style.pointerEvents==='none');
async function openLogSession(){await page.getByRole('button',{name:/^Log session/}).first().click();await page.locator('[role=dialog]').waitFor();}
try{
 await page.goto(BASE);await page.getByRole('heading',{name:'Cases'}).waitFor();

 // Escape on a dropdown closes only the dropdown, never the form, and never locks the page.
 await openLogSession();
 await page.getByRole('combobox',{name:'Time Class'}).click();await page.locator('[data-slot=select-content]').waitFor();
 await page.keyboard.press('Escape');await page.waitForTimeout(400);
 check('Escape on Time Class keeps the form open',await dialogOpen());
 check('Escape on Time Class closes the dropdown',await page.locator('[data-slot=select-content]').count()===0);

 // Same for the searchable Case picker.
 await page.getByRole('combobox',{name:'Case',exact:true}).click();await page.locator('[cmdk-root]').waitFor();
 await page.keyboard.press('Escape');await page.waitForTimeout(400);
 check('Escape on the Case picker keeps the form open',await dialogOpen());

 // Escape on an untouched form closes it and leaves the page usable.
 await page.keyboard.press('Escape');await page.waitForTimeout(500);
 check('Escape closes an untouched form',!(await dialogOpen()));
 check('Page is clickable after closing',!(await pageLocked()));

 // A typed draft is not thrown away without asking.
 await openLogSession();
 await page.getByLabel(/What I Worked On/).fill('draft that must not vanish');
 await page.keyboard.press('Escape');await page.waitForTimeout(400);
 check('Escape on a changed form asks first',await dialogOpen()&&await page.getByText('Discard your changes?').isVisible());
 await page.getByRole('button',{name:'Keep editing'}).click();
 check('Keep editing keeps the draft',await page.getByLabel(/What I Worked On/).inputValue()==='draft that must not vanish');
 await page.getByRole('button',{name:'Cancel'}).click();await page.getByRole('button',{name:'Discard'}).click();await page.waitForTimeout(500);
 check('Discard closes the form',!(await dialogOpen()));
 check('Page is clickable after discarding',!(await pageLocked()));
}catch(e){check('UI checks ran',false,e.message.split('\n')[0]);}
finally{await browser.close();}
const failed=results.filter(r=>!r.ok).length;
console.log(failed?`${failed} of ${results.length} checks failed`:`all ${results.length} checks passed`);
process.exit(failed?1:0);

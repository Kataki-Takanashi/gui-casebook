// UI regression checks with real key presses in Chrome. Never saves anything.
// Usage: node test-ui.mjs [app-url]   (the app must already be running, with at least one case)
import {chromium} from 'playwright-core';
const BASE=process.argv[2]||'http://127.0.0.1:8765';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage();
const results=[];
const check=(name,ok,detail='')=>{results.push({name,ok});console.log(`${ok?'PASS':'FAIL'}  ${name}${detail?'  '+detail:''}`);};
const dialogOpen=()=>page.locator('[role=dialog].entry-dialog').count().then(n=>n>0);
const pageLocked=()=>page.evaluate(()=>document.body.style.pointerEvents==='none');
async function openLogSession(){await page.getByRole('button',{name:/^Log session/}).first().click();await page.locator('[role=dialog].entry-dialog').waitFor();}
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
 // Fast Escape sequence: a dropdown, then a picker, in the same form.
 await page.getByRole('heading',{name:'Cases'}).waitFor();
 await page.locator('button.case-name').first().click();await page.getByRole('button',{name:'Add proof'}).click();await page.locator('[role=dialog].entry-dialog').waitFor();
 await page.getByRole('combobox',{name:'Proof Type'}).click();await page.locator('[data-slot=select-content]').waitFor();await page.keyboard.press('Escape');
 await page.getByRole('combobox',{name:'Case',exact:true}).click();await page.keyboard.press('Escape');await page.waitForTimeout(500);
 check('Fast Escapes keep the form open',await dialogOpen());
 // The form itself must still respond (the page behind a modal form is meant to ignore clicks).
 await page.getByRole('textbox',{name:'What It Shows'}).fill('still works',{timeout:3000}).then(()=>check('Form still responds after fast Escapes',true),()=>check('Form still responds after fast Escapes',false));
 await page.getByRole('button',{name:'Cancel'}).click({timeout:3000}).catch(()=>{});await page.waitForTimeout(400);
 if(await dialogOpen())await page.getByRole('button',{name:'Discard'}).click({timeout:3000}).catch(()=>{});
 await page.waitForTimeout(500);
 check('Page is clickable after closing that form',!(await dialogOpen())&&!(await pageLocked()));
 // Escape on a dropdown inside the Kimai dialog (if Kimai is connected) closes only the dropdown.
 const mapSelect=async()=>{await page.getByRole('button',{name:'Casebook menu'}).click();await page.locator('.menu-item').filter({hasText:'Kimai'}).click();await page.locator('[role=dialog].entry-dialog').waitFor();return page.getByRole('combobox',{name:/Kimai activity for/}).first();};
 const sel=await mapSelect();
 if(await sel.count()){await sel.click();await page.locator('[data-slot=select-content]').waitFor();await page.keyboard.press('Escape');await page.waitForTimeout(400);
  check('Escape in the Kimai dialog keeps it open',await dialogOpen());
  await page.keyboard.press('Escape');await page.waitForTimeout(500);
  check('Kimai dialog closes cleanly',!(await dialogOpen())&&!(await pageLocked()));}
 else{await page.keyboard.press('Escape');console.log('SKIP  Kimai dialog checks (Kimai not connected)');}
}catch(e){check('UI checks ran',false,e.message.split('\n')[0]);}
finally{await browser.close();}
const failed=results.filter(r=>!r.ok).length;
console.log(failed?`${failed} of ${results.length} checks failed`:`all ${results.length} checks passed`);
process.exit(failed?1:0);

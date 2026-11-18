// Opens a Chrome window on Kimai so you can sign in once. The login is kept in the profile folder
// given as the first argument, and the Kimai clip scripts reuse it. Delete that folder when done.
// Kimai asks for your password again before showing API access, so this also opens that page for you to unlock.
// Usage: node tutorials/kimai-login.mjs <profile-folder> [kimai-url]
import {chromium} from 'playwright-core';
const [profile,url='https://clock.ioshield.io']=process.argv.slice(2);
if(!profile)throw Error('Pass a profile folder outside the repo, e.g. ~/kimai-recording-profile');
const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,viewport:{width:1280,height:800}});
const page=context.pages()[0]??await context.newPage();
await page.goto(url);
console.log('Sign in to Kimai in the Chrome window if asked.');
await page.waitForURL(u=>!/\/login/.test(u.pathname),{timeout:30*60*1000});
const apiAccess=await page.locator('a[href$="/api-token"]').first().getAttribute('href');
if(apiAccess){
 await page.goto(new URL(apiAccess,url).href);
 console.log('If Kimai asks for your password to unlock API access, enter it in the window.');
 await page.locator('input[type=password]').first().waitFor({state:'detached',timeout:30*60*1000});
}
await page.waitForLoadState('networkidle');
console.log('Done. Login saved. The window closes now.');
await context.close();

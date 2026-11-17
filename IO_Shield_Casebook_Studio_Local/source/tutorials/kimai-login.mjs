// Opens a Chrome window on Kimai so you can sign in once. The login is kept in the profile folder
// given as the first argument, and the Kimai clip scripts reuse it. Delete that folder when done.
// Usage: node tutorials/kimai-login.mjs <profile-folder> [kimai-url]
import {chromium} from 'playwright-core';
const [profile,url='https://clock.ioshield.io']=process.argv.slice(2);
if(!profile)throw Error('Pass a profile folder outside the repo, e.g. ~/kimai-recording-profile');
const context=await chromium.launchPersistentContext(profile,{channel:'chrome',headless:false,viewport:{width:1280,height:800}});
const page=context.pages()[0]??await context.newPage();
await page.goto(url);
console.log('Sign in to Kimai in the Chrome window. It closes by itself once you are in.');
await page.waitForURL(u=>!/\/login/.test(u.pathname),{timeout:10*60*1000});
await page.waitForLoadState('networkidle');
console.log('Signed in. Login saved.');
await context.close();

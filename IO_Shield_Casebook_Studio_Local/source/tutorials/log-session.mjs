// Clip: log-session. Fake data only. Run: node tutorials/log-session.mjs
import {openRecording} from './rec-env.mjs';
import {caption,click,type,hold,moveTo,finish} from './kit.mjs';

const {rec,page,down}=await openRecording();
try{
 const row=page.locator('.case-row',{hasText:'Network Inventory'});
 await caption(page,'Hover a case, click the clock');
 await moveTo(page,row);
 await row.hover();
 await click(page,row.locator('.row-action'));
 const dialog=page.getByRole('dialog');
 await dialog.getByText('Log session').first().waitFor();
 await caption(page,'Say what you worked on');
 await type(page,dialog.getByLabel('What I Worked On'),'Labeled patch panel');
 await caption(page,'Set start and end times');
 const start=dialog.getByLabel('Start',{exact:true}),end=dialog.getByLabel('End',{exact:true});
 await click(page,start);await start.fill('18:00');
 await click(page,end);await end.fill('19:30');
 await caption(page,'Hours fill in. Save.');
 await dialog.getByLabel('Hours').waitFor();
 await page.waitForFunction(()=>[...document.querySelectorAll('[role=dialog] input')].some(i=>i.value==='1.5'||i.value==='1.50'));
 await hold(page,600);
 await click(page,dialog.getByRole('button',{name:'Save',exact:true}));
 await dialog.waitFor({state:'detached'});
 await caption(page,'It shows on the case');
 await click(page,page.getByText('Network Inventory',{exact:true}).first());
 await page.getByText('Labeled patch panel').waitFor();
 await hold(page,800);
}finally{await down();}
await finish(rec,'log-session');

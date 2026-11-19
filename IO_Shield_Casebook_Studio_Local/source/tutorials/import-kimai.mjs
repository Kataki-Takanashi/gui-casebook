// Clip: import-kimai. Fake Kimai only. Run: node tutorials/import-kimai.mjs
import {openRecording} from './rec-env.mjs';
import {caption,click,moveTo,hold,finish} from './kit.mjs';

const {rec,page,down}=await openRecording({connected:true});
try{
 const bar=page.locator('.kimai-bar');
 await bar.getByText(/Kimai · \d+ new/).waitFor();
 await caption(page,'New Kimai entries show here');
 await moveTo(page,bar);
 await hold(page,500);
 await caption(page,'Click Review');
 await click(page,bar.getByRole('button',{name:'Review'}));
 const dialog=page.locator('[role=dialog].entry-dialog').first();
 await dialog.getByText('New in Kimai').waitFor();
 await caption(page,'Tick an entry. Its case is already picked.');
 await hold(page,500);
 await click(page,dialog.getByRole('checkbox',{name:/Listed switches/}));
 await caption(page,'Import it');
 const importBtn=dialog.getByRole('button',{name:/^Import 1 selected/});
 await click(page,importBtn);
 await click(page,dialog.getByRole('button',{name:/as sessions\?/}));
 await caption(page,'It is now a session');
 await hold(page,500);
 await page.keyboard.press('Escape');
 await dialog.waitFor({state:'detached'});
 await click(page,page.getByText('Network Inventory',{exact:true}).first());
 await page.getByText('Listed switches and servers on the lab rack').waitFor();
 await hold(page,1500);
}finally{await down();}
await finish(rec,'import-kimai');

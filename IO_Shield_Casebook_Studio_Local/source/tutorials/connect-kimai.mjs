// Clip: connect-kimai. Fake Kimai only. Run: node tutorials/connect-kimai.mjs
import {openRecording,MOCK} from './rec-env.mjs';
import {caption,click,type,hold,blur,finish} from './kit.mjs';

const {rec,page,down}=await openRecording();
try{
 await caption(page,'Open the casebook menu');
 await click(page,page.locator('.book-menu'));
 await caption(page,'Choose Kimai');
 await click(page,page.getByRole('button',{name:'Kimai',exact:true}));
 const dialog=page.getByRole('dialog');
 await dialog.waitFor();
 await caption(page,'Enter your Kimai address');
 const address=dialog.getByLabel('Kimai address');
 await address.fill('');
 await type(page,address,MOCK);
 await caption(page,'Paste your API token');
 await blur(page,['input[type=password]']);
 await type(page,dialog.getByLabel('API token'),'example-token-1234');
 await caption(page,'Click Connect');
 await click(page,dialog.getByRole('button',{name:'Connect',exact:true}));
 await dialog.getByText('Connected as Analyst').waitFor();
 await caption(page,'Connected as Analyst');
 await hold(page,1200);
}finally{await down();}
await finish(rec,'connect-kimai');

import {chromium} from 'playwright';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
fs.mkdirSync('review/screenshots',{recursive:true});
const root=process.cwd();
const server=spawn(process.execPath,['src/serve.mjs'],{cwd:root,env:{...process.env,PORT:'18778',DESK_MODE:'mock'},stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.once('data',resolve);server.once('exit',c=>reject(new Error('server exit '+c)));});
const browser=await chromium.launch({...(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {}),headless:true,args:['--no-sandbox']});
const results=[];let errors=[];
try{
 const c=await browser.newContext();await c.route('**/*',async route=>{
 const u=new URL(route.request().url());
 if(u.hostname==='127.0.0.1'&&u.pathname==='/api/miner-history')return route.fulfill({json:{scores:[]}});
 if(u.hostname==='127.0.0.1')return route.continue();
 return route.abort();});
 const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:18778');
 await p.getByRole('link',{name:'Miner rank history'}).click();
 await p.waitForSelector('#observations tr');
 assert.equal(await p.locator('#observations tr').count(),25);
 assert.equal(await p.locator('#observations th').first().innerText(),'Nov 1');
 assert.equal(await p.locator('#observations th').last().innerText(),'Nov 25');
 assert.equal(await p.locator('#observations tr').first().locator('td[aria-label="No record"]').count(),6);
 assert.equal(await p.locator('#observations tr').last().locator('td').first().innerText(),'#5 \u00b7 0.4493');
 await p.setViewportSize({width:320,height:900});
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await p.locator('#ONCHAIN_METRIC_VERIFY_GENERAL summary').click();
 await p.waitForSelector('#ONCHAIN_METRIC_VERIFY_GENERAL table');
 assert.equal(await p.locator('#ONCHAIN_METRIC_VERIFY_GENERAL tbody tr').count(),84);
 assert.match(await p.locator('#ONCHAIN_METRIC_VERIFY_GENERAL tbody tr').last().innerText(),/55\u2020/);
 await p.getByRole('link',{name:'Assessment desk'}).click();
 await p.evaluate(()=>document.fonts.ready);
 results.push({test:'rank history opens and returns to assessment',pass:true});
 for(const w of [320,390,1280]){await p.setViewportSize({width:w,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:`${root}/review/screenshots/disconnected-${w}.png`,fullPage:true});results.push({test:'disconnected/no overflow',width:w,pass:true});}
 await p.setViewportSize({width:1280,height:900});await p.fill('#token','PEPE');await p.click('#run-button');await p.waitForSelector('#out .listings-memo');assert.match(await p.locator('#out').innerText(),/SIMULATED|Simulated|simulated/);await p.screenshot({path:`${root}/review/screenshots/offline-result-1280.png`,fullPage:true});results.push({test:'real local /memo path, offline result and honest labels',pass:true});
 await p.setViewportSize({width:390,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:`${root}/review/screenshots/offline-result-390.png`,fullPage:true});assert.equal(await p.locator('#out .listings-memo').count(),1);results.push({test:'mobile memo remains rendered without sidebar navigation',pass:true});
 await p.getByRole('tab',{name:/LIVE/}).click();
 for(const w of [320,390,1280]){await p.setViewportSize({width:w,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
 assert.equal(await p.locator('#run-live').isDisabled(),true);
 results.push({test:'live layout has no overflow and keeps disconnected payment disabled',pass:true});
 await p.getByRole('tab',{name:/Offline/}).click();
 await p.reload();await p.click('#wallet-connect');await p.waitForFunction(()=>document.querySelector('#wallet-status').innerText.includes('MetaMask'));results.push({test:'no-provider wallet error remains usable',pass:true});
 await p.route('**/memo?**',route=>route.fulfill({status:502,json:{error:'Fixture failure for local error-state test'}}));await p.fill('#token','PEPE');await p.click('#run-button');await p.waitForSelector('#out .request-error');await p.screenshot({path:`${root}/review/screenshots/offline-error-390.png`,fullPage:true});assert.equal(await p.isDisabled('#run-button'),false);results.push({test:'offline failure rendered and retry restored',pass:true});
 await c.close();
 // Fake provider only. No wallet, signatures or transactions reach any external service.
 const c2=await browser.newContext();await c2.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await c2.addInitScript(()=>{const listeners={};window.__calls=[];window.__rejectConnect=false;window.ethereum={isMetaMask:true,request:async q=>{window.__calls.push(q.method);if(q.method==='eth_accounts')return [];if(q.method==='eth_requestAccounts'){if(window.__rejectConnect)throw Object.assign(new Error('User rejected request'),{code:4001});return ['0x1111111111111111111111111111111111111111'];}if(q.method==='eth_chainId')return '0xaa36a7';throw Object.assign(new Error('Local fake provider rejected '+q.method),{code:4001});},on:(n,f)=>{listeners[n]=f}};window.__emit=(n,v)=>listeners[n]?.(v);});
 const q=await c2.newPage();q.on('pageerror',e=>errors.push(e.message));await q.goto('http://127.0.0.1:18778');await q.evaluate(()=>window.__rejectConnect=true);await q.click('#wallet-connect');await q.waitForFunction(()=>document.querySelector('#wallet-status').innerText.toLowerCase().includes('reject'));assert.equal(await q.isDisabled('#run-live'),true);results.push({test:'provider rejection keeps paid controls disabled',pass:true});
 await q.evaluate(()=>window.__rejectConnect=false);await q.click('#wallet-connect');await q.waitForFunction(()=>!document.querySelector('#run-live').disabled);assert.equal(await q.evaluate(()=>window.__calls.some(x=>['personal_sign','eth_sendTransaction'].includes(x))),false);await q.setViewportSize({width:390,height:844});await q.screenshot({path:`${root}/review/screenshots/connected-390.png`,fullPage:true});results.push({test:'fake connection enables actions without signing',pass:true});
 await q.evaluate(()=>window.__emit('chainChanged','0x1'));await q.waitForFunction(()=>document.querySelector('#run-live').disabled);await q.screenshot({path:`${root}/review/screenshots/wrong-network-390.png`,fullPage:true});results.push({test:'chain change disables paid controls',pass:true});
 await c2.close();assert.deepEqual(errors,[]);results.push({test:'no uncaught browser exceptions',pass:true});
 fs.writeFileSync(`${root}/review/browser-results.json`,JSON.stringify({scope:'Local real entrypoint, mocked providers/network only; miner report uses the supplied November snapshot.',results,errors},null,2));console.log(JSON.stringify(results,null,2));
}finally{await browser.close();server.kill();}

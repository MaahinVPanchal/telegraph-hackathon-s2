import {chromium} from 'playwright';
import {spawn} from 'node:child_process';import fs from 'node:fs';import assert from 'node:assert/strict';
fs.mkdirSync('review/screenshots',{recursive:true});
const root=process.cwd(),wallet='0x1111111111111111111111111111111111111111',intent='SANCTIONS_SCREENING_MATCH_GENERAL',diamond='0x3624eb012b5e998bb57b6be6c9cfc9c4bc5eb99b';
const server=spawn(process.execPath,['src/serve.mjs'],{cwd:root,env:{...process.env,PORT:'7788'},stdio:['ignore','pipe','pipe']});await new Promise(r=>server.stdout.once('data',r));
const browser=await chromium.launch({...(process.env.CHROME_BIN ? {executablePath:process.env.CHROME_BIN} : {}),headless:true,args:['--no-sandbox']});const results=[];
try{for(const scenario of ['valid','partial','unknown','malformed-challenge']){
 const c=await browser.newContext({viewport:{width:390,height:844}});let asks=0,authorized=0,unexpectedExternal=0;
 await c.addInitScript(({wallet})=>{let connected=false;window.__calls=[];const handlers={};window.ethereum={isMetaMask:true,on:(n,f)=>handlers[n]=f,request:async q=>{window.__calls.push(q.method);if(q.method==='eth_requestAccounts'){connected=true;return [wallet]}if(q.method==='eth_accounts')return connected?[wallet]:[];if(q.method==='eth_chainId')return '0xaa36a7';if(q.method==='personal_sign')return '0xdead';throw new Error('Unexpected fake provider request '+q.method)}};},{wallet});
 await c.route('**/*',async r=>{const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1'){if(u.pathname==='/api/miners')return r.fulfill({status:503,json:{error:'Fixture board unavailable'}});unexpectedExternal++;return r.abort()}
 if(u.pathname!=='/api/engine/v1/ask')return r.continue();asks++;const paid=r.request().headers()['x-payment'];const req=r.request().postDataJSON();
 if(!paid){const network=scenario==='malformed-challenge'?'eip155:1':'eip155:11155111';return r.fulfill({status:402,json:{accepts:[{scheme:'escrow',network,payTo:diamond,extra:{resource:'/v1/ask',signWith:'personal_sign (EIP-191)',message:['Telegraph Escrow Payment','Wallet: {from}',`Pay To: ${diamond}`,`Network: ${network}`,'Amount: 10000 uUSDC','Resource: /v1/ask','Nonce: {nonce}','Valid After: {validAfter}','Valid Before: {validBefore}'].join('\n')}}]}})}
 authorized++;if(scenario==='partial'&&req.params.name==='Treasury Fixture')return r.fulfill({status:502,json:{error:'Fixture second call failed'}});
 const receipt={receipt_hash:'0x'+'a'.repeat(64),rail:'escrow',payer:wallet,miner:'377',intent,amount_uusdc:'10000',epoch_id:2068,settlement:'epoch',chain:'telegraph',timestamp:1794450000};
 return r.fulfill({status:200,headers:scenario==='unknown'?{}:{'x-payment-response':Buffer.from(JSON.stringify(receipt)).toString('base64')},json:{intent,input:req.params,miner_id:'377',result:{name:req.params.name,matched:false,matches:[],lists:['LOCAL FIXTURE'],match_score:0},cost_usd:.01,duration_ms:12,signal_hash:'0x'+'b'.repeat(64)}});
 });
 const p=await c.newPage();const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:7788');await p.click('#wallet-connect');await p.waitForFunction(()=>!document.querySelector('#run-live').disabled);await p.fill('#deployer-name','Deployer Fixture');await p.fill('#treasury-name','Treasury Fixture');await p.click('#run-live');await p.waitForFunction(()=>document.querySelector('#out').getAttribute('aria-busy')==='false');
 const text=await p.locator('#out').innerText();const signs=await p.evaluate(()=>window.__calls.filter(x=>x==='personal_sign').length);assert.equal(unexpectedExternal,0);assert.deepEqual(errors,[]);
 if(scenario==='valid'){assert.equal(signs,2);assert.match(text,/20000/);assert.match(text,/not final settlement|not independently settled/);assert.ok(!/\bSETTLED\b/.test(text));}
 if(scenario==='partial'){assert.equal(signs,2);assert.match(text,/Deployer Fixture/);assert.match(text,/Unknown|unknown|UNKNOWN/);assert.match(text,/10000/);}
 if(scenario==='unknown'){assert.equal(signs,1);assert.match(text,/unknown|Unknown|UNKNOWN/);assert.match(text,/unavailable/);}
 if(scenario==='malformed-challenge'){assert.equal(signs,0);assert.match(text,/network|Network/);}
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 for(const width of [320,390,1280]){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await p.screenshot({path:`${root}/review/screenshots/${scenario}-${width}.png`,fullPage:true});}await p.setViewportSize({width:390,height:844});
 if(scenario!=='malformed-challenge'){await p.reload();await p.waitForSelector('#out .listings-memo');await p.click('#wallet-connect');await p.fill('#deployer-name','Deployer Fixture');await p.fill('#treasury-name','Treasury Fixture');await p.click('#new-assessment');await p.waitForFunction(()=>Object.keys(JSON.parse(localStorage.getItem('leaderlight.live-assessment-intents.v1')||'{}')).length>=2);await p.click('#run-live');await p.waitForFunction(()=>document.querySelector('#out').getAttribute('aria-busy')==='false');const reSigns=await p.evaluate(()=>window.__calls.filter(x=>x==='personal_sign').length);const reText=await p.locator('#out').innerText();
 // A repeat after a protocol receipt requires an explicit New assessment intent; unresolved attempts still block it.
 if(scenario==='valid'){assert.equal(reSigns,2);assert.doesNotMatch(reText,/Reconcile|reconcile/);const count=await p.evaluate(()=>{try{const l=JSON.parse(localStorage.getItem('leaderlight.live-attempts.v1')||'{}');return Object.keys(l.attempts||{}).length}catch(e){return -1}});assert.ok(count>=2,'canonical attempts persisted across reload');}
 if(scenario==='partial'){assert.equal(reSigns,1);assert.match(reText,/Reconcile|reconcile/);}
 if(scenario==='unknown'){assert.equal(reSigns,0);assert.match(reText,/Reconcile|reconcile/);}}
 results.push({scenario,pass:true,mockedSignatures:signs,authorizedMockResponses:authorized,asks,externalCalls:unexpectedExternal});await c.close();
 }
 fs.writeFileSync(root+'/review/paid-ui-results.json',JSON.stringify({scope:'All signatures, challenges, responses, receipts and rankings are LOCAL FIXTURES, no live wallet or paid API calls.',results},null,2));console.log(results);
}finally{await browser.close();server.kill()}

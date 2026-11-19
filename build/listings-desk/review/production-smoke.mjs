import {chromium} from 'playwright';import assert from 'node:assert/strict';import fs from 'node:fs';
fs.mkdirSync('review/screenshots',{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});const results=[],errors=[],paid=[];
try{const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.method()==='POST')paid.push(r.url())});
await page.goto('https://leaderlight.vercel.app/',{waitUntil:'networkidle'});assert.match(await page.title(),/Leaderlight/);assert.match(await page.locator('h1').innerText(),/Keep the signal/);results.push('Production root serves command-room redesign');
for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);results.push('No initial horizontal overflow at '+width)}
await page.fill('#token','PEPE');await page.click('#run-button');await page.waitForSelector('#out .listings-memo');assert.match(await page.locator('#out').innerText(),/simulated/i);results.push('Actual production offline /memo succeeds with simulated label');
for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);results.push('No offline result overflow at '+width);await page.screenshot({path:`review/screenshots/production-offline-${width}.png`,fullPage:true});}
await page.click('#nav-evidence');assert.equal(new URL(page.url()).hash,'#evidence-section');results.push('Result navigation works');
await page.click('#wallet-connect');await page.waitForFunction(()=>document.querySelector('#wallet-status').innerText.includes('MetaMask'));assert.equal(await page.isDisabled('#run-live'),true);results.push('No-provider message and disabled paid control preserved');assert.deepEqual(errors,[]);assert.deepEqual(paid,[]);results.push('No page exceptions or POST requests');
const summary={url:'https://leaderlight.vercel.app/',results,errors,postRequests:paid,scope:'Actual public production. Offline GET only. No provider, signing, paid calls or transactions.'};fs.writeFileSync('review/production-smoke-results.json',JSON.stringify(summary,null,2));console.log(summary);
}finally{await browser.close()}

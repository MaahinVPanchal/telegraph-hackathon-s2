import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('../public/leaderlight-live.html',import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../vercel.json',import.meta.url),'utf8'));
test('UI resolves the same-origin ask URL before calling strict payment guards',()=>{
 assert.match(html,/requestUrl: new URL\(ENGINE_BASE \+ "\/v1\/ask", window.location.origin\).href/);
 const origin='https://desk.example';const path='/api/engine/v1/ask';
 const url=new URL(path,origin);assert.equal(url.origin,origin);assert.equal(url.pathname,path);
});
test('Vercel routes the exact guarded browser ask path to the existing Engine proxy',()=>{
 assert.deepEqual(config.rewrites.find(x=>x.source==='/api/engine/v1/ask'),{source:'/api/engine/v1/ask',destination:'/api/engine'});
});
test('LeaderLight preserves unique runtime controls, headline, and Telegraph mark',()=>{
 for(const id of ['candidate-form','run-button','wallet-connect','run-live','mint-usdc','fund-escrow','deployer-name','treasury-name','out'])assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
 assert.match(html, /href="\/miner-history\.html"/);
 assert.doesNotMatch(html, /id="lb-body"/);
 assert.match(html,/See the risk/);assert.match(html.replace(/<[^>]+>/g, ''),/Keep the signal/);assert.match(html,/Independent app/);assert.match(html,/data:image\/png;base64/);
});
test('/memo serves a full styled document, not a bare fragment',async()=>{
 // Regression (2026-11-12): the endpoint returned renderHtmlFragment â€” a bare
 // <section> with no document or stylesheet, which rendered unreadably.
 const { renderHtml } = await import('../src/memo.mjs');
 const { memo } = await import('../src/desk.mjs').then((d) => d.runDesk('PEPE', { mode: 'mock' }));
 const page = renderHtml(memo);
 assert.match(page, /^<!doctype html>/i);
 assert.match(page, /--ld-page:/);
 assert.match(page, /<style/);
 const handler = readFileSync(new URL('../api/memo.js', import.meta.url), 'utf8');
 assert.match(handler, /renderHtml\(memo\)/);
 assert.doesNotMatch(handler, /renderHtmlFragment\s*\(/);
});

test('live sanctions evidence accepts omitted empty matches only for an explicit no-match', () => {
 const source = html.match(/^function sanctionsFinding\(data, params\) \{[\s\S]+?^\}/m)[0];
 const finding = new Function(source + '\nreturn sanctionsFinding;')();
 const params = { name: 'Sample Entity' };
 const result = { ...params, matched: false, matches: [], lists: ['Example list (2026-11-10)'], match_score: 0 };
 const field_status = { name: 'ok', matched: 'ok', matches: 'missing', lists: 'ok', match_score: 'ok' };
 const expected = { matched: false, lists: result.lists };
 assert.deepEqual(finding({ result, field_status }, params), expected);
 assert.deepEqual(finding({ result: { ...result, matches: null }, field_status }, params), expected);
 assert.equal(finding({ result: { ...result, matched: true }, field_status }, params), null);
 assert.equal(finding({ result: { ...result, matches: ['Reported match'] }, field_status }, params), null);
 assert.equal(finding({ result, field_status: { ...field_status, lists: 'missing' } }, params), null);
 assert.equal(finding({ result, field_status: { ...field_status, matches: 'rejected' } }, params), null);
});

// Reproducible UI smoke: isolated profile, local runtime and sample data only.
// Build first: cd apps/electron && bun run build
// Run from repository root: node apps/electron/e2e/assistant-workspace.mjs
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import assert from 'node:assert/strict';
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appRoot, '../..');
const out = mkdtempSync(join(tmpdir(), 'trail-assistant-qa-'));
console.log('QA artifacts:', out);
const require = createRequire(join(appRoot, 'package.json'));
const { _electron } = require('playwright-core');
process.env.FINAGENT_DEMO_DATA = '1';
const userDataDir = join(out, `qa-profile-${Date.now()}`);
mkdirSync(join(userDataDir, 'store'), { recursive: true });
writeFileSync(join(userDataDir, 'app-preferences.json'), JSON.stringify({ locale: 'zh-CN' }));
writeFileSync(join(userDataDir, 'onboarding.json'), JSON.stringify({ completed: true }));
const now = Date.now();
const sessions = ['英伟达财报分析', '新能源行业跟踪', 'New Session'].map((title, i) => ({
  id: `qa-session-${i}`, title, status: 'idle', createdAt: now - 86400000 * i,
  updatedAt: now - 86400000 * i, messageCount: i === 2 ? 0 : i === 1 ? 8 : 12,
  ...(i < 2 ? { lastMessageAt: now - 86400000 * i } : {}),
}));
writeFileSync(join(userDataDir, 'store/sessions.json'), JSON.stringify({ sessions }));
mkdirSync(join(userDataDir,'store/sessions/qa-session-0'),{recursive:true});
writeFileSync(join(userDataDir,'store/sessions/qa-session-0/messages.json'),JSON.stringify({messages:Array.from({length:24},(_,i)=>({id:'example-'+i,role:i%2?'assistant':'user',timestamp:now,content:i%2?'可以从四个方面整理：\n\n收入结构与增长来源\n\n利润、毛利率与现金流\n\n管理层指引与关键假设\n\n风险因素与待核实事项':'帮我整理英伟达本次财报的阅读框架。'}))}));
let app, page;
const errors = [];
async function launch() {
  app = await _electron.launch({
    executablePath: require('electron'), args: [join(appRoot, 'src/main/index.js'), '--force-device-scale-factor=1', '--disable-renderer-backgrounding'],
    cwd: repoRoot, env: { ...process.env, FINAGENT_AGENT_PROVIDER: 'local', FINAGENT_FORCE_PROD_LOAD: '1', FINAGENT_E2E: '1', FINAGENT_E2E_HIDDEN: '1', FINAGENT_USER_DATA_DIR: userDataDir }
  });
  page = await app.firstWindow();
  page.on('pageerror', error => errors.push(error.message));
  await resize(1536, 1024); console.log('LAUNCHED');
  await page.locator('[data-testid="sidebar"]').waitFor();
  await page.evaluate(() => {
    localStorage.setItem('trail.prefs.navSection', JSON.stringify('watchlist'));
    localStorage.setItem('trail.prefs.allotmentSizes', JSON.stringify([280, 866, 390]));
  });
  await page.reload();
  await page.locator('.trail-session-row').first().waitFor();
}
async function capture({path}, rect) {
  const buffer = await app.evaluate(async ({ BrowserWindow }, rect) => {
    const win = BrowserWindow.getAllWindows()[0];
    await win.webContents.capturePage(rect, {stayHidden:true, stayAwake:true});
    await win.webContents.executeJavaScript('new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))');
    const image = await win.webContents.capturePage(rect, {stayHidden:true, stayAwake:true});
    return image.toPNG().toString('base64');
  }, rect ? Object.fromEntries(Object.entries(rect).map(([key,value])=>[key,Math.round(value)])) : undefined);
  writeFileSync(path, Buffer.from(buffer, 'base64'));
}
async function stop() { await app?.close(); app = null; }
async function resize(width,height) {
  await app.evaluate(({ BrowserWindow }, {width,height}) => {
    const win = BrowserWindow.getAllWindows()[0]; win.webContents.setBackgroundThrottling(false); win.setMinimumSize(0,0); win.setContentSize(width,height);
  }, {width,height});
  await page.waitForFunction(({width,height}) => innerWidth === width && innerHeight === height, {width,height});
  await app.evaluate(async ({BrowserWindow}) => { await BrowserWindow.getAllWindows()[0].webContents.capturePage(undefined, {stayHidden:true}); });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

try {
 await launch();
 const entry=page.getByTestId('sidebar').getByRole('button',{name:'研迹助手',exact:true});
 assert.equal(await entry.evaluate(el=>el.previousElementSibling?.textContent),'提醒');
 await entry.click(); await page.getByTestId('assistant-focus').waitFor();
 assert.equal(await page.locator('.trail-agent-header').getByRole('button',{name:'模型',exact:true}).count(),0);
 assert.equal(await page.locator('.trail-assistant-composer-options').count(),1);
 await page.locator('.trail-agent-body').evaluate(el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll',{bubbles:true}))});
 await capture({path:join(out,'codex-trail-conversation.png')});
 await page.getByRole('button',{name:'新建会话',exact:true}).click();
 await page.getByTestId('assistant-start').waitFor();
 const input=()=>page.getByTestId('agent-input');
 assert.equal(await input().count(),1);
 assert.equal(await page.getByTestId('assistant-starter-prompts').locator('button').count(),3);
 await page.getByRole('button',{name:'梳理一份财报',exact:true}).click();
 assert.equal(await input().inputValue(),'梳理一份财报');
 assert.equal(await page.getByTestId('assistant-start').isVisible(),true);
 const inputBox=await input().boundingBox();assert.ok(inputBox.y<1024*.7);
 await capture({path:join(out,'codex-trail-new.png')});
 const current=await page.locator('.trail-session-row--active').getAttribute('data-session-id');
 await page.getByRole('button',{name:'返回工作台',exact:true}).click();
 await page.getByTestId('sidebar').waitFor();
 await page.getByTestId('sidebar').getByRole('button',{name:'研迹助手',exact:true}).click();
 assert.equal(await input().inputValue(),'梳理一份财报');
 assert.equal(await page.locator('.trail-session-row--active').getAttribute('data-session-id'),current);
 console.log('PASS navigation placement, focused entry, new conversation, suggestions and preserved draft');
 await input().fill('请介绍一个清晰的研究流程');
 await input().press('Enter');
 await page.getByTestId('assistant-start').waitFor({state:'detached'});
 await page.waitForFunction(()=>!document.querySelector('.trail-session-new')?.disabled);
 assert.equal(await page.getByTestId('assistant-start').count(),0);
 const composer=await page.locator('.trail-agent-composer').boundingBox();
 assert.ok(composer.y+composer.height<=1025);
 console.log('PASS real local-runtime send, conversation layout and pinned composer');
 await page.getByRole('button',{name:'新建会话',exact:true}).click();
 await page.getByTestId('assistant-start').waitFor();
 await resize(390,844);
 await capture({path:join(out,'codex-trail-mobile-new.png')});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 await page.getByRole('button',{name:'会话',exact:true}).click();
 await page.getByRole('dialog').waitFor();
 await page.getByRole('dialog').locator('[data-session-id="qa-session-0"] .trail-session-select').click();
 await page.getByRole('dialog').waitFor({state:'detached'});
 assert.equal(await page.getByTestId('assistant-start').count(),0);
 await capture({path:join(out,'codex-trail-mobile-chat.png')});
 console.log('PASS narrow layout and session drawer');
 assert.deepEqual(errors,[]);console.log('PASS renderer exceptions',errors);
} catch(error){await capture({path:join(out,'codex-trail-failure.png')}).catch(()=>{});console.error(error);process.exitCode=1;}finally{await stop()}

const puppeteer=require('/workspace/vehicle-app/node_modules/puppeteer-core');
const fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..');
const URL='http://127.0.0.1:8765/evoai-cloud.html';
const cols=fs.readFileSync(path.join(__dirname,'schema_cols.json'),'utf8');
const mock=fs.readFileSync(path.join(__dirname,'mock_sb.js'),'utf8');
const seed=fs.readFileSync(path.join(__dirname,'seed.js'),'utf8');
let browser;
async function launch(){
  // Chrome's password-leak warning (CredentialLeakDialogView) pops up a few seconds after the test login and,
  // being tab-modal, swallows every key/touch to the page. Turn Chrome's password manager off for tests.
  const _fs=require('fs'),_os=require('os'),_pa=require('path');const udd=_fs.mkdtempSync(_pa.join(_os.tmpdir(),'evoai-chrome-'));_fs.mkdirSync(_pa.join(udd,'Default'),{recursive:true});
  _fs.writeFileSync(_pa.join(udd,'Default','Preferences'),JSON.stringify({credentials_enable_service:false,profile:{password_manager_enabled:false,password_manager_leak_detection:false}}));
  browser=await puppeteer.launch({userDataDir:udd,executablePath:'/usr/bin/google-chrome',headless:'new',args:['--no-sandbox','--disable-gpu']});return browser;}
async function open(opts){
  opts=opts||{};
  const page=await browser.newPage();
  await page.setViewport({width:opts.w||390,height:opts.h||844,deviceScaleFactor:opts.dsf||2,isMobile:!opts.desktop,hasTouch:!opts.desktop});
  page.errors=[];
  if(opts.reduced)await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
  // v25b: the automatic first-value sweep is off in older suites (they test manual refresh); values25b.js turns it on
  if(!opts.vq)await page.evaluateOnNewDocument(()=>{window.__VQ_OFF__=1;});
  page.on('pageerror',e=>page.errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')page.errors.push('console: '+m.text());});
  page.on('dialog',d=>d.accept(d.type()==='prompt'?'':undefined));
  await page.evaluateOnNewDocument('window.__SCHEMA_COLS__='+cols+';');
  await page.evaluateOnNewDocument(mock);
  if(opts.seed!==false)await page.evaluateOnNewDocument(seed);
  if(opts.pre)await page.evaluateOnNewDocument(opts.pre);
  // v29: the test server restarts itself if it dies; retry a refused connection briefly
  for(let i=0;;i++){try{await page.goto(URL+(opts.q||''),{waitUntil:'load'});break;}catch(e){if(i>=20||!/ERR_CONNECTION_REFUSED|ERR_EMPTY_RESPONSE|ERR_CONNECTION_RESET/.test(String(e)))throw e;await new Promise(r=>setTimeout(r,500));}}
  // v36b: the intro splash stays ~1.7s on every open; wait for it unless a test wants to see it (opts.intro)
  if(!opts.intro)await page.waitForFunction(()=>!window.__EVO_INTRO||(window.__EVO_INTRO.done&&getComputedStyle(document.getElementById('boot-loading')).display==='none'||window.__EVO_INTRO.done&&window.__EVO_INTRO.want),{timeout:6000}).catch(()=>{});
  return page;
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function login(page,email,pw,role){
  if(role)await page.evaluate(r=>selectRole(r),role);
  await page.evaluate((e,p)=>{document.getElementById('auth-email').value=e;document.getElementById('auth-password').value=p;login();},email,pw||'password123');
  await page.waitForFunction(()=>document.getElementById('auth-screen').style.display==='none',{timeout:8000});
  await sleep(400);
}
const ev=(page,fn,...a)=>page.evaluate(fn,...a);
const state=page=>page.evaluate(()=>({v:window.__MOCK_STATE__.violations,log:window.__MOCK_STATE__.log.filter(l=>l.op!=='select'),rpcs:window.__MOCK_STATE__.rpcs,tables:window.__MOCK_STATE__.tables,emails:window.__MOCK_STATE__.emails,storage:Object.keys(window.__MOCK_STATE__.storage)}));
module.exports={launch,open,sleep,login,ev,state,close:()=>browser.close(),ROOT};

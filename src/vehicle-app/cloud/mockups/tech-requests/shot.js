const p=require('/workspace/vehicle-app/node_modules/puppeteer-core');
(async()=>{const b=await p.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox']});const pg=await b.newPage();await pg.setViewport({width:430,height:932,deviceScaleFactor:2});
for(const f of process.argv.slice(2)){await pg.goto('file://'+__dirname+'/'+f+'.html');await pg.screenshot({path:f+'.png',fullPage:true});}await b.close();})();

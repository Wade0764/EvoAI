const L=require('./lib.js');const fs=require('fs');const P=__dirname+'/../tools/patches/';const O=__dirname+'/../screens/';
(async()=>{await L.launch();
for(const opt of ['current','A','B','C']){const p=await L.open({dsf:1,pre:"try{localStorage.setItem('pwa_hint_dismissed','1')}catch(e){}"});await L.login(p,'olivia@test.com');
 if(opt!=='current'){await p.evaluate(fs.readFileSync(P+'nav_common.js','utf8'));await p.evaluate(fs.readFileSync(P+'nav_'+opt+'.js','utf8'));}
 await L.sleep(opt==='C'?1000:500); // C captured mid-nudge
 await p.screenshot({path:O+'nav-'+(opt==='current'?'00-current':opt)+'.png',clip:{x:0,y:844-300,width:390,height:300}});
 console.log(opt,p.errors.slice(0,3));await p.close();}
await L.close();})();

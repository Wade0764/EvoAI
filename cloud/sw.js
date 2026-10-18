/* EvoAI service worker: caches the app shell only. Never touches Supabase (auth, REST, storage). */
var CACHE='evoai-shell-v1';
var SHELL=['./','evoai-cloud.html','manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png'];
self.addEventListener('install',function(e){
  e.waitUntil(caches.open(CACHE).then(function(c){return Promise.all(SHELL.map(function(u){return c.add(u).catch(function(){});}));}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
  e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
  var req=e.request,url=new URL(req.url);
  if(req.method!=='GET')return;
  if(url.origin!==self.location.origin)return;            /* Supabase and everything cross-origin: network only */
  if(/supabase/i.test(url.hostname)||/\/(auth|rest|storage|functions)\/v1\//.test(url.pathname))return;
  e.respondWith(caches.match(req).then(function(hit){
    var net=fetch(req).then(function(res){
      if(res&&res.ok&&res.type==='basic'){var cp=res.clone();caches.open(CACHE).then(function(c){c.put(req,cp);});}
      return res;
    }).catch(function(){return hit||(req.mode==='navigate'?caches.match('evoai-cloud.html'):undefined);});
    return hit||net;
  }));
});

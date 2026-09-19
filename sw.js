var CACHE='egyptbet-shell-v145';
var SHELL=['./','./index.html'];
self.addEventListener('install',function(e){
e.waitUntil(caches.open(CACHE).then(function(c){return c.addAll(SHELL);}).then(function(){return self.skipWaiting();}));
});
self.addEventListener('activate',function(e){
e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==CACHE;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));
});
self.addEventListener('fetch',function(e){
var req=e.request;
if(req.method!=='GET')return;
var url=new URL(req.url);
if(url.origin!==self.location.origin)return;
if(req.mode==='navigate'){
e.respondWith(
fetch(req,{cache:'no-store'}).then(function(res){
if(res&&res.status===200){var cp=res.clone();caches.open(CACHE).then(function(c){return c.put(req,cp);});return res;}
throw new Error('bad-status');
}).catch(function(){
return caches.match(req).then(function(c){
if(c)return c;
return caches.match('./index.html').then(function(c2){
if(c2)return c2;
return new Response('<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Egypt Bet</title></head><body style="background:#0b1210;color:#e5e7eb;font-family:sans-serif;text-align:center;padding-top:45vh;margin:0"><p style="font-size:15px;font-weight:700">📡 لا يوجد اتصال بالخادم حالياً</p><p style="font-size:12px;color:#94a3b8">أغلق التطبيق وأعد فتحه بعد قليل</p></body></html>',{status:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
});
});
})
);
return;
}
e.respondWith(caches.match(req).then(function(c){
if(c)return c;
return fetch(req).then(function(res){
if(res&&(res.status===200||res.type==='opaque')){var cp=res.clone();caches.open(CACHE).then(function(cc){return cc.put(req,cp);});}
return res;
});
}));
});
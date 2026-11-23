const CACHE="kid-habits-good-habit-v31",HOME="/kid-habits/";
const APP_ASSETS=[
 HOME,
 HOME+"app.js?v=31",
 HOME+"style.css?v=31",
 HOME+"app.js",
 HOME+"style.css",
 HOME+"good-habit-icon-512.webp?v=good-habit-v1",
 HOME+"good-habit-icon-192.png?v=good-habit-v1"
];
self.addEventListener("install",event=>event.waitUntil(
 caches.open(CACHE).then(cache=>cache.addAll(APP_ASSETS)).then(()=>self.skipWaiting())
));
self.addEventListener("activate",event=>event.waitUntil(Promise.all([
 caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("kid-habits-")&&k!==CACHE).map(k=>caches.delete(k)))),
 self.clients.claim()
])));
self.addEventListener("fetch",event=>{
 const request=event.request,url=new URL(request.url);
 if(url.origin!==location.origin||!url.pathname.startsWith(HOME)||request.method!=="GET")return;
 if(request.mode==="navigate"){
  event.respondWith(fetch(request).catch(()=>caches.match(HOME)));
  return;
 }
 const asset=/\/(?:app\.js|style\.css|good-habit-icon-[^/]+)$/.test(url.pathname);
 if(asset){
  event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(response=>{
   if(response.ok)caches.open(CACHE).then(cache=>cache.put(request,response.clone())).catch(()=>{});
   return response;
  })));
 }else event.respondWith(fetch(request).catch(()=>caches.match(request)));
});

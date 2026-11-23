const CACHE="kid-habits-good-habit-v33",HOME="/kid-habits/";
const APP_ASSETS=[
 HOME,
 HOME+"app.js?v=33",
 HOME+"style.css?v=33",
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
  // Always revalidate the entry page: cached HTML can point at old JS/CSS versions.
  event.respondWith(fetch(request,{cache:"no-store"}).catch(()=>caches.match(HOME)));
  return;
 }
 const scriptOrStyle=/\/(?:app\.js|style\.css)$/.test(url.pathname);
 if(scriptOrStyle){
  // Online: load current script/styles instead of keeping old UI in the installed PWA.
  // Offline: fall back to the precached revision.
  event.respondWith(fetch(request,{cache:"no-store"}).then(response=>{
   if(response.ok){
    const copy=response.clone();
    event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{}));
   }
   return response;
  }).catch(()=>caches.match(request)));
  return;
 }
 const image=/\/good-habit-icon-[^/]+$/.test(url.pathname);
 if(image){
  event.respondWith(caches.match(request).then(hit=>hit||fetch(request).then(response=>{
   if(response.ok){
    const copy=response.clone();
    event.waitUntil(caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{}));
   }
   return response;
  })));
 }else event.respondWith(fetch(request).catch(()=>caches.match(request)));
});

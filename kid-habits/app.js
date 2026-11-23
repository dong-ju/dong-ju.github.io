(()=>{
"use strict";
const STORE="kid_habits_personal_v1",SETUP="kid_habits_personal_setup_v1",MODE="kid_habits_personal_role_v1";
const SYNC_TOKEN="good_habits_device_token_v1";
const SYNC_CACHE="good_habits_last_confirmed_state_v1";
const REALTIME_KEY="sb_publishable_a13fHmGNGIhJ1cVNvTsUtA_xtLmYt03";
let realtimeClient=null,realtimeChannel=null,realtimeConnected=false,realtimeStarted=false;
let lastSyncStatus="cached";
function persistConfirmedState(){
 if(!hasSyncToken()||!serverState||!serverRevision)return;
 try{
  localStorage.setItem(SYNC_CACHE,JSON.stringify({
   fingerprint:localStorage.getItem(SYNC_TOKEN).slice(-12),
   state:lastConfirmedState||serverState,
   revision:serverRevision,
   device:serverDevice||{role:localStorage.getItem(MODE)||"parent"},
   updatedAt:new Date().toISOString()
  }));
 }catch(e){console.warn("좋은습관 로컬 캐시 저장 실패",e);}
}
function restoreLastSavedState(){
 if(!hasSyncToken())return false;
 try{
  const raw=localStorage.getItem(SYNC_CACHE);
  if(!raw)return false;
  const cached=JSON.parse(raw);
  if(cached.fingerprint!==localStorage.getItem(SYNC_TOKEN).slice(-12)
    ||!Number.isSafeInteger(cached.revision)||cached.revision<1
    ||!cached.state||!validate(cached.state)
    ||!["parent","child"].includes(cached.device?.role))return false;
  serverState=copyState(cached.state);
  lastConfirmedState=copyState(cached.state);
  serverRevision=cached.revision;
  serverDevice=cached.device;
  serverReady=true;
  syncOnline=navigator.onLine!==false;
  lastSyncStatus="cached";
  return true;
 }catch(e){console.warn("좋은습관 로컬 캐시 복원 실패",e);return false;}
}
function refreshSyncIndicator(){
 const dot=document.querySelector(".sync-indicator");
 if(dot){
  const label=!syncOnline?"오프라인 · 마지막 저장 내용":outstandingWrites?"DB 저장 중":
   lastSyncStatus==="cached"?"마지막 저장 내용 · 최신 확인 중":
   realtimeConnected?"실시간 동기화":"동기화됨";
  dot.setAttribute("aria-label",label);
  dot.title=label;
  dot.className="sync-indicator "+(!syncOnline?"is-offline":outstandingWrites?"is-saving":lastSyncStatus==="cached"?"is-saving":"");
 }
}
function startRealtime(){
 if(realtimeStarted||!hasSyncToken()||!window.supabase?.createClient||typeof WebSocket==="undefined")return;
 realtimeStarted=true;
 try{
  realtimeClient=window.supabase.createClient("https://dnvphihaopivjcvkvvud.supabase.co",REALTIME_KEY,{
   auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}
  });
  realtimeChannel=realtimeClient.channel("gh_home_revision",{config:{private:false}})
   .on("broadcast",{event:"changed"},payload=>{
    const revision=Number(payload?.payload?.revision);
    if(Number.isFinite(revision)&&revision<=serverRevision)return;
    if(document.visibilityState==="visible")void loadFromDatabase();
   })
   .subscribe(status=>{
    realtimeConnected=status==="SUBSCRIBED";
    if(realtimeConnected&&document.visibilityState==="visible")void loadFromDatabase();
    refreshSyncIndicator();
   });
 }catch(error){
  realtimeStarted=false;realtimeConnected=false;
  console.warn("좋은습관 실시간 연결 실패 · 주기적 동기화로 대체",error);
 }
}

const SYNC_URL="https://dnvphihaopivjcvkvvud.supabase.co/functions/v1/good-habits-sync/";
let registering=false;
let serverState=null,serverRevision=0,serverDevice=null,serverReady=false;
let lastConfirmedState=null,syncOnline=true;
let syncReading=false,syncWriteQueue=Promise.resolve(),outstandingWrites=0,childActionBusy=false;
const queuedChildActions=[];
function hasSyncToken(){return !!localStorage.getItem(SYNC_TOKEN);}
function copyState(d){return JSON.parse(JSON.stringify(d));}
async function syncRequest(route,body){
 const token=localStorage.getItem(SYNC_TOKEN);
 if(!token)throw Error("기기를 연결한 뒤 다시 시도해주세요.");
 const res=await fetch(SYNC_URL+route,{
  method:body===undefined?"GET":"POST",
  headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
  body:body===undefined?undefined:JSON.stringify(body),
  cache:"no-store"
 });
 let data={};
 try{data=await res.json();}catch(_){}
 if(!res.ok){
  const err=new Error(data.error||"DB 연결에 실패했습니다.");
  err.status=res.status;throw err;
 }
 return data;
}
async function autoRegisterDevice(selectedMode){
 if(registering||hasSyncToken())return;
 if(!["parent","child"].includes(selectedMode))return;
 registering=true;
 app.innerHTML='<main class="wrap view-registration">'+header(null)+
  '<section class="pin"><h1 class="setup-title">좋은습관 연결 중</h1>'+
  '<p class="setup-description">선택한 '+(selectedMode==="parent"?"부모":"아이")+' 화면을 공통 DB에 자동 연결합니다.</p></section></main>';
 try{
  const res=await fetch(SYNC_URL+"auto-pair",{
   method:"POST",headers:{"Content-Type":"application/json"},
   body:JSON.stringify({role:selectedMode}),cache:"no-store"
  });
  const data=await res.json().catch(()=>({}));
  if(!res.ok||!data.token||data.role!==selectedMode)
   throw Error(data.error||"DB 자동 연결에 실패했습니다.");
  localStorage.setItem(SYNC_TOKEN,data.token);
  localStorage.removeItem(SYNC_CACHE);
  localStorage.setItem(MODE,data.role);
  localStorage.setItem(SETUP,"1");
  childPreview=false;viewDay=seoulToday();screen="today";
  await loadFromDatabase(true);
  if(!serverReady)throw Error("DB 데이터를 불러오지 못했습니다.");
  notify("좋은습관 연결 완료");
 }catch(err){
  if(!serverReady){
   if(hasSyncToken())render();
   else registration();
  }
  notify(err.message||"DB 자동 연결 실패");
 }finally{registering=false;}
}
async function loadFromDatabase(force=false){
 if(!hasSyncToken()||syncReading||outstandingWrites||childActionBusy)return;
 syncReading=true;
 try{
  let result=await syncRequest("state");
  const previousState=serverState,previousRole=role();
  serverDevice=result.device;
  if(result.state){
   syncOnline=true;
   if(!serverReady||result.revision!==serverRevision||force){
    serverState=result.state;lastConfirmedState=copyState(result.state);
    serverRevision=result.revision;serverReady=true;lastSyncStatus="fresh";
    persistConfirmedState();
    if(!refreshChildCheckSync(previousState,result.state,previousRole))render();
   }else{
    lastSyncStatus="fresh";refreshSyncIndicator();
   }
  }else{
   serverReady=false;
   if(force)render();
  }
 }catch(err){
  syncOnline=false;
  if(err.status===401){
   serverReady=false;
   localStorage.removeItem(SYNC_TOKEN);
   localStorage.removeItem(SYNC_CACHE);
   localStorage.removeItem(SETUP);
   registration();
   notify("기기 연결이 만료되었습니다. 사용할 모드를 다시 선택해주세요.");
  }else{
   if(!serverReady)notify(err.message||"DB에 연결할 수 없습니다.");
   // Keep the last confirmed screen intact if the server is unreachable.
   refreshSyncIndicator();
  }
 }finally{syncReading=false;}
}
function enqueueParentSave(documentState){
 if(!hasSyncToken())return;
 outstandingWrites++;
 const snapshot=copyState(documentState);
 syncWriteQueue=syncWriteQueue.then(async()=>{
  const result=await syncRequest("save",{state:snapshot,revision:serverRevision});
  serverRevision=result.revision;
  lastConfirmedState=copyState(snapshot);syncOnline=true;
  lastSyncStatus="fresh";persistConfirmedState();refreshSyncIndicator();
 }).catch(async err=>{
  syncOnline=false;
  notify((err.status===409?"다른 기기에서 수정했습니다. ":"")+err.message);
  try{
   const current=await syncRequest("state");
   serverState=current.state;lastConfirmedState=copyState(current.state);
   serverRevision=current.revision;
   serverReady=!!current.state;serverDevice=current.device;syncOnline=true;
   lastSyncStatus="fresh";persistConfirmedState();render();
  }catch(_){
   // Do not leave a failed optimistic write displayed as committed.
   if(lastConfirmedState)serverState=copyState(lastConfirmedState);
   render();
  }
 }).finally(()=>{outstandingWrites--;refreshSyncIndicator();});
}
function optimisticChildChange(action,hid,itemId){
 const d=copyState(serverState),day=seoulToday(),h=d.habits.find(x=>x.id===hid&&x.active);
 if(!h)return;
 const k=day+"|"+hid,existing=d.checks.find(x=>x.habit_id===hid&&x.day===day);
 if(existing?.status==="approved")return;
 const now=new Date().toISOString();
 if(action==="complete"){
  if(h.items.length)return;
  if(existing?.status==="pending")d.checks=d.checks.filter(x=>x!==existing);
  else if(!existing||existing.status==="rejected")pushCheck(d,h,day);
 }else if(action==="toggle"){
  const items=h.items||[],clicked=items.find(x=>x.id===itemId);
  if(!clicked)return;
  const done=new Set(d.subchecks[k]||[]);
  if(!d.subcheckTimes[k])d.subcheckTimes[k]={};
  if(done.has(itemId)){
   done.delete(itemId);delete d.subcheckTimes[k][itemId];
  }else{
   const group=String(clicked.group||"").trim();
   if(group)items.filter(x=>String(x.group||"").trim()===group).forEach(x=>{
    done.delete(x.id);delete d.subcheckTimes[k][x.id];
   });
   done.add(itemId);d.subcheckTimes[k][itemId]=now;
  }
  d.subchecks[k]=Array.from(done);
  if(taskUnitsDone(h,done)){
   pushCheck(d,h,day);
   const next=d.checks.find(x=>x.habit_id===hid&&x.day===day);
   if(next)next.completed_items=selectedTaskItems(h,done).map(x=>({
    title:x.title,at:d.subcheckTimes[k][x.id]||now
   }));
  }else if(existing?.status==="pending")d.checks=d.checks.filter(x=>x!==existing);
 }
 serverState=d;
 if(!refreshChildCheckView(d))render();
}
async function flushChildActionQueue(){
 if(childActionBusy||queuedChildActions.length===0)return;
 childActionBusy=true;let failed=false;
 try{
  while(queuedChildActions.length){
   const next=queuedChildActions.shift();
   try{
    await syncRequest("check",next);
   }catch(err){
    failed=true;
    queuedChildActions.length=0;
    notify(err.message||"체크를 저장하지 못했습니다.");
    break;
   }
  }
 }finally{
  childActionBusy=false;
 }
 if(failed&&lastConfirmedState){
  serverState=copyState(lastConfirmedState);render();
 }
 await loadFromDatabase(true);
}
function submitChildChange(action,habitId,itemId=null){
 if(!serverReady||!syncOnline||navigator.onLine===false||outstandingWrites){
  notify("온라인 DB 연결이 필요합니다.");return;
 }
 // Optimistically update each tap and send requests to the server in order.
 optimisticChildChange(action,habitId,itemId);
 queuedChildActions.push({action,habitId,itemId});
 void flushChildActionQueue();
}

const app=document.getElementById("app"),dialog=document.getElementById("modal"),dialogBody=document.getElementById("modalBody");
let viewDay=seoulToday(),screen="today",statsUnit="week",statsAnchor=seoulToday(),lastPending=0,childPreview=false;
const DEFAULT_BONUSES=[
 {id:"posture-bonus",title:"바른 자세",minutes:10,active:true},
 {id:"attitude",title:"바르지 않은 태도로 행동하기",minutes:-20,active:true},
 {id:"tantrum",title:"떼쓰기",minutes:-10,active:true}
];
const starter=[
 {id:"morning",title:"아침 할 일",reward_minutes:5,sort_order:1,active:true,items:[{id:"bathroom",title:"소변 보기"},{id:"brush",title:"치카하기"},{id:"wash",title:"세수하기"},{id:"water",title:"물 마시기"}]},
 {id:"study",title:"공부하기",reward_minutes:10,sort_order:2,active:true,items:[{id:"math",title:"수학"},{id:"read",title:"책 읽기"},{id:"dictation",title:"받아쓰기",group:"쓰기 연습"},{id:"handwriting",title:"바르게 쓰기",group:"쓰기 연습"}]},
 {id:"sleep",title:"잠들기",reward_minutes:5,sort_order:3,active:true,items:[]}
];
function seoulToday(){let p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+"-"+p.month+"-"+p.day;}
function nextDay(day,offset=1){let d=new Date(day+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function diffDays(a,b){return Math.round((Date.parse(a+"T12:00:00Z")-Date.parse(b+"T12:00:00Z"))/86400000);}
function uid(){return typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():"p"+Date.now().toString(36)+Math.random().toString(36).slice(2);}
function safe(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function fresh(){return {version:7,started_on:seoulToday(),habits:JSON.parse(JSON.stringify(starter)).map(h=>({...h,created_on:seoulToday()})),bonusItems:JSON.parse(JSON.stringify(DEFAULT_BONUSES)),checks:[],ledger:[],subchecks:{},subcheckTimes:{},studyDays:{}};}
function validate(d){return d&&[1,2,3,4,5,6,7].includes(d.version)&&Array.isArray(d.habits)&&Array.isArray(d.checks)&&Array.isArray(d.ledger)&&d.habits.length<500&&d.checks.length<100000&&d.ledger.length<100000&&d.habits.every(h=>h&&typeof h.id==="string"&&typeof h.title==="string"&&Number.isInteger(h.reward_minutes));}
function migrate(d){
 if(!d.subchecks||typeof d.subchecks!=="object")d.subchecks={};
 if(!d.studyDays||typeof d.studyDays!=="object")d.studyDays={};
 if(!d.subcheckTimes||typeof d.subcheckTimes!=="object")d.subcheckTimes={};
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d.started_on||"")){
  const dates=[
   ...d.checks.map(c=>c.day),
   ...d.ledger.map(l=>l.day),
   ...Object.keys(d.subchecks).map(k=>k.split("|")[0])
  ].filter(x=>/^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
  d.started_on=dates[0]||seoulToday();
 }
 if(!Array.isArray(d.bonusItems))d.bonusItems=JSON.parse(JSON.stringify(DEFAULT_BONUSES));
 d.bonusItems=d.bonusItems.filter(x=>x&&typeof x.id==="string"&&typeof x.title==="string"&&Number.isInteger(x.minutes)&&x.minutes!==0&&Math.abs(x.minutes)<=300).map(x=>({...x,active:x.active!==false}));
 d.habits.forEach(h=>{
  const def=starter.find(s=>s.id===h.id);
  if(def&&d.version===1){
   const legacy={morning:"아침에 일어나서 할 일 하기",study:"하루 공부 먼저 하기",sleep:"멋지게 잠들기",posture:"하루 종일 바른 자세 하기"};
   if(h.title===legacy[h.id])h.title=def.title;
   h.items=JSON.parse(JSON.stringify(def.items));h.rotation=!!def.rotation;
  }
  else if(!Array.isArray(h.items))h.items=def?JSON.parse(JSON.stringify(def.items)):[];
  h.items=h.items.map(x=>typeof x==="string"?{id:uid(),title:x}:x).filter(x=>x&&typeof x.id==="string"&&typeof x.title==="string");
 });
 // Restore the predefined three-step study rotation in older local records.
 // Keep customized, non-empty study lists intact.
 const study=d.habits.find(h=>h.id==="study");
 if(study){
  if(!Array.isArray(study.items)||!study.items.length){
   study.items=JSON.parse(JSON.stringify(starter.find(x=>x.id==="study").items));
  }
  // Upgrade the original combined writing item to two alternating activities.
  // Keep historical checks and ledger entries untouched.
  const combined=study.items.find(x=>x.id==="write"&&x.title==="받아쓰기 / 바르게 쓰기");
  if(combined){
   study.items=study.items.filter(x=>x!==combined);
   if(!study.items.some(x=>x.id==="dictation"))study.items.push({id:"dictation",title:"받아쓰기"});
   if(!study.items.some(x=>x.id==="handwriting"))study.items.push({id:"handwriting",title:"바르게 쓰기"});
  }
  const legacyRotation=study.rotation===true||!!combined;
  if(legacyRotation){
   study.items.forEach(item=>{
    if((item.id==="dictation"||item.id==="handwriting")&&!String(item.group||"").trim())
     item.group="쓰기 연습";
   });
  }
  study.rotation=false;
 }
 d.habits.forEach(h=>{if(!h.created_on)h.created_on=d.started_on;});
 if(d.version<6){
  // Keep the old habit and its completed check/ledger records for history,
  // but no longer offer it as a child-checkable task.
  const posture=d.habits.find(h=>h.id==="posture");
  if(posture){
   if(!d.bonusItems.some(b=>b.id==="posture-bonus"||b.title==="바른 자세")){
    d.bonusItems.unshift({
     id:"posture-bonus",title:posture.title==="하루 종일 바른 자세 하기"?"바른 자세":posture.title,
     minutes:posture.reward_minutes,active:posture.active!==false
    });
   }
   posture.was_active_before_move=posture.active!==false;
   posture.moved_to_parent_on=seoulToday();
   posture.active=false;
   posture.moved_to_parent_bonus=true;
   // Clear obsolete requests without erasing past approved completions.
   d.checks.filter(c=>c.habit_id==="posture"&&c.status==="pending").forEach(c=>{c.status="rejected";c.reviewed_at=new Date().toISOString();});
  }
 }
 d.version=7;
 return d;
}
function readLocal(){
 const raw=localStorage.getItem(STORE);let d;
 if(!raw)d=fresh();
 else{try{d=JSON.parse(raw);}catch(_){throw Error("저장된 기록을 읽을 수 없습니다.");}
 if(!validate(d))throw Error("기록 형식을 확인해주세요.");
 migrate(d);}
 if(!validate(d))throw Error("기록 형식을 확인해주세요.");
 if(!raw||d.version!==JSON.parse(raw).version)localStorage.setItem(STORE,JSON.stringify(d));
 return d;
}
function read(){
 if(hasSyncToken()){
  if(!serverReady||!serverState)throw Error("저장된 데이터를 아직 불러오지 못했습니다.");
  return copyState(serverState);
 }
 return readLocal();
}
function save(d){
 if(hasSyncToken()){
  if(!serverReady||!syncOnline||navigator.onLine===false)
   throw Error("온라인 연결이 필요합니다. 최신 내용을 확인한 뒤 다시 시도해주세요.");
  if(role()!=="parent")throw Error("아이 체크는 DB의 전용 체크 기능을 사용해야 합니다.");
  serverState=copyState(d);
  enqueueParentSave(d);
  return;
 }
 localStorage.setItem(STORE,JSON.stringify(d));
}
function role(){
 return childPreview||(hasSyncToken()&&serverDevice?serverDevice.role==="child":localStorage.getItem(MODE)==="child")?"child":"parent";
}
function previewChild(){
 if(role()!=="parent")return;
 // Temporary interactive child session opened by the parent; device role is unchanged.
 childPreview=true;
 screen="today";statsAnchor=seoulToday();viewDay=seoulToday();render();
}
function returnToParent(){
 if(!childPreview||localStorage.getItem(MODE)==="child")return;
 childPreview=false;
 screen="today";viewDay=seoulToday();statsAnchor=seoulToday();render();
}
function dateLabel(day){return Number(day.slice(5,7))+"월 "+Number(day.slice(8,10))+"일";}
function time(n){n=Number(n)||0;return (n<0?"−":"")+(Math.abs(n)<60?Math.abs(n)+"분":Math.floor(Math.abs(n)/60)+"시간"+(Math.abs(n)%60?" "+Math.abs(n)%60+"분":""));}
function totals(d){return d.ledger.reduce((s,l)=>s+(Number(l.minutes)||0),0);}
function check(d,hid,day){return d.checks.find(c=>c.habit_id===hid&&c.day===day);}
function checkKey(hid,day){return day+"|"+hid;}
function checked(d,hid,day){return d.subchecks[checkKey(hid,day)]||[];}
function log(d,kind,minutes,description,day,checkId,extra){
 d.ledger.unshift(Object.assign({id:uid(),kind,minutes,description,day,check_id:checkId||null,
  actor_id:"personal-parent",created_at:new Date().toISOString()},extra||{}));
}
function actionDate(value){
 if(!value)return null;
 const date=new Date(value);if(Number.isNaN(date.getTime()))return null;
 const parts=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(date).map(p=>[p.type,p.value]));
 return parts.year+"-"+parts.month+"-"+parts.day;
}
function sameActionDay(value){return actionDate(value)===seoulToday();}
function canCancelLedger(l){return !!l&&["habit","bonus","penalty","spend"].includes(l.kind)&&sameActionDay(l.created_at);}
function undoCheck(d,c){
 const h=d.habits.find(h=>h.id===c.habit_id);
 d.ledger=d.ledger.filter(l=>!(l.kind==="habit"&&l.check_id===c.id));
 d.checks=d.checks.filter(x=>x.id!==c.id);
 const k=checkKey(c.habit_id,c.day);
 d.subchecks[k]=[];if(d.subcheckTimes)d.subcheckTimes[k]={};
 if(h?.rotation)Object.keys(d.studyDays||{}).filter(x=>x>c.day).forEach(x=>delete d.studyDays[x]);
}
function cancelLedger(id){
 requireParent();const d=read(),entry=d.ledger.find(l=>l.id===id);
 if(!entry)throw Error("기록을 찾을 수 없습니다.");
 if(!canCancelLedger(entry))throw Error("적용한 당일에만 취소할 수 있습니다.");
 if(!confirm(entry.description+" ("+(entry.minutes>0?"+":"")+entry.minutes+"분)\n취소하면 이 기록이 삭제됩니다. 계속할까요?"))return false;
 if(entry.kind==="habit"){
  const c=d.checks.find(x=>x.id===entry.check_id&&x.status==="approved");
  if(!c)throw Error("완료 내역을 찾을 수 없습니다.");
  undoCheck(d,c);
 }else d.ledger=d.ledger.filter(l=>l.id!==entry.id);
 save(d);render();notify("기록을 취소했습니다.");return true;
}
function requireParent(){if(role()!=="parent")throw Error("부모 화면에서만 사용할 수 있습니다.");}
function habit(d,hid){const h=d.habits.find(x=>x.id===hid&&x.active);if(!h)throw Error("항목을 찾지 못했습니다.");return h;}
// Each standalone item is mandatory; each named group counts as one requirement.
function taskUnits(h){
 const units=[],groups=new Map();
 for(const item of h.items||[]){
  const title=String(item.group||"").trim();
  if(!title){units.push({title:"",items:[item]});continue;}
  if(!groups.has(title)){
   const group={title,items:[]};
   units.push(group);groups.set(title,group);
  }
  groups.get(title).items.push(item);
 }
 return units;
}
function selectedTaskItems(h,ids){
 const done=new Set(ids||[]);
 return taskUnits(h).map(group=>group.items.find(i=>done.has(i.id))).filter(Boolean);
}
function taskUnitsDone(h,ids){
 const done=new Set(ids||[]);
 return taskUnits(h).every(group=>group.items.some(i=>done.has(i.id)));
}
function shownItems(d,h,day){return h.items||[];}
function pushCheck(d,h,day){
 let c=check(d,h.id,day);
 if(c&&c.status==="approved")return;
 if(!c){c={id:uid(),habit_id:h.id,day,status:"pending",awarded_minutes:0,submitted_at:new Date().toISOString(),reviewed_at:null,reviewed_by:null};d.checks.push(c);}
 else{c.status="pending";c.submitted_at=new Date().toISOString();c.reviewed_at=null;c.reviewed_by=null;}
}
function toggleItem(hid,itemId){
 if(role()!=="child")return;
 if(hasSyncToken()){void submitChildChange("toggle",hid,itemId);return;}
 const d=read(),day=seoulToday(),h=habit(d,hid),items=shownItems(d,h,day),existing=check(d,hid,day);
 if(existing&&existing.status==="approved")return;
 if(!items.some(i=>i.id===itemId))return;
 const k=checkKey(hid,day),done=new Set(checked(d,hid,day)),stamp=new Date().toISOString();
 if(!d.subcheckTimes[k])d.subcheckTimes[k]={};
 if(done.has(itemId)){done.delete(itemId);delete d.subcheckTimes[k][itemId];}
 else{
  const group=String(items.find(i=>i.id===itemId)?.group||"").trim();
  if(group)items.filter(i=>String(i.group||"").trim()===group).forEach(i=>{
   done.delete(i.id);delete d.subcheckTimes[k][i.id];
  });
  done.add(itemId);d.subcheckTimes[k][itemId]=stamp;
 }
 d.subchecks[k]=Array.from(done);
 if(taskUnitsDone(h,done)){
  pushCheck(d,h,day);
  const c=check(d,hid,day);if(c)c.completed_items=selectedTaskItems(h,done).map(i=>({title:i.title,at:d.subcheckTimes[k][i.id]||stamp}));
  signalParent(h.title);
 }
 else if(existing&&existing.status==="pending")d.checks=d.checks.filter(x=>x!==existing);
 save(d);if(!refreshChildCheckView(d))render();
}
function submitSimple(hid){
 if(role()!=="child")return;
 if(hasSyncToken()){void submitChildChange("complete",hid);return;}
 const d=read(),day=seoulToday(),h=habit(d,hid);
 if(h.items.length)return;
 const c=check(d,hid,day);
 if(c&&c.status==="pending")d.checks=d.checks.filter(x=>x!==c);
 else if(!c||c.status==="rejected"){pushCheck(d,h,day);signalParent(h.title);}
 save(d);if(!refreshChildCheckView(d))render();
}
function review(hid,status){
 requireParent();const d=read(),h=habit(d,hid),day=viewDay,c=check(d,hid,day);
 if(!c||!["pending","approved"].includes(c.status))return;
 if(status==="approved"&&c.status==="pending"){
  c.status="approved";c.awarded_minutes=h.reward_minutes;
  if(!Array.isArray(c.completed_items)){
   const done=new Set(checked(d,h.id,day)),k=checkKey(h.id,day);
   c.completed_items=selectedTaskItems(h,done).map(i=>({title:i.title,at:d.subcheckTimes[k]?.[i.id]||c.submitted_at||new Date().toISOString()}));
  }
  c.confirmed_items=Array.from(c.completed_items);
  log(d,"habit",h.reward_minutes,h.title,day,c.id,{details:c.completed_items});
  c.reviewed_at=new Date().toISOString();c.reviewed_by="personal-parent";
 }
 if(status==="rejected"){
  if(c.status==="approved"){
   if(!sameActionDay(c.reviewed_at))throw Error("확인한 당일에만 취소할 수 있습니다.");
   if(!confirm(h.title+" 완료를 취소할까요?\n적립 기록이 삭제됩니다."))return;
   undoCheck(d,c);
  }else{
   c.status="rejected";c.awarded_minutes=0;
   d.subchecks[checkKey(hid,day)]=[];d.subcheckTimes[checkKey(hid,day)]={};
   c.reviewed_at=new Date().toISOString();c.reviewed_by="personal-parent";
  }
 }
 save(d);render();
}
function applyBonusItem(itemId,reason){
 requireParent();
 const d=read(),item=d.bonusItems.find(x=>x.id===itemId&&x.active);
 if(!item)throw Error("등록된 부모 관리 보너스 항목만 사용할 수 있습니다.");
 const desc=String(reason||"").trim();
 if(desc.length>100)throw Error("사유는 100자 이하로 입력해주세요.");
 log(d,item.minutes>0?"bonus":"penalty",item.minutes,item.title,seoulToday(),null,{bonus_item_id:item.id,reason:desc});
 save(d);render();
}
function saveBonusItem(data){
 requireParent();
 const d=read(),title=String(data.title||"").trim(),n=Number(data.minutes),sign=data.type==="add"?1:-1;
 if(!title||title.length>80||!Number.isInteger(n)||n<1||n>300)throw Error("항목 이름과 시간을 확인해주세요.");
 if(data.id){
  const current=d.bonusItems.find(x=>x.id===data.id);
  if(!current)throw Error("보너스 항목을 찾을 수 없습니다.");
  current.title=title;current.minutes=sign*n;
  if(typeof data.active==="boolean")current.active=data.active;
 }else d.bonusItems.push({id:uid(),title,minutes:sign*n,active:true});
 save(d);render();
}
function useTime(minutes){
 requireParent();const n=Number(minutes),d=read();
 if(!Number.isInteger(n)||n<1||n>300)throw Error("사용 시간을 확인해주세요.");
 if(n>Math.max(0,totals(d)))throw Error("남은 시간보다 많습니다.");
 log(d,"spend",-n,"보너스 시간 사용",seoulToday(),null,{reason:""});
 save(d);render();
}

function signalParent(title){
 notify("부모 체크됨 · "+title);
}
function setHabit(data){
 requireParent();const d=read(),prev=data.id?d.habits.find(x=>x.id===data.id):null;
 const title=String(data.title||"").trim(),minutes=Number(data.minutes),titles=String(data.items||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(!title||title.length>80||!Number.isInteger(minutes)||minutes<1||minutes>180||titles.length>20||titles.some(x=>x.length>48))throw Error("항목·시간을 확인해주세요.");
 const items=titles.map((t,i)=>({id:prev?.items[i]?.id||uid(),title:t}));
 if(prev){prev.title=title;prev.reward_minutes=minutes;prev.items=items;prev.active=data.active;}
 else d.habits.push({id:uid(),title,reward_minutes:minutes,sort_order:d.habits.length+1,created_on:seoulToday(),active:true,items});
 save(d);render();
}
function el(label,cls,action,attr=""){return '<button type="button" class="'+cls+'" data-action="'+action+'" '+attr+'>'+label+'</button>';}
function dragHandle(kind,label){
 return '<button type="button" class="drag-handle" data-drag-kind="'+safe(kind)+
  '" aria-label="'+safe(label)+' 순서 변경, 드래그하거나 방향키 사용" title="끌어서 순서 변경">⠿</button>';
}
function displaySections(d){
 const allowed=["habits","oneTime","bonuses"],stored=Array.isArray(d.displaySections)?d.displaySections:[];
 return [...new Set([...stored.filter(k=>allowed.includes(k)),...allowed])];
}
const dragRules={
 tasks:{row:".bulk-task-row",parent:"#bulkTasks"},
 bonuses:{row:".bulk-bonus-row",parent:"#bulkBonuses"},
 subitems:{row:".bulk-subitem",parent:".bulk-subitems"},
 sections:{row:".bulk-section-order-row",parent:"#bulkSections"}
};
let activeDrag=null;
function dragItems(container,rule){
 return Array.from(container.children).filter(node=>node.matches(rule.row));
}
function dragContext(handle){
 const kind=handle.dataset.dragKind,rule=dragRules[kind];
 if(!rule)return null;
 const row=handle.closest(rule.row),container=row?.parentElement;
 return row&&container?.matches(rule.parent)?{kind,rule,row,container}:null;
}
function dragRowName(row,kind){
 if(kind==="tasks"||kind==="bonuses")
  return row.querySelector(".bulk-summary-title")?.textContent||"할 일";
 if(kind==="subitems")return row.querySelector('[name="sub-title"]')?.value||"하위 항목";
 if(kind==="sections")return row.querySelector("strong")?.textContent||"화면 구역";
 return row.querySelector("strong")?.textContent||"할 일";
}
function beginRowDrag(event){
 const handle=event.target.closest?.(".drag-handle");
 // Sorting stays in the parent editor; subitem grips also work inside
 // the temporary detail dialog where their fields are edited.
 const inList=handle?.closest("#bulkForm");
 const inDetail=handle?.dataset.dragKind==="subitems"&&handle?.closest("#bulkDetailModal");
 if((!inList&&!inDetail)||role()!=="parent"||
    event.isPrimary===false||event.button!==0||activeDrag)return;
 const context=dragContext(handle);
 if(!context)return;
 activeDrag={...context,pointerId:event.pointerId,startX:event.clientX,startY:event.clientY,
  original:dragItems(context.container,context.rule),started:false,preview:null};
 event.preventDefault();event.stopPropagation();
}
function moveRowDrag(event){
 const drag=activeDrag;
 if(!drag||event.pointerId!==drag.pointerId)return;
 if(!drag.started&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)<7)return;
 event.preventDefault();
 if(!drag.started){
  drag.started=true;
  drag.row.classList.add("drag-source");
  document.documentElement.classList.add("sort-drag-active");
  const preview=document.createElement("div");
  preview.className="sort-drag-preview";
  preview.textContent=dragRowName(drag.row,drag.kind);
  preview.style.width=Math.min(280,Math.max(150,drag.row.getBoundingClientRect().width))+"px";
  document.body.appendChild(preview);
  drag.preview=preview;
 }
 if(drag.preview){
  drag.preview.style.left=Math.max(8,Math.min(window.innerWidth-160,event.clientX+12))+"px";
  drag.preview.style.top=Math.max(8,Math.min(window.innerHeight-54,event.clientY+12))+"px";
 }
 const scroll=drag.container.closest(".bulk-section");
 if(scroll){
  const bounds=scroll.getBoundingClientRect();
  if(event.clientY<bounds.top+40)scroll.scrollTop-=15;
  else if(event.clientY>bounds.bottom-40)scroll.scrollTop+=15;
 }else{
  if(event.clientY<40)window.scrollBy(0,-14);
  else if(event.clientY>window.innerHeight-40)window.scrollBy(0,14);
 }
 const rect=drag.container.getBoundingClientRect();
 if(event.clientX<rect.left-28||event.clientX>rect.right+28||
    event.clientY<rect.top-32||event.clientY>rect.bottom+32)return;
 const peers=dragItems(drag.container,drag.rule).filter(node=>node!==drag.row);
 const before=peers.find(node=>{
  const b=node.getBoundingClientRect();
  return event.clientY<b.top+b.height/2;
 });
 if(before)drag.container.insertBefore(drag.row,before);
 else drag.container.appendChild(drag.row);
}
function finishRowDrag(event,cancelled=false){
 const drag=activeDrag;if(!drag||event.pointerId!==drag.pointerId)return;
 activeDrag=null;
 const changed=drag.original.some((node,i)=>node!==dragItems(drag.container,drag.rule)[i]);
 drag.preview?.remove();
 drag.row.classList.remove("drag-source");
 document.documentElement.classList.remove("sort-drag-active");
 if(cancelled){
  if(changed)drag.original.forEach(node=>drag.container.appendChild(node));
  return;
 }
 if(!drag.started||!changed)return;
 try{
  bulkDirty(document.getElementById("bulkForm"));
 }catch(err){render();notify(err.message||"정렬을 저장하지 못했습니다.");}
}
function keyboardRowDrag(event){
 if(!["ArrowUp","ArrowDown"].includes(event.key)||role()!=="parent")return;
 const handle=event.target.closest?.(".drag-handle");
 const inList=handle?.closest("#bulkForm");
 const inDetail=handle?.dataset.dragKind==="subitems"&&handle?.closest("#bulkDetailModal");
 if(!inList&&!inDetail)return;
 const context=dragContext(handle);
 if(!context)return;
 if(!["ArrowUp","ArrowDown"].includes(event.key))return;
 event.preventDefault();event.stopPropagation();
 const peers=dragItems(context.container,context.rule),index=peers.indexOf(context.row);
 const previous=event.key==="ArrowUp";
 const other=peers[index+(previous?-1:1)];
 if(!other)return;
 if(previous)context.container.insertBefore(context.row,other);
 else context.container.insertBefore(other,context.row);
 bulkDirty(document.getElementById("bulkForm"));handle.focus();
}
function status(c){return c?.status==="approved"?"완료":c?.status==="rejected"?"다시 하기":"";}
function renderTask(d,h,day,r){
 const c=check(d,h.id,day),items=shownItems(d,h,day),
  done=new Set(checked(d,h.id,day)),isParent=r==="parent",state=status(c),
  complete=c?.status==="approved",pending=c?.status==="pending",
  allTicked=complete||(items.length>0?taskUnitsDone(h,done):pending);
 // For legacy approved records, restore visible ticks from saved item titles
 // only if the original subcheck ID list is unavailable.
 if(complete&&items.length&&!done.size){
  const snapshots=Array.isArray(c?.completed_items)?c.completed_items:
    Array.isArray(c?.confirmed_items)?c.confirmed_items:[];
  const remaining=new Set(items.map(item=>item.id));
  for(const snap of snapshots){
   const item=items.find(candidate=>remaining.has(candidate.id)&&candidate.title===snap.title);
   if(item){done.add(item.id);remaining.delete(item.id);}
  }
 }
 const checkedMark='<span class="dot '+(allTicked?"on":"")+'">'+(allTicked?"✓":"")+'</span>';
 const label='<span class="task-name">'+safe(h.title)+'</span>';
 const titleRow=!isParent&&items.length===0?
  '<button type="button" class="task-label task-click task-single-check" data-action="complete" data-id="'+safe(h.id)+'" aria-label="'+safe(h.title)+' 완료 체크" aria-pressed="'+(allTicked?"true":"false")+'" '+(complete?"disabled":"")+'>'+checkedMark+label+'</button>':
  '<div class="task-label">'+checkedMark+label+'</div>';
 const actions=[];
 // Editing is available in one separate parent settings window.
 let detail="";
 if(items.length){
  const units=taskUnits(h);
  detail='<div class="subtasks grouped-subtasks">'+units.map(unit=>{
   const isGroup=!!unit.title,selected=unit.items.some(item=>done.has(item.id));
   const option=item=>{
    const checkedNow=done.has(item.id),marked=complete&&(isGroup?checkedNow: true)||checkedNow;
    const dot='<span class="dot '+(marked?"on":"")+'">'+(marked?"✓":"")+'</span>';
    const label=dot+'<span>'+safe(item.title)+'</span>';
    return isParent?
     '<div class="subitem habit-subitem">'+label+'</div>':
     '<button type="button" class="subitem selectable habit-subitem" data-action="toggle" data-id="'+safe(h.id)+'" data-item="'+safe(item.id)+'" aria-pressed="'+(marked?"true":"false")+'" '+(complete?"disabled":"")+'>'+label+'</button>';
   };
   if(!isGroup)return option(unit.items[0]);
   return '<div class="subgroup '+(selected||complete?"subgroup-done":"")+'">'+
    '<div class="subgroup-heading"><strong>'+safe(unit.title)+'</strong>'+
    '<small>하나만 선택</small></div>'+
    '<div class="subgroup-options">'+unit.items.map(option).join("")+'</div></div>';
  }).join("")+'</div>';
 }
 let actionsBottom="";
 if(isParent&&pending)actionsBottom='<div class="task-foot">'+el("확인","primary","review",'data-id="'+safe(h.id)+'" data-status="approved"')+'</div>';
 else if(isParent&&complete&&sameActionDay(c?.reviewed_at))actionsBottom='<div class="task-foot">'+el("완료 취소","ghost","review",'data-id="'+safe(h.id)+'" data-status="rejected"')+'</div>';
 return '<article data-habit-id="'+safe(h.id)+'" class="task habit-card '+(items.length?"task-has-subitems ":"")+(complete?"task-done":pending?"task-checked":c?.status==="rejected"?"task-retry":"")+'"><div class="task-top">'+titleRow+
  '<div class="right">'+(state?'<span class="state '+(complete?"done":"")+'">'+state+'</span>':'')+
  '<span class="reward">+'+h.reward_minutes+'분</span>'+actions.join("")+'</div></div>'+
  detail+actionsBottom+'</article>';
}
/* Keep child checkboxes and parent task cards mounted during a check. */
function refreshChildCheckView(d){
 const view=app.querySelector(".view-child.screen-today");
 if(!view||role()!=="child")return false;
 const today=seoulToday();
 const active=d.habits.filter(h=>h.active).sort((a,b)=>a.sort_order-b.sort_order);
 const nodes=Array.from(view.querySelectorAll(".tasks .task[data-habit-id]"));
 if(nodes.length!==active.length)return false;
 const prepared=[];
 for(const h of active){
  const card=nodes.find(node=>node.dataset.habitId===h.id);
  if(!card)return false;
  const c=check(d,h.id,today),approved=c?.status==="approved";
  if(approved){
   if(!card.classList.contains("task-done"))return false;
   prepared.push({card,approved:true});
   continue;
  }
  const options=Array.from(card.querySelectorAll('button.subitem[data-action="toggle"]'));
  if((h.items||[]).length!==options.length)return false;
  const groups=taskUnits(h).filter(unit=>!!unit.title);
  const groupNodes=Array.from(card.querySelectorAll(".subtasks .subgroup"));
  if(groups.length!==groupNodes.length)return false;
  prepared.push({h,card,c,options,groups,groupNodes,done:new Set(checked(d,h.id,today))});
 }
 const progress=view.querySelector(".child-progress");
 const progressValue=progress?.querySelector(".child-progress-top strong");
 const progressRate=progress?.querySelector(".child-progress-top > span");
 const progressTrack=progress?.querySelector(".child-progress-track");
 const progressBar=progressTrack?.querySelector("span");
 const progressCounts=progress?.querySelectorAll(".child-progress-states b");
 if(!progressValue||!progressRate||!progressTrack||!progressBar||progressCounts?.length!==2)return false;
 const setDot=(node,on)=>{
  if(!node)return;
  node.classList.toggle("on",on);
  node.textContent=on?"✓":"";
 };
 prepared.forEach(entry=>{
  if(entry.approved)return;
  const {h,card,c,options,groups,groupNodes,done}=entry;
  // Empty tasks have no individual checks; reflect only the pending state.
  const pending=c?.status==="pending",
   complete=(h.items||[]).length===0?pending:(pending||taskUnitsDone(h,done));
  card.classList.toggle("task-checked",pending);
  card.classList.toggle("task-retry",c?.status==="rejected");
  card.classList.remove("task-done");
  setDot(card.querySelector(".task-top .task-label .dot"),complete);
  card.querySelector(".task-click")?.setAttribute("aria-pressed",String(complete));
  options.forEach(button=>{
   const marked=done.has(button.dataset.item);
   button.setAttribute("aria-pressed",String(marked));
   setDot(button.querySelector(".dot"),marked);
  });
  groups.forEach((group,index)=>{
   groupNodes[index].classList.toggle("subgroup-done",group.items.some(item=>done.has(item.id)));
  });
 });
 const {done,total,confirmed,waiting,percent}=childProgressNumbers(d,active,today);
 progressValue.innerHTML=done+' <span>/ '+total+'</span>';
 progressRate.textContent=percent+"%";
 progressTrack.setAttribute("aria-valuemax",String(total));
 progressTrack.setAttribute("aria-valuenow",String(done));
 progressBar.style.width=percent+"%";
 progressCounts[0].textContent=String(confirmed);
 progressCounts[1].textContent=String(waiting);
 return true;
}
function refreshChildCheckSync(before,after,previousRole){
 if(!before||previousRole!=="child"||role()!=="child"||screen!=="today")return false;
 // Any other structural change must still be rendered normally.
 const structural=["habits","bonusItems","oneTimeTasks","ledger","displaySections","started_on","studyDays"];
 if(structural.some(key=>JSON.stringify(before[key])!==JSON.stringify(after[key])))return false;
 return refreshChildCheckView(after);
}
function archivedHabitsOn(d,day){
 return d.habits.filter(h=>h.moved_to_parent_bonus&&h.was_active_before_move&&
  (day<h.moved_to_parent_on||(day===h.moved_to_parent_on&&check(d,h.id,day)?.status==="approved")));
}
function dailyCompletion(d,active,day){
 const current=seoulToday();
 const relevant=active.concat(archivedHabitsOn(d,day).filter(h=>!active.some(x=>x.id===h.id)));
 const result={day,totalTasks:0,approvedTasks:0,waitingTasks:0,totalSteps:0,tickedSteps:0,byId:{}};
 relevant.forEach(h=>{
  const available=day<=current&&day>=d.started_on&&day>=(h.created_on||d.started_on);
  const assignedSteps=shownItems(d,h,day);
  const stepCount=Math.max(1,taskUnits(h).length);
  if(!available){result.byId[h.id]={status:"out",steps:0,total:stepCount};return;}
  const c=check(d,h.id,day),status=c?.status||"";
  const ids=new Set(checked(d,h.id,day));
  // A grouped set of alternatives contributes one completed step.
  let ticked=0;
  if(status==="approved"||status==="pending")ticked=stepCount;
  else if(assignedSteps.length){
   ticked=taskUnits(h).filter(group=>group.items.some(item=>ids.has(item.id))).length;
  }
  result.totalTasks++;
  result.totalSteps+=stepCount;
  result.tickedSteps+=Math.min(stepCount,ticked);
  if(status==="approved")result.approvedTasks++;
  if(status==="pending")result.waitingTasks++;
  const view=status==="approved"?"approved":status==="pending"?"pending":
   status==="rejected"?"rejected":ticked?"partial":"none";
  result.byId[h.id]={status:view,steps:ticked,total:stepCount};
 });
 result.completedPercent=result.totalTasks?Math.round(result.approvedTasks/result.totalTasks*100):null;
 result.checkedPercent=result.totalSteps?Math.round(result.tickedSteps/result.totalSteps*100):null;
 return result;
}
function periodCompletion(d,active,start,end){
 let planned=0,confirmed=0,steps=0,checkedSteps=0,waiting=0,days=0;
 for(let cursor=start;cursor<=end;cursor=nextDay(cursor)){
  const m=dailyCompletion(d,active,cursor);
  if(!m.totalTasks)continue;
  days++;planned+=m.totalTasks;confirmed+=m.approvedTasks;
  steps+=m.totalSteps;checkedSteps+=m.tickedSteps;waiting+=m.waitingTasks;
 }
 return {days,planned,confirmed,steps,checkedSteps,waiting,
  percent:planned?Math.round(confirmed/planned*100):null,
  checkedPercent:steps?Math.round(checkedSteps/steps*100):null};
}

/* Behavioral score: awarded task/bonus minutes minus penalties, NEVER time spent. */
function scoreEntries(d,start,end){
 return d.ledger.filter(l=>l.kind!=="spend" && Number.isFinite(Number(l.minutes)) &&
  Number(l.minutes)!==0 && l.day>=start && l.day<=end);
}
function scoreTotals(d,start,end){
 const rows=scoreEntries(d,start,end);
 return rows.reduce((a,l)=>{
  const n=Number(l.minutes);
  if(n>0)a.earned+=n;else a.penalty+=-n;
  a.net+=n;a.count++;
  return a;
 },{earned:0,penalty:0,net:0,count:0});
}
function rewardDay(d,day){
 const entries=scoreEntries(d,day,day),groups=new Map(),sums=scoreTotals(d,day,day);
 for(const l of entries){
  const n=Number(l.minutes),name=String(l.description||"보너스"),
   key=(n>=0?"+":"-")+"|"+name;
  const g=groups.get(key)||{title:name,count:0,minutes:0,reasons:new Set()};
  g.count++;g.minutes+=n;
  if(l.reason)g.reasons.add(String(l.reason));
  groups.set(key,g);
 }
 return {...sums,day,groups:Array.from(groups.values())};
}
function signedMinutes(n){return (n>0?"+":"")+n+"분";}
function scoreTag(group){
 const positive=group.minutes>=0,cl=positive?"gain":"loss";
 const reasons=Array.from(group.reasons||[]);
 const tooltip=group.title+(group.count>1?" "+group.count+"회":"")+
  " "+signedMinutes(group.minutes)+(reasons.length?" · "+reasons.join(" / "):"");
 return '<span class="score-tag tag-'+cl+'" title="'+safe(tooltip)+'" aria-label="'+safe(tooltip)+'">'+
  '<span>'+safe(group.title)+'</span>'+
  (group.count>1?'<small>'+group.count+'회</small>':"")+
  '<b>'+signedMinutes(group.minutes)+'</b></span>';
}
function behaviorSeries(d,start,end){
 const today=seoulToday(),limit=end<today?end:today;
 if(start>limit)return {days:[],opening:0,closing:0};
 let accumulated=d.ledger.filter(l=>l.kind!=="spend"&&l.day<start)
   .reduce((sum,l)=>sum+(Number(l.minutes)||0),0);
 const opening=accumulated,days=[];
 for(let day=start;day<=limit;day=nextDay(day)){
  const b=rewardDay(d,day);accumulated+=b.net;
  days.push({...b,accumulated});
 }
 return {days,opening,closing:accumulated};
}
function weekChange(d,start,end){
 const current=scoreTotals(d,start,end),
  previous=scoreTotals(d,nextDay(start,-7),nextDay(start,-1)),
  minutes=current.net-previous.net;
 const rate=previous.net===0?null:Math.round(minutes/Math.abs(previous.net)*100);
 return {current,previous,minutes,rate};
}
function renderBehaviorSummary(d,start,end){
 const b=weekChange(d,start,end);
 const delta=b.minutes,changeLabel=(delta>0?"+":"")+delta+"분",
  rateLabel=b.rate===null?"":' ('+(b.rate>0?"+":"")+b.rate+'%)';
 return '<div class="behavior-summary">'+
  '<div><small>상점</small><strong class="positive">+'+b.current.earned+'분</strong></div>'+
  '<div><small>벌점</small><strong class="negative">−'+b.current.penalty+'분</strong></div>'+
  '<div><small>순획득</small><strong class="'+(b.current.net>=0?"positive":"negative")+'">'+signedMinutes(b.current.net)+'</strong></div>'+
  '</div><div class="behavior-week-compare">지난주 대비 <strong class="'+(delta>0?"positive":delta<0?"negative":"")+'">'+
  changeLabel+rateLabel+'</strong></div>';
}
function renderDayScoreTags(d,start,end){
 const days=behaviorSeries(d,start,end).days;
 return '<div class="score-day-list">'+days.map(day=>{
  const tags=day.groups.map(scoreTag).join(""),
   net=day.net===0?"0분":signedMinutes(day.net);
  return '<div class="score-day-row"><strong>'+dateLabel(day.day)+'</strong>'+
   '<div class="score-day-tags">'+(tags||'<span class="score-empty">기록 없음</span>')+'</div>'+
   '<b class="'+(day.net>0?"positive":day.net<0?"negative":"")+'">'+net+'</b></div>';
 }).join("")+'</div>';
}
function svgBehaviorCharts(d,start,end){
 const {days,opening}=behaviorSeries(d,start,end);
 if(!days.length)return '<p class="empty">기록 없음</p>';
 const count=days.length,width=760,left=33,right=14,top=14,bottom=30,plot=width-left-right;
 const cx=i=>left+(i+.5)*(plot/count),step=plot/count,
  barWidth=Math.max(3,Math.min(12,step*.27)),barsBase=88,
  maxMagnitude=Math.max(1,...days.map(r=>Math.max(r.earned,r.penalty))),
  amountHeight=n=>n/maxMagnitude*65;
 const bars=days.map((day,i)=>{
  const x=cx(i),h1=amountHeight(day.earned),h2=amountHeight(day.penalty),
    title=safe(day.day+' 상점 +'+day.earned+'분, 벌점 −'+day.penalty+'분');
  return '<g><title>'+title+'</title>'+
   '<rect x="'+(x-barWidth-1)+'" y="'+(barsBase-h1)+'" width="'+barWidth+'" height="'+h1+'" rx="2" fill="#378b5c"/>'+
   '<rect x="'+(x+1)+'" y="'+barsBase+'" width="'+barWidth+'" height="'+h2+'" rx="2" fill="#c66865"/></g>';
 }).join("");
 const dates=days.map((day,i)=>(count<=8||i===0||(i+1)%5===0||i===count-1)?
  '<text x="'+cx(i)+'" y="176" text-anchor="middle" font-size="11" fill="#78897b">'+Number(day.day.slice(-2))+'</text>':"").join("");
 const barChart='<svg class="score-svg" viewBox="0 0 '+width+' 184" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="일별 상점과 벌점 막대 그래프">'+
  '<line x1="'+left+'" x2="'+(width-right)+'" y1="'+barsBase+'" y2="'+barsBase+'" stroke="#d3ded5"/>'+
  bars+dates+'</svg>';
 const values=[opening,...days.map(x=>x.accumulated)],
   lo=Math.min(...values),hi=Math.max(...values),
   min=lo===hi?lo-1:lo,max=lo===hi?hi+1:hi,
   y=v=>top+(132-top)*(max-v)/(max-min);
 const points=days.map((day,i)=>({x:cx(i),y:y(day.accumulated),day})),
  path='<polyline points="'+points.map(p=>p.x+','+p.y).join(" ")+'" fill="none" stroke="#326d99" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
 const dots=points.map(p=>'<g><title>'+safe(p.day.day+" 누적 "+signedMinutes(p.day.accumulated))+'</title>'+
  '<circle cx="'+p.x+'" cy="'+p.y+'" r="'+(count<=8?4:2.5)+'" fill="#326d99"/></g>').join("");
 const guide=[min,max].map(n=>'<text x="28" y="'+(y(n)+4)+'" text-anchor="end" font-size="11" fill="#768578">'+n+'</text>').join("");
 const lineChart='<svg class="score-svg" viewBox="0 0 '+width+' 184" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="사용 시간 제외 누적 행동점수 변화 그래프">'+
  guide+path+dots+dates+'</svg>';
 return '<div class="behavior-charts"><div class="score-chart"><h3>일별 상점·벌점</h3><div class="chart-key">'+
  '<span class="key-gain">상점</span><span class="key-loss">벌점</span></div>'+barChart+'</div>'+
  '<div class="score-chart"><h3>누적 행동점수</h3>'+lineChart+'</div></div>';
}
function monthlyScoreCalendar(d,range){
 const start=new Date(range.start+"T12:00:00Z").getUTCDay(),
  offset=(start+6)%7,daysCount=Number(range.end.slice(-2)),
  cells=Math.ceil((offset+daysCount)/7)*7,
  labels=["월","화","수","목","금","토","일"],
  header=labels.map(label=>'<span class="score-calendar-weekday">'+label+'</span>').join("");
 const month=Array.from({length:cells},(_,i)=>{
  const n=i-offset+1;
  if(n<1||n>daysCount)return '<div class="score-calendar-empty" aria-hidden="true"></div>';
  const day=range.start.slice(0,8)+String(n).padStart(2,"0"),
   info=rewardDay(d,day),tags=info.groups.map(scoreTag).join("");
  return '<div class="score-calendar-day '+(day===seoulToday()?"is-today":"")+'">'+
   '<strong>'+n+'</strong>'+(tags?'<div class="score-calendar-tags">'+tags+'</div>':"")+
   (tags?'<span class="score-day-net '+(info.net>0?"positive":info.net<0?"negative":"")+'">'+signedMinutes(info.net)+'</span>':"")+
   '</div>';
 }).join("");
 return '<div class="score-month-calendar" aria-label="날짜별 상벌 기록 달력">'+header+month+'</div>';
}

function renderWeeklyChecklist(d,active,anchor){
 const range=period("week",anchor),days=Array.from({length:7},(_,i)=>nextDay(range.start,i)),
  byDay=days.map(day=>dailyCompletion(d,active,day)),overall=periodCompletion(d,active,range.start,range.end),
  labels=["월","화","수","목","금","토","일"];
 const headers=days.map((day,i)=>'<th scope="col" class="'+(day===seoulToday()?"is-today":"")+'">'+
  labels[i]+'<small>'+Number(day.slice(8,10))+'</small></th>').join("");
 const displayed=active.concat(d.habits.filter(h=>h.moved_to_parent_bonus&&h.was_active_before_move&&
  days.some(day=>day>=d.started_on&&day>=h.created_on&&
   (day<h.moved_to_parent_on||(day===h.moved_to_parent_on&&check(d,h.id,day)?.status==="approved")))));
 const rows=displayed.map(h=>{
  const cells=byDay.map(m=>{
   const state=m.byId[h.id]||{status:"out"},key=state.status;
   const mark=key==="approved"?"✓":key==="pending"?"✓":key==="partial"?
    state.steps+"/"+state.total:key==="rejected"?"다시":"·";
   const accessible=key==="approved"?"완료 기록":key==="pending"?"체크됨":
    key==="partial"?state.steps+"개 체크 / "+state.total+"개":key==="rejected"?"다시 하기":
    key==="out"?"기록 대상 아님":"기록 없음";
   return '<td><span class="week-cell week-'+key+'" title="'+safe(m.day+" "+h.title+" "+accessible)+'" aria-label="'+safe(m.day+" "+h.title+" "+accessible)+'">'+mark+'</span></td>';
  }).join("");
  return '<tr><th scope="row">'+safe(h.title)+'</th>'+cells+'</tr>';
 }).join("");
 const checked=byDay.map(m=>'<td><span class="week-day-rate">'+
  (m.totalTasks?(m.approvedTasks+m.waitingTasks)+"건":"—")+'</span></td>').join("");
 const summary=renderBehaviorSummary(d,range.start,range.end);
 return '<section class="child-weekly"><div class="period-nav">'+
  el("‹","date-button","statprev")+'<strong>'+dateLabel(range.start)+' ~ '+dateLabel(range.end)+'</strong>'+
  el("›","date-button","statnext",range.end>=seoulToday()?"disabled":"")+'</div>'+summary+
  '<div class="week-grid-scroll"><table class="week-matrix"><thead><tr><th scope="col">할 일</th>'+headers+
  '</tr></thead><tbody>'+rows+'</tbody><tfoot><tr><th scope="row">체크 건수</th>'+checked+'</tr></tfoot></table></div>'+
  '<div class="week-legend"><span><b class="week-cell week-approved">✓</b> 완료</span>'+
  '<span><b class="week-cell week-pending">✓</b> 체크됨</span>'+
  '<span><b class="week-cell week-partial">1/4</b> 일부 체크</span></div>'+
  '<div class="group-head"><h2>일별 상벌</h2></div>'+renderDayScoreTags(d,range.start,range.end)+
  '<div class="group-head"><h2>일별 변화</h2></div>'+svgBehaviorCharts(d,range.start,range.end)+'</section>';
}
function renderWeekEvents(d,start,end){
 const events=[];
 d.ledger.filter(l=>l.kind!=="spend"&&l.day>=start&&l.day<=end).forEach(l=>events.push({type:"ledger",day:l.day,
  at:l.created_at||l.day+"T00:00:00Z",item:l}));
 d.checks.filter(c=>c.day>=start&&c.day<=end&&c.status==="pending").forEach(c=>events.push({type:"pending",day:c.day,
  at:c.submitted_at||c.day+"T00:00:00Z",item:c}));
 Object.entries(d.subchecks||{}).forEach(([key,ids])=>{
  const bar=key.indexOf("|");if(bar<0||!Array.isArray(ids)||!ids.length)return;
  const day=key.slice(0,bar),hid=key.slice(bar+1);
  if(day<start||day>end||check(d,hid,day))return;
  const h=d.habits.find(x=>x.id===hid);if(!h)return;
  events.push({type:"partial",day,at:day+"T00:00:00Z",item:{title:h.title,ids,habit:h}});
 });
 events.sort((a,b)=>b.at.localeCompare(a.at));
 const rows=events.map(e=>{
  let title="",note="",amount="",detail="";
  if(e.type==="ledger"){
   const l=e.item,n=Number(l.minutes)||0;
   title=safe(l.description||"보너스");
   amount='<strong class="'+(n>=0?"positive":"negative")+'">'+(n>0?"+":"")+n+'분</strong>';
   note=safe(l.day)+" · "+safe(formatMoment(l.created_at));
   detail=logDetails(d,l);
  }else if(e.type==="pending"){
   const c=e.item,h=d.habits.find(x=>x.id===c.habit_id);
   title=safe(h?.title||"할 일");note=safe(c.day)+" · "+safe(formatMoment(c.submitted_at));
   amount='<span class="waiting">✓</span>';
   if(Array.isArray(c.completed_items)&&c.completed_items.length){
    detail='<div class="log-details">'+c.completed_items.map(x=>
     '<span>✓ '+safe(typeof x==="string"?x:x.title)+'</span>').join("")+'</div>';
   }
  }else{
   const info=e.item;
   title=safe(info.title);note=safe(e.day);amount='<span class="waiting">진행 중</span>';
   detail='<div class="log-details">'+(info.habit.items||[]).filter(x=>info.ids.includes(x.id)).
    map(x=>'<span>✓ '+safe(x.title)+'</span>').join("")+'</div>';
  }
  return '<div class="week-event"><div><strong>'+title+'</strong><small>'+note+'</small>'+detail+'</div>'+amount+'</div>';
 }).join("");
 return '<div class="week-events">'+(rows||'<p class="empty">기록 없음</p>')+'</div>';
}
function monthlyWeeks(d,active,anchor){
 const range=period("month",anchor),parts=[];
 for(let start=range.start;start<=range.end;){
  const weekEnd=period("week",start).end,
   end=weekEnd<=range.end?weekEnd:range.end;
  parts.push({start,end,label:dateLabel(start)+' ~ '+dateLabel(end),
   metrics:periodCompletion(d,active,start,end)});
  start=nextDay(end);
 }
 return {range,weeks:parts};
}
function weeklyTrendSvg(weeks){
 const values=weeks.map(w=>w.metrics.confirmed+w.metrics.waiting),
  max=Math.max(1,...values),width=640,height=232,left=42,right=18,top=20,bottom=36,
  x=i=>left+(width-left-right)*(weeks.length===1?.5:i/(weeks.length-1)),
  y=n=>top+(height-top-bottom)*(max-n)/max;
 const guides=Array.from(new Set([0,Math.ceil(max/2),max])).map(n=>
  '<line x1="'+left+'" x2="'+(width-right)+'" y1="'+y(n)+'" y2="'+y(n)+'" stroke="#e1e9e2" stroke-width="1"/>'+
  '<text x="'+(left-9)+'" y="'+(y(n)+4)+'" text-anchor="end" font-size="12" fill="#79877e">'+n+'</text>').join("");
 const points=values.map((value,i)=>({x:x(i),y:y(value)})),
  poly='<polyline points="'+points.map(p=>p.x+','+p.y).join(" ")+'" fill="none" stroke="#2e8056" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
  dots=points.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="5" fill="#2e8056" stroke="white" stroke-width="2.3"/>').join(""),
  labels=weeks.map((w,i)=>'<text x="'+x(i)+'" y="'+(height-10)+'" text-anchor="middle" font-size="13" fill="#62776a">'+(i+1)+'주</text>').join("");
 return '<svg class="completion-svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="주별 할 일 체크 건수 변화" xmlns="http://www.w3.org/2000/svg">'+
  guides+poly+dots+labels+'</svg>';
}
function renderMonthlyCompletion(d,active,anchor){
 const range=period("month",anchor),score=scoreTotals(d,range.start,range.end),
  {weeks}=monthlyWeeks(d,active,anchor);
 let previous=null;
 const rows=weeks.map((week,i)=>{
  const tally=scoreTotals(d,week.start,week.end),delta=previous===null?null:tally.net-previous,
   rate=previous===null||previous===0?null:Math.round(delta/Math.abs(previous)*100),
   change=delta===null?"—":(delta>0?"+":"")+delta+"분"+(rate===null?"":" ("+(rate>0?"+":"")+rate+"%)");
  previous=tally.net;
  return '<div class="trend-entry"><span class="trend-label">'+(i+1)+'주 <small>'+week.label+'</small></span>'+
   '<span class="trend-rate '+(tally.net>0?"positive":tally.net<0?"negative":"")+'">'+signedMinutes(tally.net)+'</span>'+
   '<span class="trend-change '+(delta>0?"positive":delta<0?"negative":"")+'">'+change+'</span></div>';
 }).join("");
 return '<section class="child-monthly"><div class="period-nav">'+
  el("‹","date-button","statprev")+'<strong>'+range.title+'</strong>'+
  el("›","date-button","statnext",range.end>=seoulToday()?"disabled":"")+'</div>'+
  '<div class="behavior-summary"><div><small>상점</small><strong class="positive">+'+score.earned+'분</strong></div>'+
  '<div><small>벌점</small><strong class="negative">−'+score.penalty+'분</strong></div>'+
  '<div><small>순획득</small><strong class="'+(score.net>=0?"positive":"negative")+'">'+signedMinutes(score.net)+'</strong></div></div>'+
  monthlyScoreCalendar(d,range)+svgBehaviorCharts(d,range.start,range.end)+
  '<section class="score-weekly-trend"><h3>주별 행동점수 변화</h3>'+
  '<div class="trend-rows">'+rows+'</div></section></section>';
}
function renderChildBonusItems(d){
 const items=d.bonusItems.filter(x=>x.active!==false);
 const chips=items.map(item=>
  '<span class="child-bonus-chip"><span>'+safe(item.title)+'</span>'+
  '<b class="'+(item.minutes>0?"positive":"negative")+'">'+(item.minutes>0?"+":"")+item.minutes+'분</b></span>'
 ).join("");
 return '<section class="child-bonus-group habit-group" aria-label="상벌 보너스">'+
  '<div class="child-bonus-line habit-card"><strong>상벌 보너스</strong>'+
  '<div class="child-bonus-inline">'+(chips||'<span class="child-bonus-empty">등록된 항목 없음</span>')+'</div></div></section>';
}
function childProgressNumbers(d,active,day){
 let done=0,total=0,confirmed=0,waiting=0;
 active.forEach(h=>{
  const items=shownItems(d,h,day),c=check(d,h.id,day),
   length=Math.max(1,items.length),status=c?.status||"";
  total+=length;
  if(status==="approved"||status==="pending")done+=length;
  else if(items.length){
   const ticks=new Set(checked(d,h.id,day));
   done+=items.filter(x=>ticks.has(x.id)).length;
  }
  if(status==="approved")confirmed++;
  if(status==="pending")waiting++;
 });
 return {done,total,confirmed,waiting,percent:total?Math.round(done/total*100):0};
}
function renderChildProgress(d,active,day){
 const {done,total,confirmed,waiting,percent}=childProgressNumbers(d,active,day);
 const weekly=scoreTotals(d,period("week",day).start,period("week",day).end);
 const recent=d.ledger.filter(l=>l.kind!=="spend").slice(0,4).map(l=>{
  const num=Number(l.minutes)||0,
    moment=formatMoment(l.created_at),
    detail=l.kind==="penalty"&&l.reason?'<small class="child-event-reason">'+safe(l.reason)+'</small>':"";
  return '<div class="child-event"><div class="child-event-text"><span>'+safe(l.description||"보너스")+'</span>'+
   '<small>'+safe(l.day)+(moment?' · '+safe(moment):"")+'</small>'+detail+'</div>'+
   '<strong class="'+(num>=0?"positive":"negative")+'">'+(num>0?"+":"")+num+'분</strong></div>';
 }).join("");
 return '<section class="child-progress" aria-label="오늘 진행 상황">'+
  '<div class="child-section-title">오늘 진행</div>'+
  '<div class="child-progress-top"><strong>'+done+' <span>/ '+total+'</span></strong><span>'+percent+'%</span></div>'+
  '<div class="child-progress-track" role="progressbar" aria-label="오늘 체크한 항목" aria-valuemin="0" aria-valuemax="'+total+'" aria-valuenow="'+done+'">'+
  '<span style="width:'+percent+'%"></span></div>'+
  '<div class="child-progress-states"><span><b class="positive">'+confirmed+'</b> 완료</span><span><b class="waiting">'+waiting+'</b> 체크됨</span></div>'+
  '</section>'+
  '<section class="child-week"><div class="child-section-title">이번 주</div>'+
  '<div class="child-week-pair"><div><small>상점</small><strong class="positive">+'+time(weekly.earned)+'</strong></div>'+
  '<div><small>벌점</small><strong class="negative">−'+time(weekly.penalty)+'</strong></div></div></section>'+
  '<section class="child-recent"><div class="child-section-title">최근 기록</div>'+
  (recent||'<p class="child-empty">기록 없음</p>')+
  el("전체 기록 보기","child-history-button","history")+'</section>';
}
function header(r){
 const mark='<span class="brand-check" role="img" aria-label="좋은습관">'+
  '<img src="/kid-habits/good-habit-icon-transparent-512.png?v=45" width="40" height="40" alt="" aria-hidden="true" draggable="false"></span>';
 const syncLabel=!syncOnline?"오프라인 · 마지막 저장 내용":outstandingWrites?"DB 저장 중":
  lastSyncStatus==="cached"?"마지막 저장 내용 · 최신 확인 중":
  realtimeConnected?"실시간 동기화":"DB 동기화됨";
 const syncDot=r&&hasSyncToken()?'<span class="sync-indicator '+(!syncOnline?"is-offline":outstandingWrites||lastSyncStatus==="cached"?"is-saving":"")+
  '" role="status" aria-label="'+syncLabel+'" title="'+syncLabel+'">●</span>':"";
 return '<header class="top">'+mark+syncDot+
  (r==="child"&&childPreview?'<div class="header-actions">'+el("부모 모드로 돌아가기","mode return-parent","return-parent",'aria-label="부모 모드로 돌아가기"')+'</div>':"")+
  (r==="parent"?'<div class="header-actions">'+
   el("전체 편집","mode","bulk-edit")+
   el("아이 모드로 전환","mode","role",'aria-label="아이 모드로 일시 전환"')+
   '</div>':"")+'</header>';
}
function registration(){
 app.innerHTML='<main class="wrap view-registration">'+header(null)+
 '<section class="pin"><h1 class="setup-title">좋은습관 시작하기</h1>'+
 '<p class="setup-description">이 기기에서 사용할 화면을 선택해주세요.</p>'+
 '<div class="setup-modes" role="group" aria-label="기기 사용 모드">'+
 '<button type="button" class="setup-mode setup-mode-button" data-action="choose-device" data-role="parent">'+
 '<span class="setup-mode-content"><strong>부모 모드</strong><small>할 일 관리 · 확인과 상벌 · 아이 화면 일시 전환</small></span></button>'+
 '<button type="button" class="setup-mode setup-mode-button" data-action="choose-device" data-role="child">'+
 '<span class="setup-mode-content"><strong>아이 모드</strong><small>오늘 할 일 체크 · 주간·월간 기록 확인</small></span></button></div>'+
 '<p class="setup-note">선택하면 공통 DB에 자동 연결되고, 다른 기기와 같은 기록을 사용합니다.</p>'+
 '</section></main>';
}

/* Dated tasks share the daily card design but never grant reward minutes. */
function renderOneTimeTasks(d,r){
 // Dated tasks follow their registration order. Existing list order is the
 // fallback when a legacy item has no creation timestamp.
 const all=Array.isArray(d.oneTimeTasks)?d.oneTimeTasks.filter(t=>t&&t.id&&t.title&&t.dueOn).sort((a,b)=>{
  const timestamp=t=>Date.parse(t.createdAt||t.created_at||t.createdOn||t.created_on||"");
  const first=timestamp(a),second=timestamp(b);
  return Number.isFinite(first)&&Number.isFinite(second)?first-second:0;
 }):[];
 const pending=all.filter(t=>!t.completedAt),completed=all.filter(t=>t.completedAt);
 const isParent=r==="parent";
 const card=t=>{
  const done=!!t.completedAt,overdue=!done&&t.dueOn<seoulToday();
  const editable=isParent||t.creatorRole==="child";
  const canComplete=r==="child"&&serverDevice?.role==="child";
  const attrs='data-id="'+safe(t.id)+'"';
  const dot='<span class="dot '+(done?"on":"")+'">'+(done?"✓":"")+'</span>';
  const labelText='<span class="one-time-label-text"><span class="task-name">'+safe(t.title)+'</span>'+
   '<small class="one-time-date">'+safe(dateLabel(t.dueOn))+
   (overdue?" · 기한 지남":done?" · 완료":"")+'</small></span>';
  const label=canComplete?
   '<button type="button" class="task-label one-time-check" data-action="one-time-toggle" '+attrs+
   ' aria-pressed="'+done+'" aria-label="'+safe(t.title)+' '+(done?"완료 취소":"완료")+'">'+dot+labelText+'</button>':
   '<div class="task-label">'+dot+labelText+'</div>';
  return '<article '+attrs+' class="task one-time-item habit-card '+(done?"is-done task-done":overdue?"is-overdue":"")+'">'+
   '<div class="task-top">'+label+
   (editable?'<div class="one-time-actions">'+el("수정","tiny","one-time-edit",attrs)+
    el("삭제","tiny","one-time-delete",attrs)+'</div>':"")+
   '</div></article>';
 };
 return '<section class="group one-time-group habit-group" aria-label="할 일">'+
  '<div class="group-head habit-group-head"><h2>할 일</h2><div class="section-head-actions">'+
   el("+ 등록","tiny one-time-add","one-time-add")+'</div></div>'+
  '<div class="one-time-list">'+
   '<div class="one-time-drag-group habit-item-list" data-status="pending">'+
   (pending.length?pending.map(card).join(""):'<p class="one-time-empty">진행 중인 할 일이 없습니다.</p>')+
   '</div>'+
   (completed.length?'<div class="one-time-subhead">완료한 할 일</div>'+
    '<div class="one-time-drag-group habit-item-list" data-status="completed">'+completed.map(card).join("")+'</div>':"")+
  '</div></section>';
}
function oneTimeEditor(task){
 const day=task?.dueOn||seoulToday();
 open('<form id="oneTimeForm" class="form"><h2>'+(task?"할 일 수정":"할 일 등록")+'</h2>'+
  '<input name="id" type="hidden" value="'+safe(task?.id||"")+'">'+
  '<label>할 일<input name="title" maxlength="100" required value="'+safe(task?.title||"")+'" placeholder="할 일 입력"></label>'+
  '<label>날짜<input name="dueOn" type="date" required value="'+safe(day)+'"></label>'+
  '<div class="form-actions">'+el("취소","ghost","close")+
   '<button type="submit" class="primary">저장</button></div></form>');
}
let oneTimeBusy=false;
async function oneTimeAction(action,payload,after){
 if(oneTimeBusy||childActionBusy||outstandingWrites){notify("다른 변경을 저장 중입니다. 잠시 후 다시 시도해주세요.");return false;}
 if(!hasSyncToken()||!serverReady||!syncOnline||navigator.onLine===false){notify("온라인 DB 연결이 필요합니다.");return false;}
 oneTimeBusy=true;
 try{
  await syncRequest("one-time-task",{action,...payload});
  await loadFromDatabase(true);
  if(after)after();
  notify(action==="create"?"할 일을 등록했습니다.":action==="delete"?"할 일을 삭제했습니다.":"저장했습니다.");
  return true;
 }catch(err){
  notify(err.message||"할 일을 저장하지 못했습니다.");
  return false;
 }finally{oneTimeBusy=false;}
}

function render(){
 if(!hasSyncToken()){registration();return;}
 if(!serverReady){
  app.innerHTML='<main class="wrap view-registration">'+header(null)+
    '<section class="pin"><h2>공통 DB 연결 중</h2><p class="setup-description">공통 DB에서 할 일과 기록을 불러오고 있습니다.</p>'+
    el("다시 불러오기","primary","sync-retry")+'</section></main>';
  return;
 }
 const d=read(),r=role(),day=r==="child"?seoulToday():viewDay;
 if(r==="parent"&&day>seoulToday())viewDay=seoulToday();
 const active=d.habits.filter(h=>h.active).sort((a,b)=>a.sort_order-b.sort_order);
 const pending=d.checks.filter(c=>c.status==="pending").length;
 const balance='<section class="balance balance-compact" aria-label="남은 보너스 시간">'+
  '<div class="balance-amount"><span class="balance-caption">남은 보너스 시간</span>'+
  '<strong class="balance-number">'+time(totals(d))+'</strong></div>'+
  (r==="parent"?'<div class="balance-actions">'+el("시간 사용","ghost","use")+'</div>':'')+
  '</section>';
 const nav=r==="child"?
  '<nav class="child-view-tabs" aria-label="조회 기간">'+
   el("오늘","view-tab "+(screen==="today"?"selected":""),"child-tab",'data-tab="today" aria-pressed="'+(screen==="today")+'"')+
   el("주간","view-tab "+(screen==="week"?"selected":""),"child-tab",'data-tab="week" aria-pressed="'+(screen==="week")+'"')+
   el("월간","view-tab "+(screen==="month"?"selected":""),"child-tab",'data-tab="month" aria-pressed="'+(screen==="month")+'"')+
   '</nav>'+
   (screen==="today"?'<div class="child-day-heading">'+dateLabel(day)+'</div>':""):
  screen==="today"?
   '<div class="daybar">'+el("‹","date-button","prev",'aria-label="전날"')+'<span>'+dateLabel(day)+'</span>'+
   el("›","date-button","next",'aria-label="다음 날" '+(day>=seoulToday()?"disabled":""))+
   '<span class="spacer"></span>'+el("기록 · 통계","tiny","history")+'</div>':
   '<div class="daybar">'+el("‹ 오늘","tiny","today")+'<span class="spacer"></span>'+
   el("주간","tiny "+(statsUnit==="week"?"active":""),"statmode",'data-mode="week"')+
   el("월간","tiny "+(statsUnit==="month"?"active":""),"statmode",'data-mode="month"')+'</div>';
 const taskGroup='<section class="group habit-group"><div class="group-head habit-group-head"><h2>매일 할 일</h2></div>'+
  '<div class="tasks habit-item-list">'+active.map(h=>renderTask(d,h,day,r)).join("")+'</div></section>';
 const bonusGroup=r==="parent"?'<section class="group habit-group"><div class="group-head habit-group-head"><h2>추가 상벌 보너스</h2></div>'+
  '<div class="bonus-list habit-item-list">'+d.bonusItems.map(item=>{
   const amount=(item.minutes>0?"+":"")+item.minutes+"분";
   return '<article class="bonus-entry habit-card '+(item.active===false?"inactive":"")+'"><span class="bonus-description">'+safe(item.title)+'</span>'+
    '<span class="bonus-controls"><span class="bonus-amount '+(item.minutes>0?"positive":"negative")+'">'+amount+'</span>'+
    (item.active!==false?'<button type="button" class="bonus-apply-icon" data-action="bonus-apply" data-id="'+safe(item.id)+
     '" aria-label="'+safe(item.title)+' '+safe(amount)+' 적용" title="상벌 적용">'+
     '<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">'+
     '<path d="M5 12l4 4L19 6"/></svg></button>':"")+'</span></article>';
  }).join("")+'</div></section>':"";
 const childBonus=r==="child"?renderChildBonusItems(d):"";
 const sectionViews={habits:taskGroup,oneTime:renderOneTimeTasks(d,r),bonuses:r==="parent"?bonusGroup:childBonus};
 const content=screen==="today"?displaySections(d).map(key=>sectionViews[key]||"").join(""):
  screen==="week"?renderWeeklyChecklist(d,active,statsAnchor):
  screen==="month"?renderMonthlyCompletion(d,active,statsAnchor):
  renderHistory(d,statsUnit,statsAnchor);
 if(r==="child"){
  app.innerHTML='<main class="wrap view-child screen-'+screen+'">'+header(r)+
   '<aside class="child-aside" aria-label="나의 진행 상황">'+balance+renderChildProgress(d,active,day)+'</aside>'+
   '<div class="child-work">'+nav+content+'</div></main>';
 }else{
  app.innerHTML='<main class="wrap view-parent screen-'+screen+'">'+header(r)+balance+nav+content+'</main>';
 }
 // Defensive UI guard: a public screen must not expose editing drag controls.
 app.querySelectorAll(".drag-handle").forEach(handle=>handle.remove());
 if(r==="parent"&&pending>lastPending&&document.visibilityState==="visible"){
  try{if("Notification" in window&&Notification.permission==="granted")new Notification("좋은습관",{body:"확인할 항목 "+pending+"개",tag:"bonus-pending"});}catch(_){}
 }
 lastPending=pending;
}
function open(content){dialogBody.innerHTML=content;if(!dialog.open)dialog.showModal();}
function close(){
 if(activeBulkDetail){closeBulkDetail(false);return;}
 const form=document.getElementById("bulkForm");
 if(form?.dataset.dirty==="1"&&!confirm("저장하지 않은 변경사항을 버릴까요?"))return;
 closeSubgroupPicker();
 dialog.close();
}
function notify(msg){const el=document.getElementById("toast");el.textContent=msg;el.hidden=false;clearTimeout(notify.timeout);notify.timeout=setTimeout(()=>el.hidden=true,2400);}

function foldChevron(){
 return '<span class="bulk-chevron" aria-hidden="true">'+
  '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round">'+
  '<path d="M6.5 9.5L12 14.5L17.5 9.5"/></svg></span>';
}
function bulkTaskRow(h){
 const e=h||{id:"",title:"",reward_minutes:5,items:[],active:true};
 const titles=[...new Set((e.items||[]).map(i=>String(i.group||"").trim()).filter(Boolean))];
 const groups=titles.map((title,index)=>({id:"group-"+index,title}));
 const subs=(e.items||[]).map(item=>bulkSubRow(item,groups)).join("");
 const groupsUI=groups.map(g=>bulkGroupRow(g)).join("");
 return '<div class="bulk-row bulk-task-row" data-created="'+(!h?"1":"0")+'">'+
  dragHandle("tasks",e.title||"새 할 일")+
  '<button type="button" class="bulk-summary" data-action="bulk-open-detail" aria-label="'+safe(e.title||"새 할 일")+' 상세 편집">'+
  '<span class="bulk-summary-left">'+
  '<strong class="bulk-summary-title">'+safe(e.title||"새 할 일")+'</strong>'+
  '<small class="bulk-summary-extra">+'+e.reward_minutes+'분 · '+(e.items.length?e.items.length+"개 하위 항목":"단일 체크")+
  (groups.length?" · "+groups.length+"개 묶음":"")+'</small>'+
  '</span><span class="bulk-summary-status">'+(e.active?"":"사용 안 함")+'</span>'+
  '</button>'+
  '<div class="bulk-panel"><input type="hidden" name="task-id" value="'+safe(e.id)+'">'+
  '<div class="bulk-inline-fields"><label>할 일 이름<input name="task-title" maxlength="80" value="'+safe(e.title)+'"></label>'+
  '<label>적립 시간 (분)<input name="task-minutes" type="number" min="1" max="180" value="'+e.reward_minutes+'"></label></div>'+
  '<div class="bulk-subsection"><div class="bulk-subhead"><strong>하위 항목</strong>'+
  el("+ 항목","tiny","bulk-add-sub")+'</div>'+
  '<p class="bulk-group-help">필수 항목은 모두 체크해야 하고, 같은 묶음에서는 하나만 선택하면 됩니다.</p>'+
  '<div class="bulk-subitems">'+subs+'</div>'+
  '<div class="bulk-subhead bulk-group-header"><strong>하위 묶음</strong>'+el("+ 묶음","tiny","bulk-add-group")+'</div>'+
  '<div class="bulk-groups">'+groupsUI+'</div></div>'+
  '<div class="bulk-row-options"><label class="bulk-active"><input type="checkbox" name="task-active" '+(e.active?"checked":"")+'> 사용하기</label>'+
  (!h?el("항목 삭제","tiny muted","bulk-remove"):"")+'</div></div></div>';
}
function bulkGroupRow(group){
 const id=group?.id||uid(),title=group?.title||"";
 return '<div class="bulk-group-row" data-group-id="'+safe(id)+'">'+
  '<input name="group-title" maxlength="48" aria-label="하위 묶음 이름" placeholder="묶음 이름 (예: 쓰기 연습)" value="'+safe(title)+'">'+
  el("묶음 해제","tiny muted","bulk-remove-group")+'</div>';
}
function bulkSubRow(item,groups=[]){
 const id=typeof item==="object"&&item?.id||"",title=typeof item==="string"?item:item?.title||"";
 const group=typeof item==="object"?String(item?.group||"").trim():"";
 const selected=groups.find(x=>x.title===group),choice=selected?.id||"";
 return '<div class="bulk-subitem" data-item-id="'+safe(id)+'">'+
  dragHandle("subitems",title||"하위 항목")+
  '<input type="text" name="sub-title" aria-label="하위 항목 이름" maxlength="48" placeholder="하위 항목 이름" value="'+safe(title)+'">'+
  '<select name="sub-group" class="subgroup-native-select" aria-hidden="true" tabindex="-1">'+
  '<option value="">필수</option>'+
  groups.map(g=>'<option value="'+safe(g.id)+'" '+(g.id===choice?"selected":"")+'>'+safe(g.title)+'</option>').join("")+
  '</select>'+
  '<button type="button" class="subgroup-picker-trigger" data-action="bulk-pick-group" aria-haspopup="dialog" aria-expanded="false" title="'+safe(selected?.title||"필수")+'">'+
   '<span class="subgroup-picker-value">'+safe(selected?.title||"필수")+'</span>'+
   '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>'+
  '</button>'+
  '<span class="bulk-row-control-group">'+
  el("×","tiny muted","bulk-remove-sub",'aria-label="하위 항목 삭제"')+'</span></div>';
}
function bulkGroupDefinitions(row){
 return Array.from(row.querySelectorAll(".bulk-group-row")).map(entry=>({
  id:entry.dataset.groupId,
  title:String(entry.querySelector('[name="group-title"]')?.value||"").trim()
 }));
}
function bulkRefreshGroups(row){
 if(!row)return;
 const groups=bulkGroupDefinitions(row);
 row.querySelectorAll('.bulk-subitem [name="sub-group"]').forEach(select=>{
  const selected=select.value;
  select.innerHTML='<option value="">필수</option>'+groups.map(g=>
   '<option value="'+safe(g.id)+'">'+safe(g.title||"이름 없는 묶음")+'</option>').join("");
  select.value=groups.some(g=>g.id===selected)?selected:"";
  syncSubgroupPickerLabel(select);
 });
}
let activeSubgroupPicker=null;
function syncSubgroupPickerLabel(select){
 const trigger=select?.closest(".bulk-subitem")?.querySelector(".subgroup-picker-trigger");
 if(!trigger)return;
 const label=select.selectedOptions?.[0]?.textContent||"필수";
 trigger.querySelector(".subgroup-picker-value").textContent=label;
 trigger.title=label;
 trigger.setAttribute("aria-label","하위 묶음: "+label+". 변경하기");
}
function closeSubgroupPicker(restoreFocus=false){
 const popup=(bulkDetailDialog.open?bulkDetailDialog:dialog).querySelector(".subgroup-picker-overlay");
 popup?.remove();
 if(activeSubgroupPicker?.trigger){
  activeSubgroupPicker.trigger.setAttribute("aria-expanded","false");
  if(restoreFocus&&activeSubgroupPicker.trigger.isConnected)activeSubgroupPicker.trigger.focus();
 }
 activeSubgroupPicker=null;
}
function openSubgroupPicker(trigger){
 requireParent();
 closeSubgroupPicker();
 const row=trigger.closest(".bulk-subitem"),select=row?.querySelector('[name="sub-group"]');
 if(!select)return;
 const options=Array.from(select.options);
 const selected=select.value;
 const picker='<div class="subgroup-picker-overlay" data-subgroup-backdrop="true">'+
  '<div class="subgroup-picker-panel" role="dialog" aria-modal="true" aria-label="하위 항목 묶음 선택">'+
   '<div class="subgroup-picker-head"><strong>묶음 선택</strong>'+
    '<button type="button" class="subgroup-picker-close" data-action="bulk-pick-close" aria-label="닫기">×</button></div>'+
   '<div class="subgroup-picker-options">'+options.map(option=>
    '<button type="button" class="subgroup-picker-option '+(option.value===selected?"selected":"")+
    '" data-action="bulk-pick-value" data-value="'+safe(option.value)+'" aria-pressed="'+(option.value===selected?"true":"false")+'">'+
    '<span class="subgroup-picker-option-name">'+safe(option.textContent)+'</span>'+
    (option.value===selected?'<svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 7"/></svg>':"")+
    '</button>').join("")+'</div>'+
  '</div></div>';
 (bulkDetailDialog.open?bulkDetailDialog:dialog).insertAdjacentHTML("beforeend",picker);
 activeSubgroupPicker={select,trigger};
 trigger.setAttribute("aria-expanded","true");
 (bulkDetailDialog.open?bulkDetailDialog:dialog).querySelector(".subgroup-picker-option.selected")?.focus();
}
function selectSubgroupPicker(value){
 const picker=activeSubgroupPicker;
 if(!picker)return;
 const allowed=Array.from(picker.select.options).some(x=>x.value===value);
 if(!allowed)return;
 picker.select.value=value;
 syncSubgroupPickerLabel(picker.select);
 bulkDirty(document.getElementById("bulkForm"));
 closeSubgroupPicker(true);
}

function bulkBonusRow(item){
 const b=item||{id:"",title:"",minutes:10,active:true};
 return '<div class="bulk-row bulk-bonus-row" data-created="'+(!item?"1":"0")+'">'+
  dragHandle("bonuses",b.title||"새 상벌")+
  '<button type="button" class="bulk-summary" data-action="bulk-open-detail" aria-label="'+safe(b.title||"새 상벌")+' 상세 편집">'+
  '<span class="bulk-summary-left">'+
  '<strong class="bulk-summary-title">'+safe(b.title||"새 상벌")+'</strong>'+
  '<small class="bulk-summary-extra '+(b.minutes>0?"positive":"negative")+'">'+(b.minutes>0?"+":"")+b.minutes+'분</small>'+
  '</span><span class="bulk-summary-status">'+(b.active?"":"사용 안 함")+'</span>'+
  '</button>'+
  '<div class="bulk-panel"><input type="hidden" name="bonus-id" value="'+safe(b.id)+'">'+
  '<label>상벌 이름<input name="bonus-title" maxlength="80" value="'+safe(b.title)+'"></label>'+
  '<div class="bulk-inline-fields"><label>구분<select name="bonus-type">'+
  '<option value="add" '+(b.minutes>0?"selected":"")+'>상점 (+)</option>'+
  '<option value="subtract" '+(b.minutes<0?"selected":"")+'>벌점 (−)</option></select></label>'+
  '<label>시간 (분)<input name="bonus-minutes" type="number" min="1" max="300" value="'+Math.abs(b.minutes)+'"></label></div>'+
  '<div class="bulk-row-options"><label class="bulk-active"><input type="checkbox" name="bonus-active" '+(b.active!==false?"checked":"")+'> 사용하기</label>'+
  (!item?el("항목 삭제","tiny muted","bulk-remove"):"")+'</div></div></div>';
}

/* Keep item ordering in the primary editor; edit the real fields in one
   secondary modal so cancelling cannot modify the pending list. */
let activeBulkDetail=null;
const bulkDetailDialog=document.createElement("dialog");
bulkDetailDialog.id="bulkDetailModal";
bulkDetailDialog.className="bulk-detail-dialog";
document.body.appendChild(bulkDetailDialog);
function openBulkDetail(row,removeOnCancel=false){
 requireParent();
 if(!row?.classList.contains("bulk-row")||activeBulkDetail)return;
 const slot=document.createElement("div");
 slot.className="bulk-detail-slot";
 const previous=row.cloneNode(true);
 row.parentElement.insertBefore(slot,row);
 const isTask=row.classList.contains("bulk-task-row");
 const typeName=isTask?"매일 할 일":"상벌";
 bulkDetailDialog.innerHTML=
  '<div class="bulk-detail-head"><div><small>'+typeName+'</small><h2 tabindex="-1">상세 편집</h2></div>'+
  '<button type="button" class="bulk-detail-close" data-action="bulk-detail-cancel" aria-label="상세 편집 취소">×</button></div>'+
  '<div class="bulk-detail-scroll bulk-form"><div class="bulk-detail-content"></div></div>'+
  '<div class="bulk-detail-footer">'+
   el("취소","ghost","bulk-detail-cancel")+
   el("목록에 반영","primary","bulk-detail-accept")+'</div>';
 bulkDetailDialog.querySelector(".bulk-detail-content").appendChild(row);
 activeBulkDetail={row,slot,previous,removeOnCancel};
 bulkDetailDialog.showModal();
 // Keep the on-screen keyboard closed; focus the heading, never an input.
 bulkDetailDialog.querySelector(".bulk-detail-head h2")?.focus({preventScroll:true});
}
function closeBulkDetail(accept=false){
 const detail=activeBulkDetail;
 if(!detail)return;
 closeSubgroupPicker();
 const {row,slot,previous,removeOnCancel}=detail;
 if(accept){
  if(row.classList.contains("bulk-task-row"))bulkRefreshGroups(row);
  bulkUpdatePreview(row);
  slot.replaceWith(row);
 }else if(removeOnCancel)slot.remove();
 else slot.replaceWith(previous);
 activeBulkDetail=null;
 if(accept)bulkDirty(document.getElementById("bulkForm"));
 if(bulkDetailDialog.open)bulkDetailDialog.close();
}
bulkDetailDialog.addEventListener("cancel",event=>{
 event.preventDefault();
 if(activeSubgroupPicker){closeSubgroupPicker(true);return;}
 closeBulkDetail(false);
});
bulkDetailDialog.addEventListener("click",event=>{
 if(event.target===bulkDetailDialog)closeBulkDetail(false);
});
bulkDetailDialog.addEventListener("close",()=>{if(activeBulkDetail)closeBulkDetail(false);});
function bulkEditor(initialTab="tasks"){
 requireParent();
 closeSubgroupPicker();
 const d=read(),habits=d.habits.filter(h=>!h.moved_to_parent_bonus).sort((a,b)=>a.sort_order-b.sort_order);
 const choices={habits:"매일 할 일",oneTime:"할 일",bonuses:"상벌 보너스"};
 open('<form id="bulkForm" class="form bulk-form" data-dirty="0">'+
  '<div class="bulk-editor-head"><h2>항목 편집</h2>'+el("닫기","tiny","close")+'</div>'+
  '<div class="bulk-tabs" role="tablist" aria-label="편집할 항목">'+
  '<button type="button" role="tab" aria-selected="true" class="bulk-tab active" data-action="bulk-tab" data-panel="tasks">매일 할 일 <small>'+habits.length+'</small></button>'+
  '<button type="button" role="tab" aria-selected="false" class="bulk-tab" data-action="bulk-tab" data-panel="bonuses">상벌 <small>'+d.bonusItems.length+'</small></button>'+
  '<button type="button" role="tab" aria-selected="false" class="bulk-tab" data-action="bulk-tab" data-panel="sections">화면 순서</button></div>'+
  '<section class="bulk-section" id="bulkPanelTasks" data-bulk-panel="tasks" role="tabpanel">'+
   '<div class="bulk-section-head"><span>수정할 항목을 선택하세요</span>'+el("+ 매일 할 일","tiny","bulk-add-task")+'</div>'+
   '<div id="bulkTasks" class="bulk-list">'+habits.map(bulkTaskRow).join("")+'</div></section>'+
  '<section class="bulk-section" id="bulkPanelBonuses" data-bulk-panel="bonuses" role="tabpanel" hidden>'+
   '<div class="bulk-section-head"><span>수정할 상벌을 선택하세요</span>'+el("+ 상벌","tiny","bulk-add-bonus")+'</div>'+
   '<div id="bulkBonuses" class="bulk-list">'+d.bonusItems.map(bulkBonusRow).join("")+'</div></section>'+
  '<section class="bulk-section bulk-section-order" id="bulkPanelSections" data-bulk-panel="sections" role="tabpanel" hidden>'+
   '<div class="bulk-section-head"><span>홈 화면에 표시되는 순서입니다. 손잡이를 위아래로 움직여 변경하세요.</span></div>'+
   '<div id="bulkSections" class="bulk-section-order-list">'+displaySections(d).map(id=>
    '<div class="bulk-section-order-row" data-section-id="'+safe(id)+'">'+
     dragHandle("sections",choices[id])+'<strong>'+safe(choices[id])+'</strong></div>').join("")+
   '</div></section>'+
  '<div class="bulk-footer">'+el("취소","ghost","close")+
   '<button type="submit" class="primary">변경사항 저장</button></div></form>');
 if(initialTab!=="tasks")bulkSetTab(initialTab);
}
function bulkSetTab(name){
 closeSubgroupPicker();
 const form=document.getElementById("bulkForm");if(!form||!["tasks","bonuses","sections"].includes(name))return;
 form.querySelectorAll("[data-bulk-panel]").forEach(panel=>{
  panel.hidden=panel.dataset.bulkPanel!==name;
 });
 form.querySelectorAll(".bulk-tab").forEach(tab=>{
  const active=tab.dataset.panel===name;
  tab.classList.toggle("active",active);
  tab.setAttribute("aria-selected",String(active));
 });
}
function bulkDirty(form){
 if(form&&!activeBulkDetail)form.dataset.dirty="1";
}
function bulkSyncRows(form){
 if(!form)return;
 form.querySelectorAll(".bulk-task-row").forEach(bulkRefreshGroups);
}
function bulkUpdatePreview(row){
 if(!row)return;
 const find=name=>row.querySelector('[name="'+name+'"]');
 const task=row.classList.contains("bulk-task-row"),
   title=find(task?"task-title":"bonus-title")?.value?.trim()|| (task?"새 할 일":"새 상벌"),
   amount=Number(find(task?"task-minutes":"bonus-minutes")?.value||0),
   sign=task||find("bonus-type")?.value==="add"?"+":"−",
   count=task?row.querySelectorAll('.bulk-subitems [name="sub-title"]').length:0,
   groups=task?row.querySelectorAll(".bulk-group-row").length:0;
 const label=row.querySelector(".bulk-summary-title"),
  extra=row.querySelector(".bulk-summary-extra"),
  inactive=row.querySelector(".bulk-summary-status");
 if(label)label.textContent=title;
 if(extra){
  extra.textContent=sign+amount+"분"+(task?" · "+(count?count+"개 하위 항목":"단일 체크")+(groups?" · "+groups+"개 묶음":""):"");
  extra.classList.toggle("positive",sign==="+");
  extra.classList.toggle("negative",sign==="−");
 }
 const enabled=find(task?"task-active":"bonus-active")?.checked;
 if(inactive)inactive.textContent=enabled?"":"사용 안 함";
}
function saveBulkEditor(form){
 requireParent();
 bulkSyncRows(form);
 const d=read();
 const taskRows=Array.from(form.querySelectorAll(".bulk-task-row"));
 const bonusRows=Array.from(form.querySelectorAll(".bulk-bonus-row"));
 if(taskRows.length>100||bonusRows.length>100)throw Error("항목은 각 100개까지 등록할 수 있습니다.");
 const field=(row,name)=>row.querySelector('[name="'+name+'"]');
 const get=(row,name)=>String(field(row,name)?.value||"").trim();
 const bool=(row,name)=>!!field(row,name)?.checked;
 const oldTasks=d.habits.filter(h=>!h.moved_to_parent_bonus);
 const oldBonuses=d.bonusItems;
 // No existing row can be silently discarded. Hide one by clearing its '사용' checkbox.
 const incomingTasks=taskRows.map(row=>get(row,"task-id")).filter(Boolean);
 const incomingBonuses=bonusRows.map(row=>get(row,"bonus-id")).filter(Boolean);
 if(new Set(incomingTasks).size!==incomingTasks.length||new Set(incomingBonuses).size!==incomingBonuses.length||
  oldTasks.some(h=>!incomingTasks.includes(h.id))||oldBonuses.some(b=>!incomingBonuses.includes(b.id)))
  throw Error("기존 항목은 삭제할 수 없습니다. 사용을 해제해주세요.");
 const updatedTasks=taskRows.map((row,index)=>{
  const id=get(row,"task-id"),prev=id?oldTasks.find(h=>h.id===id):null,
   title=get(row,"task-title"),minutes=Number(get(row,"task-minutes"));
  const groups=bulkGroupDefinitions(row);
  if(groups.length>20||groups.some(g=>!g.title||g.title.length>48)||
    new Set(groups.map(g=>g.title)).size!==groups.length)
   throw Error("묶음은 이름을 입력하고 서로 다른 이름을 사용해주세요 (최대 20개).");
  const groupById=new Map(groups.map(g=>[g.id,g.title]));
  const subRows=Array.from(row.querySelectorAll(".bulk-subitem"));
  if(subRows.length>20)throw Error("하위 항목은 최대 20개까지 등록할 수 있습니다.");
  const ids=new Set(),items=subRows.map(entry=>{
   const name=String(entry.querySelector('[name="sub-title"]')?.value||"").trim(),
    oldId=entry.dataset.itemId||"",
    assigned=entry.querySelector('[name="sub-group"]')?.value||"",
    previous=prev?.items.find(i=>i.id===oldId),
    group=groupById.get(assigned)||"";
   if(!name||name.length>48||(oldId&&ids.has(oldId)))
    throw Error("하위 항목 이름이나 중복 ID를 확인해주세요.");
   if(assigned&&!group)throw Error("삭제된 묶음에 포함된 항목이 있습니다.");
   ids.add(oldId);
   const item={...(previous||{}),id:previous?.id||uid(),title:name};
   if(group)item.group=group;else delete item.group;
   return item;
  });
  if(groups.some(g=>items.filter(item=>item.group===g.title).length<2))
   throw Error("묶음에는 선택할 수 있는 항목이 최소 2개 있어야 합니다.");
  if((id&&!prev)||!title||title.length>80||!Number.isInteger(minutes)||minutes<1||minutes>180)
   throw Error("할 일 이름과 적립 시간을 확인해주세요.");
  return prev?{...prev,title,reward_minutes:minutes,items,rotation:false,active:bool(row,"task-active"),sort_order:index+1}:
   {id:uid(),title,reward_minutes:minutes,items,rotation:false,active:bool(row,"task-active"),
    sort_order:index+1,created_on:seoulToday()};
 });
 const updatedBonuses=bonusRows.map(row=>{
  const id=get(row,"bonus-id"),prev=id?oldBonuses.find(x=>x.id===id):null,
   title=get(row,"bonus-title"),minutes=Number(get(row,"bonus-minutes")),
   type=get(row,"bonus-type");
  if((id&&!prev)||!title||title.length>80||!Number.isInteger(minutes)||minutes<1||minutes>300||
    !["add","subtract"].includes(type))throw Error("상벌 이름, 종류, 시간을 확인해주세요.");
  return {...(prev||{id:uid()}),title,minutes:minutes*(type==="add"?1:-1),active:bool(row,"bonus-active")};
 });
 const screenOrder=Array.from(form.querySelectorAll("#bulkSections .bulk-section-order-row")).map(node=>node.dataset.sectionId);
 if(screenOrder.length!==3||new Set(screenOrder).size!==3||
    screenOrder.some(id=>!["habits","oneTime","bonuses"].includes(id)))
  throw Error("화면 구역 정렬을 확인해주세요.");
 d.displaySections=screenOrder;
 d.habits=[...updatedTasks,...d.habits.filter(x=>x.moved_to_parent_bonus)];
 d.bonusItems=updatedBonuses;
 save(d);render();
}

function editor(hid){
 const d=read(),h=hid?d.habits.find(x=>x.id===hid):null;
 open('<form id="editForm" class="form"><h2>'+(h?"항목 편집":"항목 추가")+'</h2>'+
 '<input type="hidden" name="id" value="'+safe(h?.id||"")+'"><label>이름<input name="title" maxlength="80" required value="'+safe(h?.title||"")+'"></label>'+
 '<label>보너스 시간 (분)<input name="minutes" type="number" min="1" max="180" value="'+(h?.reward_minutes||5)+'" required></label>'+
 '<label>하부 항목<textarea name="items" rows="4" placeholder="한 줄에 하나씩">'+safe((h?.items||[]).map(x=>x.title).join("\n"))+'</textarea></label>'+
 (h?'<label class="inline"><input type="checkbox" name="active" '+(h.active?"checked":"")+'> 사용</label>':'')+
 '<div class="form-actions">'+el("취소","ghost","close")+'<button class="primary" type="submit">저장</button></div></form>');
}
function adjustment(kind){throw Error("등록된 보너스 항목만 사용할 수 있습니다.");}
function history(){screen=role()==="child"?"week":"history";statsAnchor=seoulToday();statsUnit="week";render();}
function formatMoment(value){
 if(!value)return "";
 try{return new Intl.DateTimeFormat("ko-KR",{timeZone:"Asia/Seoul",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(value));}catch(_){return "";}
}
function period(unit,anchor){
 if(unit==="month"){
  const start=anchor.slice(0,7)+"-01";
  const [year,month]=anchor.slice(0,7).split("-").map(Number);
  const last=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  return {start,end:last,title:year+"년 "+month+"월"};
 }
 const day=new Date(anchor+"T12:00:00Z").getUTCDay(),start=nextDay(anchor,-((day+6)%7));
 return {start,end:nextDay(start,6),title:dateLabel(start)+" ~ "+dateLabel(nextDay(start,6))};
}
function movePeriod(unit,anchor,step){
 if(unit==="week")return nextDay(anchor,7*step);
 const parts=anchor.slice(0,7).split("-").map(Number);
 const d=new Date(Date.UTC(parts[0],parts[1]-1+step,1,12));
 return d.toISOString().slice(0,10);
}
function summaryRows(d,unit,range){
 const logs=d.ledger.filter(l=>l.day>=range.start&&l.day<=range.end);
 const sum={plus:0,minus:0,net:0,count:0};
 logs.forEach(l=>{const n=Number(l.minutes)||0;if(n>=0)sum.plus+=n;else sum.minus-=n;sum.net+=n;});
 const samples=[];
 if(unit==="week"){
  for(let i=0;i<7;i++){const date=nextDay(range.start,i);samples.push({id:date,label:["월","화","수","목","금","토","일"][i],start:date,end:date,plus:0,minus:0});}
 }else{
  let cursor=range.start;
  for(let i=0;cursor<=range.end;i++){
   const end=nextDay(cursor,6);
   samples.push({id:cursor,label:(i+1)+"주",start:cursor,end:end<range.end?end:range.end,plus:0,minus:0});
   cursor=nextDay(end);
  }
 }
 logs.forEach(l=>{
  const row=samples.find(x=>l.day>=x.start&&l.day<=x.end);
  if(row){if(l.minutes>=0)row.plus+=l.minutes;else row.minus-=l.minutes;}
 });
 return {logs,sum,samples};
}
function logDetails(d,l){
 let html="";
 if(l.kind==="habit"){
  const c=d.checks.find(c=>c.id===l.check_id);
  const raw=l.details||c?.confirmed_items||c?.completed_items||[];
  if(Array.isArray(raw)&&raw.length)html+='<div class="log-details">'+raw.map(x=>{
   const obj=typeof x==="string"?{title:x,at:null}:x;
   return '<span>✓ '+safe(obj.title||"")+(obj.at?' <em>'+safe(formatMoment(obj.at))+'</em>':"")+'</span>';
  }).join("")+'</div>';
 }
 if(l.kind==="penalty"&&l.reason)html+='<div class="reason">'+safe(l.reason)+'</div>';
 return html;
}
function renderHistory(d,unit,anchor){
 const range=period(unit,anchor),report=summaryRows(d,unit,range),
  labels={habit:"완료",reversal:"완료 취소",bonus:"추가",penalty:"차감",spend:"사용"};
 const max=Math.max(1,...report.samples.flatMap(r=>[r.plus,r.minus]));
 const buckets='<div class="chart">'+report.samples.map(r=>
  '<div class="chart-row"><span class="chart-label">'+r.label+'</span>'+
  '<div class="chart-bars"><span class="chart-positive" style="width:'+(r.plus/max*100)+'%"></span>'+
  '<span class="chart-negative" style="width:'+(r.minus/max*100)+'%"></span></div>'+
  '<span class="chart-number">'+(r.plus?"+"+r.plus:"")+(r.minus?" −"+r.minus:"")+'</span></div>'
 ).join("")+'</div>';
 // Display chronological records, and pending child submissions that aren't yet reflected in the ledger.
 const activity=report.logs.map(l=>({type:"ledger",date:l.day,at:l.created_at||l.day+"T00:00:00Z",data:l}));
 d.checks.filter(c=>c.day>=range.start&&c.day<=range.end&&c.status==="pending").forEach(c=>
  activity.push({type:"pending",date:c.day,at:c.submitted_at||c.day+"T00:00:00Z",data:c}));
 // Include checked subtasks that are not yet a complete request.
 Object.entries(d.subchecks).forEach(([key,ids])=>{
  const split=key.indexOf("|");if(split<0||!Array.isArray(ids)||!ids.length)return;
  const day=key.slice(0,split),hid=key.slice(split+1);
  if(day<range.start||day>range.end||check(d,hid,day))return;
  const h=d.habits.find(x=>x.id===hid);if(!h)return;
  const details=(h.items||[]).filter(x=>ids.includes(x.id)).map(x=>({title:x.title,at:d.subcheckTimes?.[key]?.[x.id]||null}));
  if(!details.length)return;
  const at=details.map(x=>x.at).filter(Boolean).sort().pop()||day+"T00:00:00Z";
  activity.push({type:"partial",date:day,at,data:{title:h.title,details}});
 });
 activity.sort((a,b)=>b.at.localeCompare(a.at));
 const detailsUI=(entries)=>'<div class="log-details">'+entries.map(item=>{
  const x=typeof item==="string"?{title:item}:item;
  return '<span>✓ '+safe(x.title||"")+(x.at?' <em>'+safe(formatMoment(x.at))+'</em>':"")+'</span>';
 }).join("")+'</div>';
 const activities=activity.map(row=>{
  if(row.type==="pending"){
   const c=row.data,h=d.habits.find(x=>x.id===c.habit_id);
   const details=Array.isArray(c.completed_items)?c.completed_items:[];
   return '<div class="log"><div><strong>'+safe(h?.title||"할 일")+'</strong><small>'+safe(c.day)+' · '+formatMoment(c.submitted_at)+' · 체크됨</small>'+
    (details.length?detailsUI(details):"")+'</div><b class="waiting">대기</b></div>';
  }
  if(row.type==="partial"){
   const p=row.data;
   return '<div class="log"><div><strong>'+safe(p.title)+'</strong><small>'+safe(row.date)+' · 진행 중</small>'+
    detailsUI(p.details)+'</div><b class="waiting">진행 중</b></div>';
  }
  const l=row.data,num=Number(l.minutes)||0;
  const cancel=role()==="parent"&&canCancelLedger(l)?
   el("취소","tiny cancel-record","cancel-record",'data-id="'+safe(l.id)+'" title="당일 적용 기록 취소"'):"";
  return '<div class="log"><div><strong>'+safe(l.description||labels[l.kind])+'</strong>'+
   '<small>'+safe(l.day)+' · '+formatMoment(l.created_at)+' · '+(labels[l.kind]||"")+'</small>'+
   logDetails(d,l)+'</div><div class="log-end"><b class="'+(num>=0?"positive":"negative")+'">'+(num>0?"+":"")+num+'분</b>'+
   cancel+'</div></div>';
 }).join("");
 return '<section class="stats">'+
  '<div class="period-nav">'+el("‹","date-button","statprev")+'<strong>'+range.title+'</strong>'+
   el("›","date-button","statnext",' '+(range.end>=seoulToday()?"disabled":""))+'</div>'+
  '<div class="stat-grid"><div><span>적립</span><strong class="positive">+'+time(report.sum.plus)+'</strong></div>'+
  '<div><span>차감 · 사용</span><strong class="negative">−'+time(report.sum.minus)+'</strong></div>'+
  '<div><span>합계</span><strong class="'+(report.sum.net>=0?"positive":"negative")+'">'+(report.sum.net>0?"+":"")+time(report.sum.net)+'</strong></div></div>'+
  buckets+'<div class="section-head">기록 <small>'+activity.length+'건</small></div>'+
  '<div class="activity">'+(activities||'<p class="empty">기록 없음</p>')+'</div></section>';
}
function bonusesPanel(){
 const d=read();
 const rows=d.bonusItems.map(item=>'<div class="bonus-row"><div class="bonus-info">'+
  '<strong>'+safe(item.title)+'</strong><span class="'+(item.minutes>0?"positive":"negative")+'">'+(item.minutes>0?"+":"")+item.minutes+'분</span>'+
  (item.active===false?'<small>중지됨</small>':"")+'</div>'+
  el("편집","tiny","bonus-edit",'data-id="'+safe(item.id)+'"')+
  (item.active!==false?el("적용","tiny apply","bonus-apply",'data-id="'+safe(item.id)+'"'):"")+'</div>').join("");
 open('<div class="form"><div class="modal-head"><h2>부모 관리 보너스</h2>'+el("닫기","tiny","close")+'</div>'+
  rows+el("+ 항목 추가","ghost","bonus-new")+'</div>');
}
function bonusEditor(id){
 const item=id?read().bonusItems.find(x=>x.id===id):null;
 open('<form id="bonusItemForm" class="form"><h2>'+(item?"보너스 항목 수정":"보너스 항목 추가")+'</h2>'+
  '<input type="hidden" name="id" value="'+safe(item?.id||"")+'">'+
  '<label>항목 이름<input name="title" maxlength="80" value="'+safe(item?.title||"")+'" required></label>'+
  '<label>종류<select name="type"><option value="add" '+(item?.minutes>0?"selected":"")+'>추가 (+)</option>'+
  '<option value="subtract" '+(item?.minutes<0?"selected":"")+'>차감 (−)</option></select></label>'+
  '<label>시간 (분)<input name="minutes" type="number" min="1" max="300" value="'+Math.abs(item?.minutes||10)+'" required></label>'+
  (item?'<label class="inline"><input type="checkbox" name="active" '+(item.active!==false?"checked":"")+'> 사용</label>':"")+
  '<div class="form-actions">'+el("취소","ghost","close")+'<button type="submit" class="primary">저장</button></div></form>');
}
function bonusApply(id){
 const item=read().bonusItems.find(x=>x.id===id&&x.active!==false);
 if(!item)throw Error("등록된 항목을 찾지 못했습니다.");
 open('<form id="bonusApplyForm" class="form"><h2>'+safe(item.title)+'</h2>'+
  '<input type="hidden" name="id" value="'+safe(item.id)+'">'+
  '<div class="apply-value '+(item.minutes>0?"positive":"negative")+'">'+(item.minutes>0?"+":"")+item.minutes+'분</div>'+
  '<label>사유 (선택)<input name="reason" maxlength="100" placeholder="필요할 때만 작성"></label>'+
  '<div class="form-actions">'+el("취소","ghost","close")+'<button class="primary" type="submit">확인 후 적용</button></div></form>');
}
function useDialog(){
 open('<form id="useForm" class="form"><h2>보너스 시간 사용</h2>'+
 '<label>사용 시간 (분)<input type="number" name="minutes" min="1" max="300" value="10" required></label>'+
 '<div class="form-actions">'+el("취소","ghost","close")+'<button type="submit" class="primary">사용</button></div></form>');
}
document.addEventListener("pointerdown",beginRowDrag);
document.addEventListener("pointermove",moveRowDrag,{passive:false});
document.addEventListener("pointerup",event=>finishRowDrag(event));
document.addEventListener("pointercancel",event=>finishRowDrag(event,true));
document.addEventListener("keydown",keyboardRowDrag);
document.addEventListener("keydown",event=>{
 if(!activeSubgroupPicker)return;
 if(event.key==="Escape"){
  event.preventDefault();event.stopImmediatePropagation();closeSubgroupPicker(true);return;
 }
 const pickerHost=bulkDetailDialog.open?bulkDetailDialog:dialog;
 const focusables=Array.from(pickerHost.querySelectorAll(".subgroup-picker-panel button"));
 if(event.key==="Tab"&&focusables.length){
  const first=focusables[0],last=focusables[focusables.length-1];
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
  return;
 }
 if(!["ArrowDown","ArrowUp"].includes(event.key))return;
 const options=Array.from(pickerHost.querySelectorAll(".subgroup-picker-option"));
 const i=options.indexOf(document.activeElement);
 if(i>=0&&options.length){
  event.preventDefault();options[(i+(event.key==="ArrowDown"?1:-1)+options.length)%options.length].focus();
 }
},true);
dialog.addEventListener("close",()=>closeSubgroupPicker());
document.addEventListener("click",event=>{
 if(event.target.closest?.(".drag-handle")){event.preventDefault();event.stopPropagation();}
},true);
document.addEventListener("click",e=>{
 if(e.target.classList?.contains("subgroup-picker-overlay")){closeSubgroupPicker(true);return;}
 const t=e.target.closest("[data-action]");if(!t)return;
 const act=t.dataset.action,hid=t.dataset.id;
 try{
  if(act==="choose-device"){
   void autoRegisterDevice(t.dataset.role);
  }
  else if(act==="role"&&role()==="parent"){
   previewChild();
  }
  else if(act==="return-parent"&&childPreview){
   returnToParent();
  }
  else if(act==="today"){screen="today";render();}
  else if(act==="child-tab"){
   if(role()!=="child")return;
   const dest=t.dataset.tab;
   if(!["today","week","month"].includes(dest))return;
   screen=dest;
   if(dest!=="today")statsAnchor=seoulToday();
   render();
  }
  else if(act==="prev"){viewDay=nextDay(viewDay,-1);render();}
  else if(act==="next"&&viewDay<seoulToday()){viewDay=nextDay(viewDay);render();}
  else if(act==="toggle")toggleItem(hid,t.dataset.item);
  else if(act==="complete")submitSimple(hid);
  else if(act==="review")review(hid,t.dataset.status);
  else if(act==="bulk-edit"&&role()==="parent")bulkEditor();
  else if(act==="bulk-tab"&&role()==="parent")bulkSetTab(t.dataset.panel);
  else if(act==="bulk-open-detail"&&role()==="parent"){e.preventDefault();openBulkDetail(t.closest(".bulk-row"));}
  else if(act==="bulk-detail-accept"&&role()==="parent")closeBulkDetail(true);
  else if(act==="bulk-detail-cancel"&&role()==="parent")closeBulkDetail(false);
  else if(act==="bulk-pick-group"&&role()==="parent"){e.preventDefault();openSubgroupPicker(t);}
  else if(act==="bulk-pick-close"){closeSubgroupPicker(true);}
  else if(act==="bulk-pick-value"&&role()==="parent"){selectSubgroupPicker(t.dataset.value||"");}
  else if(act==="bulk-add-task"&&role()==="parent"){
   const list=document.getElementById("bulkTasks");
   list?.insertAdjacentHTML("beforeend",bulkTaskRow(null));
   const row=list?.lastElementChild;if(row)openBulkDetail(row,true);
  }
  else if(act==="bulk-add-bonus"&&role()==="parent"){
   const list=document.getElementById("bulkBonuses");
   list?.insertAdjacentHTML("beforeend",bulkBonusRow(null));
   const row=list?.lastElementChild;if(row)openBulkDetail(row,true);
  }
  else if(act==="bulk-add-sub"&&role()==="parent"){
   const row=t.closest(".bulk-task-row"),list=row?.querySelector(".bulk-subitems");
   list?.insertAdjacentHTML("beforeend",bulkSubRow(null,bulkGroupDefinitions(row)));
   list?.lastElementChild?.querySelector('[name="sub-title"]')?.focus();
   bulkUpdatePreview(row);bulkDirty(document.getElementById("bulkForm"));
  }
  else if(act==="bulk-add-group"&&role()==="parent"){
   const row=t.closest(".bulk-task-row"),list=row?.querySelector(".bulk-groups");
   list?.insertAdjacentHTML("beforeend",bulkGroupRow({id:uid(),title:""}));
   bulkRefreshGroups(row);
   list?.lastElementChild?.querySelector('[name="group-title"]')?.focus();
   bulkUpdatePreview(row);bulkDirty(document.getElementById("bulkForm"));
  }
  else if(act==="bulk-remove-group"&&role()==="parent"){
   closeSubgroupPicker();
   const row=t.closest(".bulk-task-row"),entry=t.closest(".bulk-group-row"),id=entry?.dataset.groupId;
   row?.querySelectorAll('.bulk-subitem [name="sub-group"]').forEach(sel=>{
    if(sel.value===id)sel.value="";
   });
   entry?.remove();
   bulkRefreshGroups(row);bulkUpdatePreview(row);bulkDirty(document.getElementById("bulkForm"));
  }
  else if(act==="bulk-remove-sub"&&role()==="parent"){
   closeSubgroupPicker();
   const row=t.closest(".bulk-task-row");
   t.closest(".bulk-subitem")?.remove();
   bulkUpdatePreview(row);bulkDirty(document.getElementById("bulkForm"));
  }
  else if(act==="bulk-remove"&&role()==="parent"&&t.closest(".bulk-row")?.dataset.created==="1"){
   if(activeBulkDetail?.row===t.closest(".bulk-row"))closeBulkDetail(false);
   else{t.closest(".bulk-row").remove();bulkDirty(document.getElementById("bulkForm"));}
  }
  else if(act==="one-time-add"){oneTimeEditor(null);}
  else if(act==="one-time-edit"){
   const task=(read().oneTimeTasks||[]).find(x=>x.id===hid);
   if(task&&(role()==="parent"||task.creatorRole==="child"))oneTimeEditor(task);
  }
  else if(act==="one-time-toggle"){void oneTimeAction("toggle",{id:hid});}
  else if(act==="one-time-delete"){
   const task=(read().oneTimeTasks||[]).find(x=>x.id===hid);
   if(task&&(role()==="parent"||task.creatorRole==="child")&&confirm("이 할 일을 삭제할까요?"))
    void oneTimeAction("delete",{id:hid});
  }
  else if(act==="history")history();
  else if(act==="bonuses")bonusesPanel();
  // Bonus definitions are also edited together in the parent editor.
  else if(act==="bonus-apply")bonusApply(hid);
  else if(act==="cancel-record")cancelLedger(hid);
  else if(act==="use")useDialog();
  else if(act==="pending"){
   const pending=read().checks.filter(c=>c.status==="pending").sort((a,b)=>b.day.localeCompare(a.day));
   if(pending.length)viewDay=pending[0].day;
   screen="today";render();
  }
  else if(act==="statmode"){statsUnit=t.dataset.mode;statsAnchor=seoulToday();render();}
  else if(act==="statprev"){statsAnchor=movePeriod(screen==="week"?"week":screen==="month"?"month":statsUnit,statsAnchor,-1);render();}
  else if(act==="statnext"&&period(screen==="week"?"week":screen==="month"?"month":statsUnit,statsAnchor).end<seoulToday()){statsAnchor=movePeriod(screen==="week"?"week":screen==="month"?"month":statsUnit,statsAnchor,1);render();}
  else if(act==="sync-retry")void loadFromDatabase(true);
  else if(act==="close")close();
 }catch(err){notify(err.message||"처리 실패");}
});
document.addEventListener("submit",e=>{
 const f=e.target;
 if(!["bulkForm","bonusApplyForm","useForm","oneTimeForm"].includes(f.id))return;
 e.preventDefault();
 const v=Object.fromEntries(new FormData(f).entries());
 try{
  if(f.id==="oneTimeForm"){
   if(!String(v.title||"").trim()||!v.dueOn)throw Error("이름과 날짜를 입력해주세요.");
   const action=v.id?"update":"create";
   void oneTimeAction(action,{id:v.id,title:String(v.title).trim(),dueOn:v.dueOn},()=>close());
   return;
  }
  if(f.id==="bulkForm"){
   if(activeBulkDetail)throw Error("상세 편집을 먼저 완료해주세요.");
   saveBulkEditor(f);f.dataset.dirty="0";close();
  }
  if(f.id==="bonusApplyForm"){
   const item=read().bonusItems.find(x=>x.id===v.id&&x.active!==false);
   if(!item)throw Error("적용할 항목을 찾지 못했습니다.");
   const amount=(item.minutes>0?"+":"")+item.minutes+"분";
   const reason=String(v.reason||"").trim();
   if(!confirm(item.title+" · "+amount+(reason?"\n사유: "+reason:"")+"\n적용하시겠습니까?"))return;
   applyBonusItem(v.id,reason);close();
  }
  if(f.id==="useForm"){useTime(v.minutes);close();}
 }catch(err){notify(err.message||"저장 실패");}
});
document.addEventListener("input",e=>{
 const row=e.target.closest?.(".bulk-row");
 if(!row||role()!=="parent")return;
 if(e.target.name==="group-title")bulkRefreshGroups(row);
 bulkUpdatePreview(row);bulkDirty(document.getElementById("bulkForm"));
});
document.addEventListener("change",e=>{
 const row=e.target.closest?.(".bulk-row");
 if(!row||role()!=="parent")return;
 bulkUpdatePreview(row);bulkDirty(document.getElementById("bulkForm"));
});
dialog.addEventListener("cancel",e=>{
 if(activeBulkDetail){e.preventDefault();closeBulkDetail(false);return;}
 if(activeSubgroupPicker){
  e.preventDefault();
  closeSubgroupPicker(true);
  return;
 }
 if(document.getElementById("bulkForm")?.dataset.dirty==="1"&&!confirm("저장하지 않은 변경사항을 버릴까요?"))e.preventDefault();
});
dialog.addEventListener("click",e=>{if(e.target===dialog)close();});
window.addEventListener("storage",e=>{
 if(e.key===SYNC_TOKEN){
  serverReady=false;
  if(hasSyncToken())void loadFromDatabase(true);
  else registration();
 }else if([MODE,SETUP].includes(e.key))render();
});
document.addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="visible"&&hasSyncToken())void loadFromDatabase(true);
});
if("serviceWorker" in navigator){
 // Avoid stale service-worker scripts and refresh the installed PWA's assets.
 navigator.serviceWorker.register("/kid-habits/sw.js",{scope:"/kid-habits/",updateViaCache:"none"})
  .then(registration=>registration.update().catch(()=>{}))
  .catch(()=>{});
 navigator.serviceWorker.addEventListener("controllerchange",()=>{
  const editor=document.getElementById("bulkForm");
  // Never interrupt unsaved edits. The next navigation will load new assets.
  if(editor?.dataset.dirty==="1"||oneTimeBusy||outstandingWrites||childActionBusy)return;
  if(sessionStorage.getItem("kid-habits-sw-reload-v45")==="1")return;
  sessionStorage.setItem("kid-habits-sw-reload-v45","1");
  window.location.reload();
 });
}
let lastBackgroundCheck=Date.now();
setInterval(()=>{
 if(!hasSyncToken()||document.visibilityState!=="visible"||outstandingWrites||childActionBusy)return;
 const now=Date.now(),interval=realtimeConnected?120000:12000;
 if(now-lastBackgroundCheck<interval)return;
 lastBackgroundCheck=now;
 void loadFromDatabase();
},12000);
window.addEventListener("online",()=>{
 if(hasSyncToken()){syncOnline=true;startRealtime();void loadFromDatabase(true);}
});
restoreLastSavedState();
render();
window.goodHabitsRealtimeReady=startRealtime;
if(hasSyncToken()){
 startRealtime();
 void loadFromDatabase();
}
})();

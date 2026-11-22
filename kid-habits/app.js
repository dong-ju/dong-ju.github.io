(()=>{
"use strict";
const STORE="kid_habits_personal_v1",SETUP="kid_habits_personal_setup_v1",MODE="kid_habits_personal_role_v1";
const SYNC_TOKEN="good_habits_device_token_v1";
const SYNC_URL="https://dnvphihaopivjcvkvvud.supabase.co/functions/v1/good-habits-sync/";
const PAIR_URL="https://dnvphihaopivjcvkvvud.supabase.co/functions/v1/kid-habits/api/pair";
let serverState=null,serverRevision=0,serverDevice=null,serverReady=false;
let lastConfirmedState=null,syncOnline=true;
let syncReading=false,syncWriteQueue=Promise.resolve(),outstandingWrites=0,childActionBusy=false;
function hasSyncToken(){return !!localStorage.getItem(SYNC_TOKEN);}
function copyState(d){return JSON.parse(JSON.stringify(d));}
async function syncRequest(route,body){
 const token=localStorage.getItem(SYNC_TOKEN);
 if(!token)throw Error("기기 연결 코드로 먼저 등록해주세요.");
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
async function pairRequest(code,roleName){
 const res=await fetch(PAIR_URL,{method:"POST",headers:{"Content-Type":"application/json"},
  body:JSON.stringify({role:roleName,code}),cache:"no-store"});
 let data={};try{data=await res.json();}catch(_){}
 if(!res.ok)throw Error(data.error||"기기 연결 코드를 확인해주세요.");
 return data;
}
async function loadFromDatabase(force=false){
 if(!hasSyncToken()||syncReading||outstandingWrites||childActionBusy)return;
 syncReading=true;
 try{
  let result=await syncRequest("state");
  serverDevice=result.device;
  if(!result.state&&result.device?.role==="parent"){
   // The first connected parent migrates the existing local data exactly once.
   // Existing remote state always wins over each device's local data.
   try{
    const initial=readLocal();
    const created=await syncRequest("save",{revision:0,state:initial});
    result={...result,state:initial,revision:created.revision};
   }catch(err){
    if(err.status===409)result=await syncRequest("state");
    else throw err;
   }
  }
  if(result.state){
   syncOnline=true;
   if(!serverReady||result.revision!==serverRevision||force){
    serverState=result.state;lastConfirmedState=copyState(result.state);
    serverRevision=result.revision;serverReady=true;render();
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
   localStorage.removeItem(SETUP);
   registration();
   notify("기기 연결이 만료되었습니다. 연결 코드를 다시 입력해주세요.");
  }else{
   if(force||!serverReady)notify(err.message||"DB에 연결할 수 없습니다.");
   if(serverReady)render();
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
 }).catch(async err=>{
  syncOnline=false;
  notify((err.status===409?"다른 기기에서 수정했습니다. ":"")+err.message);
  try{
   const current=await syncRequest("state");
   serverState=current.state;lastConfirmedState=copyState(current.state);
   serverRevision=current.revision;
   serverReady=!!current.state;serverDevice=current.device;syncOnline=true;
   render();
  }catch(_){
   // Do not leave a failed optimistic write displayed as committed.
   if(lastConfirmedState)serverState=copyState(lastConfirmedState);
   render();
  }
 }).finally(()=>{outstandingWrites--;});
}
async function submitChildChange(action,habitId,itemId=null){
 if(!serverReady||!syncOnline||navigator.onLine===false||childActionBusy||outstandingWrites){
  notify("DB 연결 또는 저장이 끝나면 다시 눌러주세요.");return;
 }
 childActionBusy=true;
 try{
  await syncRequest("check",{action,habitId,itemId});
 }catch(err){notify(err.message||"체크를 저장하지 못했습니다.");}
 finally{childActionBusy=false;}
 await loadFromDatabase(true);
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
 {id:"study",title:"공부하기",reward_minutes:10,sort_order:2,active:true,rotation:true,items:[{id:"math",title:"수학"},{id:"read",title:"책 읽기"},{id:"write",title:"받아쓰기 / 바르게 쓰기"}]},
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
  study.rotation=true;
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
  if(!serverReady||!serverState)throw Error("DB가 연결되지 않았습니다.");
  return copyState(serverState);
 }
 return readLocal();
}
function save(d){
 if(hasSyncToken()){
  if(!serverReady||!syncOnline||navigator.onLine===false)
   throw Error("DB가 연결되어 있을 때만 변경할 수 있습니다.");
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
function studyAssignment(d,day){
 const h=d.habits.find(x=>x.id==="study");
 if(!h||!h.items.length)return null;
 let plan=d.studyDays;
 if(plan[day]){plan[day].index%=h.items.length;return plan[day];}
 const previous=Object.keys(plan).filter(x=>x<day).sort().pop();
 if(!previous){plan[day]={index:0,since:day};return plan[day];}
 let cursor=nextDay(previous),old=plan[previous],guard=0;
 while(cursor<=day&&guard++<20000){
  const yesterday=nextDay(cursor,-1),yesterdayDone=check(d,"study",yesterday);
  const advance=(yesterdayDone&&["pending","approved"].includes(yesterdayDone.status))||diffDays(cursor,old.since)>=2;
  const current={index:advance?(old.index+1)%h.items.length:old.index,since:advance?cursor:old.since};
  plan[cursor]=current;old=current;cursor=nextDay(cursor);
 }
 return plan[day]||{index:0,since:day};
}
function shownItems(d,h,day){if(h.rotation&&h.items.length){const a=studyAssignment(d,day);return [h.items[a.index%h.items.length]];}return h.items;}
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
 else{done.add(itemId);d.subcheckTimes[k][itemId]=stamp;}
 d.subchecks[k]=Array.from(done);
 if(items.every(i=>done.has(i.id))){
  pushCheck(d,h,day);
  const c=check(d,hid,day);if(c)c.completed_items=items.map(i=>({title:i.title,at:d.subcheckTimes[k][i.id]||stamp}));
  signalParent(h.title);
 }
 else if(existing&&existing.status==="pending")d.checks=d.checks.filter(x=>x!==existing);
 if(h.rotation)Object.keys(d.studyDays).filter(date=>date>day).forEach(date=>delete d.studyDays[date]);
 save(d);render();
}
function submitSimple(hid){
 if(role()!=="child")return;
 if(hasSyncToken()){void submitChildChange("complete",hid);return;}
 const d=read(),day=seoulToday(),h=habit(d,hid);
 if(h.items.length)return;
 const c=check(d,hid,day);
 if(c&&c.status==="pending")d.checks=d.checks.filter(x=>x!==c);
 else if(!c||c.status==="rejected"){pushCheck(d,h,day);signalParent(h.title);}
 save(d);render();
}
function review(hid,status){
 requireParent();const d=read(),h=habit(d,hid),day=viewDay,c=check(d,hid,day);
 if(!c||!["pending","approved"].includes(c.status))return;
 if(status==="approved"&&c.status==="pending"){
  c.status="approved";c.awarded_minutes=h.reward_minutes;
  if(!Array.isArray(c.completed_items)){
   const done=new Set(checked(d,h.id,day)),k=checkKey(h.id,day);
   c.completed_items=shownItems(d,h,day).filter(i=>done.has(i.id)).map(i=>({title:i.title,at:d.subcheckTimes[k]?.[i.id]||c.submitted_at||new Date().toISOString()}));
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
function cycleStudy(){
 requireParent();const d=read(),h=habit(d,"study"),c=check(d,"study",viewDay);
 if(c&&c.status==="approved"){notify("승인된 항목은 변경할 수 없습니다.");return;}
 if(c&&c.status==="pending"&&!confirm("진행 중인 완료 요청을 취소하고 공부 항목을 변경할까요?"))return;
 const entry=studyAssignment(d,viewDay),next=(entry.index+1)%h.items.length;
 d.studyDays[viewDay]={index:next,since:viewDay};
 Object.keys(d.studyDays).filter(k=>k>viewDay).forEach(k=>delete d.studyDays[k]);
 d.subchecks[checkKey("study",viewDay)]=[];
 if(c)d.checks=d.checks.filter(x=>x!==c);
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
function status(c){return c?.status==="approved"?"완료":c?.status==="rejected"?"다시 하기":"";}
function renderTask(d,h,day,r){
 const c=check(d,h.id,day),items=shownItems(d,h,day),
  done=new Set(checked(d,h.id,day)),isParent=r==="parent",state=status(c),
  complete=c?.status==="approved",pending=c?.status==="pending",
  allTicked=complete||(items.length>0?items.every(item=>done.has(item.id)):pending);
 const checkedMark='<span class="dot '+(allTicked?"on":"")+'">'+(allTicked?"✓":"")+'</span>';
 const label='<span class="task-name">'+safe(h.title)+'</span>';
 const titleRow=!isParent&&items.length===0?
  '<button type="button" class="task-label task-click" data-action="complete" data-id="'+safe(h.id)+'" aria-pressed="'+(allTicked?"true":"false")+'" '+(complete?"disabled":"")+'>'+checkedMark+label+'</button>':
  '<div class="task-label">'+checkedMark+label+'</div>';
 const actions=[];
 if(h.rotation&&isParent&&h.items.length>1&&!complete)actions.push(el("다음","tiny","cycle",'aria-label="다음 공부 항목"'));
 // Editing is available in one separate parent settings window.
 let detail="";
 // Keep all study topics visible; only today's one is checkable.
 // Study rotates the recommended task every two days (or the next day after completion).
 if(items.length&&(isParent||!complete)){
  const visible=h.rotation&&h.items.length>1?h.items:items;
  const todays=new Set(items.map(item=>item.id));
  detail='<div class="subtasks '+(h.rotation?"study-list":"")+'">'+visible.map(item=>{
   const assigned=todays.has(item.id),itemDone=assigned&&(complete||done.has(item.id)),
    dot='<span class="dot '+(itemDone?"on":"")+'">'+(itemDone?"✓":"")+'</span>';
   const topic='<span>'+safe(item.title)+'</span>'+
    (h.rotation&&assigned?'<small class="study-today-chip">오늘</small>':"");
   if(isParent||!assigned)return '<div class="subitem '+(assigned?"study-current":"study-upcoming")+'">'+dot+topic+'</div>';
   return '<button type="button" class="subitem selectable study-current" data-action="toggle" data-id="'+safe(h.id)+'" data-item="'+safe(item.id)+'" '+(complete?"disabled":"")+'>'+dot+topic+'</button>';
  }).join("")+'</div>';
 }
 if(h.rotation&&h.items.length>1){
  if(complete){
   const title=c?.completed_items?.[0]?.title||shownItems(d,h,day)[0]?.title||"";
   detail+='<div class="study-next">완료한 공부: '+safe(title)+'</div>';
  }else{
   const assigned=studyAssignment(d,day);
   const next=h.items[(assigned.index+1)%h.items.length];
   detail+='<div class="study-next">다음: '+safe(next.title)+' <span>· 2일 순환</span></div>';
  }
 }
 let actionsBottom="";
 if(isParent&&pending)actionsBottom='<div class="task-foot">'+el("확인","primary","review",'data-id="'+safe(h.id)+'" data-status="approved"')+'</div>';
 else if(isParent&&complete&&sameActionDay(c?.reviewed_at))actionsBottom='<div class="task-foot">'+el("완료 취소","ghost","review",'data-id="'+safe(h.id)+'" data-status="rejected"')+'</div>';
 return '<article class="task '+(complete?"task-done":pending?"task-checked":c?.status==="rejected"?"task-retry":"")+'"><div class="task-top">'+titleRow+
  '<div class="right">'+(state?'<span class="state '+(complete?"done":"")+'">'+state+'</span>':'')+
  '<span class="reward">+'+h.reward_minutes+'분</span>'+actions.join("")+'</div></div>'+
  detail+actionsBottom+'</article>';
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
  const stepCount=h.rotation&&h.items.length?1:Math.max(1,h.items.length);
  if(!available){result.byId[h.id]={status:"out",steps:0,total:stepCount};return;}
  const c=check(d,h.id,day),status=c?.status||"";
  const ids=new Set(checked(d,h.id,day));
  const stepItems=h.rotation?h.items:[...(h.items||[])];
  // The daily study choice is a single assigned item, never all three.
  let ticked=0;
  if(status==="approved"||status==="pending")ticked=stepCount;
  else if(stepItems.length){
   if(h.rotation)ticked=Math.min(1,ids.size);
   else ticked=stepItems.filter(x=>ids.has(x.id)).length;
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
 const items=d.bonusItems.filter(x=>x.active!==false).sort((a,b)=>b.minutes-a.minutes);
 const chips=items.map(item=>
  '<span class="child-bonus-chip"><span>'+safe(item.title)+'</span>'+
  '<b class="'+(item.minutes>0?"positive":"negative")+'">'+(item.minutes>0?"+":"")+item.minutes+'분</b></span>'
 ).join("");
 return '<section class="child-bonus-group" aria-label="상벌 보너스">'+
  '<div class="child-bonus-line"><strong>상벌 보너스</strong>'+
  '<div class="child-bonus-inline">'+(chips||'<span class="child-bonus-empty">등록된 항목 없음</span>')+'</div></div></section>';
}
function renderChildProgress(d,active,day){
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
 const percent=total?Math.round(done/total*100):0;
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
  '<img src="/kid-habits/good-habit-icon-512.webp?v=good-habit-v1" width="40" height="40" alt="" aria-hidden="true"></span>';
 const syncDot=r&&hasSyncToken()?'<span class="sync-indicator '+(!syncOnline?"is-offline":outstandingWrites?"is-saving":"")+'" role="status" aria-label="'+
  (!syncOnline?"DB 연결 확인 필요":outstandingWrites?"DB 저장 중":"DB 연결됨")+'" title="'+
  (!syncOnline?"DB 연결 확인 필요":outstandingWrites?"DB 저장 중":"DB 연결됨")+'">●</span>':"";
 return '<header class="top">'+mark+syncDot+
  (r==="child"&&childPreview?'<div class="header-actions">'+el("부모 모드로 돌아가기","mode return-parent","return-parent",'aria-label="부모 모드로 돌아가기"')+'</div>':"")+
  (r==="parent"?'<div class="header-actions">'+
   el("전체 편집","mode","bulk-edit")+
   el("아이 모드로 전환","mode","role",'aria-label="아이 모드로 일시 전환"')+
   '</div>':"")+'</header>';
}
async function registerDevice(pin,mode,code){
 if(pin!=="5555")throw Error("등록 비밀번호를 확인해주세요.");
 if(!["parent","child"].includes(mode))throw Error("사용할 화면을 선택해주세요.");
 const trimmed=String(code||"").trim();
 if(trimmed.length<12)throw Error("기기 연결 코드를 입력해주세요.");
 const paired=await pairRequest(trimmed,mode);
 localStorage.setItem(SYNC_TOKEN,paired.token);
 localStorage.setItem(MODE,paired.role);
 localStorage.setItem(SETUP,"1");
 childPreview=false;viewDay=seoulToday();screen="today";
 render();
 await loadFromDatabase(true);
 if(serverReady)notify("공통 DB 연결 완료 · "+paired.label);
}
function registration(){
 app.innerHTML='<main class="wrap view-registration">'+header(null)+
 '<section class="pin"><form id="pinForm">'+
 '<h1 class="setup-title">좋은습관 시작하기</h1>'+
 '<p class="setup-description">이 기기에서 사용할 화면을 선택해주세요.</p>'+
 '<fieldset class="setup-modes"><legend>사용 모드 선택</legend>'+
 '<label class="setup-mode"><input type="radio" name="deviceMode" value="parent" required>'+
 '<span class="setup-mode-content"><strong>부모 모드</strong><small>할 일 관리 · 상벌 적용 · 아이 화면 미리보기</small></span></label>'+
 '<label class="setup-mode"><input type="radio" name="deviceMode" value="child" required>'+
 '<span class="setup-mode-content"><strong>아이 모드</strong><small>매일 할 일 체크 · 기록 확인</small></span></label></fieldset>'+
 '<label for="pin" class="setup-pin-label">최초 등록 비밀번호</label>'+
 '<input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off" placeholder="4자리">'+
 '<label for="pairCode" class="setup-pin-label">기기 연결 코드</label>'+
 '<input id="pairCode" name="pairCode" type="text" minlength="12" maxlength="100" required autocomplete="off" spellcheck="false" autocapitalize="off" placeholder="부모에게 받은 연결 코드">'+
 '<p class="setup-note">연결된 기기는 같은 DB의 할 일·체크·보상 기록을 사용합니다. 부모 모드에서 다른 기기의 연결 코드를 발급할 수 있습니다.</p>'+
 '<button type="submit" class="primary">DB에 연결하고 시작</button></form></section></main>';
}
function render(){
 if(localStorage.getItem(SETUP)!=="1"||!hasSyncToken()){registration();return;}
 if(!serverReady){
  app.innerHTML='<main class="wrap view-registration">'+header(null)+
    '<section class="pin"><h2>공통 DB 연결 중</h2><p class="setup-description">부모 기기가 먼저 연결되어 데이터를 등록했는지 확인합니다.</p>'+
    el("다시 불러오기","primary","sync-retry")+'</section></main>';
  return;
 }
 const d=read(),r=role(),day=r==="child"?seoulToday():viewDay;
 if(r==="parent"&&day>seoulToday())viewDay=seoulToday();
 const active=d.habits.filter(h=>h.active).sort((a,b)=>a.sort_order-b.sort_order);
 if(active.some(h=>h.rotation&&h.items.length&&!d.studyDays[day])){
  active.filter(h=>h.rotation&&h.items.length).forEach(h=>studyAssignment(d,day));
  // Plan selection is computed when rendering; persisted in DB by an actual check.
 }
 const pending=d.checks.filter(c=>c.status==="pending").length;
 const balance='<section class="balance"><span>남은 보너스 시간</span><strong>'+time(totals(d))+'</strong>'+
  (r==="parent"?'<div class="balance-actions">'+el("시간 사용","ghost","use")+'</div>':'')+'</section>';
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
   '<span class="spacer"></span>'+el("기록 · 통계","tiny","history")+
   el("⋯","tiny","tools",'aria-label="백업 및 복원"')+'</div>':
   '<div class="daybar">'+el("‹ 오늘","tiny","today")+'<span class="spacer"></span>'+
   el("주간","tiny "+(statsUnit==="week"?"active":""),"statmode",'data-mode="week"')+
   el("월간","tiny "+(statsUnit==="month"?"active":""),"statmode",'data-mode="month"')+'</div>';
 const taskGroup='<section class="group"><div class="group-head"><h2>할 일</h2>'+
  '</div><div class="tasks">'+active.map(h=>renderTask(d,h,day,r)).join("")+'</div></section>';
 const bonusGroup=r==="parent"?'<section class="group"><div class="group-head"><h2>추가 상벌 보너스</h2></div>'+
  '<div class="bonus-list">'+d.bonusItems.map(item=>{
   const amount=(item.minutes>0?"+":"")+item.minutes+"분";
   return '<article class="bonus-entry '+(item.active===false?"inactive":"")+'"><span class="bonus-description">'+safe(item.title)+'</span>'+
    '<span class="bonus-amount '+(item.minutes>0?"positive":"negative")+'">'+amount+'</span>'+
    (item.active!==false?el("적용","tiny apply","bonus-apply",'data-id="'+safe(item.id)+'"'):"")+'</article>';
  }).join("")+'</div></section>':"";
 const childBonus=r==="child"?renderChildBonusItems(d):"";
 const content=screen==="today"?taskGroup+(r==="parent"?bonusGroup:childBonus):
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
 if(r==="parent"&&pending>lastPending&&document.visibilityState==="visible"){
  try{if("Notification" in window&&Notification.permission==="granted")new Notification("좋은습관",{body:"확인할 항목 "+pending+"개",tag:"bonus-pending"});}catch(_){}
 }
 lastPending=pending;
}
function open(content){dialogBody.innerHTML=content;if(!dialog.open)dialog.showModal();}
function close(){
 const form=document.getElementById("bulkForm");
 if(form?.dataset.dirty==="1"&&!confirm("저장하지 않은 변경사항을 버릴까요?"))return;
 dialog.close();
}
function notify(msg){const el=document.getElementById("toast");el.textContent=msg;el.hidden=false;clearTimeout(notify.timeout);notify.timeout=setTimeout(()=>el.hidden=true,2400);}

function bulkTaskRow(h){
 const e=h||{id:"",title:"",reward_minutes:5,items:[],active:true};
 const subs=(e.items||[]).map(item=>bulkSubRow(item.title)).join("");
 return '<details name="bulk-tasks" class="bulk-row bulk-task-row" data-created="'+(!h?"1":"0")+'" '+(!h?"open":"")+'>'+
  '<summary class="bulk-summary"><span class="bulk-summary-left">'+
  '<strong class="bulk-summary-title">'+safe(e.title||"새 할 일")+'</strong>'+
  '<small class="bulk-summary-extra">+'+e.reward_minutes+'분 · '+(e.items.length?e.items.length+"개 하위 항목":"단일 체크")+'</small>'+
  '</span><span class="bulk-summary-status">'+(e.active?"":"사용 안 함")+'</span>'+
  '<span class="bulk-chevron" aria-hidden="true">⌄</span></summary>'+
  '<div class="bulk-panel"><input type="hidden" name="task-id" value="'+safe(e.id)+'">'+
  '<div class="bulk-inline-fields"><label>할 일 이름<input name="task-title" maxlength="80" value="'+safe(e.title)+'"></label>'+
  '<label>적립 시간 (분)<input name="task-minutes" type="number" min="1" max="180" value="'+e.reward_minutes+'"></label></div>'+
  '<div class="bulk-subsection"><div class="bulk-subhead"><strong>하위 항목</strong>'+
  el("+ 추가","tiny","bulk-add-sub")+'</div>'+
  '<div class="bulk-subitems">'+subs+'</div>'+
  '<textarea name="task-items" class="bulk-hidden-items" hidden tabindex="-1" aria-hidden="true">'+
  safe(e.items.map(x=>x.title).join("\n"))+'</textarea></div>'+
  '<div class="bulk-row-options"><label class="bulk-active"><input type="checkbox" name="task-active" '+(e.active?"checked":"")+'> 사용하기</label>'+
  (!h?el("항목 삭제","tiny muted","bulk-remove"):"")+'</div></div></details>';
}
function bulkSubRow(value){
 return '<div class="bulk-subitem"><input type="text" name="sub-title" aria-label="하위 항목" maxlength="48" placeholder="하위 항목 이름" value="'+safe(value||"")+'">'+
  el("×","tiny muted","bulk-remove-sub",'aria-label="하위 항목 삭제"')+'</div>';
}
function bulkBonusRow(item){
 const b=item||{id:"",title:"",minutes:10,active:true};
 return '<details name="bulk-bonuses" class="bulk-row bulk-bonus-row" data-created="'+(!item?"1":"0")+'" '+(!item?"open":"")+'>'+
  '<summary class="bulk-summary"><span class="bulk-summary-left">'+
  '<strong class="bulk-summary-title">'+safe(b.title||"새 상벌")+'</strong>'+
  '<small class="bulk-summary-extra '+(b.minutes>0?"positive":"negative")+'">'+(b.minutes>0?"+":"")+b.minutes+'분</small>'+
  '</span><span class="bulk-summary-status">'+(b.active?"":"사용 안 함")+'</span>'+
  '<span class="bulk-chevron" aria-hidden="true">⌄</span></summary>'+
  '<div class="bulk-panel"><input type="hidden" name="bonus-id" value="'+safe(b.id)+'">'+
  '<label>상벌 이름<input name="bonus-title" maxlength="80" value="'+safe(b.title)+'"></label>'+
  '<div class="bulk-inline-fields"><label>구분<select name="bonus-type">'+
  '<option value="add" '+(b.minutes>0?"selected":"")+'>상점 (+)</option>'+
  '<option value="subtract" '+(b.minutes<0?"selected":"")+'>벌점 (−)</option></select></label>'+
  '<label>시간 (분)<input name="bonus-minutes" type="number" min="1" max="300" value="'+Math.abs(b.minutes)+'"></label></div>'+
  '<div class="bulk-row-options"><label class="bulk-active"><input type="checkbox" name="bonus-active" '+(b.active!==false?"checked":"")+'> 사용하기</label>'+
  (!item?el("항목 삭제","tiny muted","bulk-remove"):"")+'</div></div></details>';
}
function bulkEditor(){
 requireParent();
 const d=read(),habits=d.habits.filter(h=>!h.moved_to_parent_bonus).sort((a,b)=>a.sort_order-b.sort_order);
 open('<form id="bulkForm" class="form bulk-form" data-dirty="0">'+
   '<div class="bulk-editor-head"><h2>항목 편집</h2>'+el("닫기","tiny","close")+'</div>'+
   '<div class="bulk-tabs" role="tablist" aria-label="편집할 항목">'+
   '<button type="button" role="tab" aria-selected="true" class="bulk-tab active" data-action="bulk-tab" data-panel="tasks">할 일 <small>'+habits.length+'</small></button>'+
   '<button type="button" role="tab" aria-selected="false" class="bulk-tab" data-action="bulk-tab" data-panel="bonuses">상벌 <small>'+d.bonusItems.length+'</small></button></div>'+
   '<section class="bulk-section" id="bulkPanelTasks" data-bulk-panel="tasks" role="tabpanel">'+
   '<div class="bulk-section-head"><span>수정할 항목을 선택하세요</span>'+el("+ 할 일","tiny","bulk-add-task")+'</div>'+
   '<div id="bulkTasks" class="bulk-list">'+habits.map(bulkTaskRow).join("")+'</div></section>'+
   '<section class="bulk-section" id="bulkPanelBonuses" data-bulk-panel="bonuses" role="tabpanel" hidden>'+
   '<div class="bulk-section-head"><span>수정할 상벌을 선택하세요</span>'+el("+ 상벌","tiny","bulk-add-bonus")+'</div>'+
   '<div id="bulkBonuses" class="bulk-list">'+d.bonusItems.map(bulkBonusRow).join("")+'</div></section>'+
   '<div class="bulk-footer">'+el("취소","ghost","close")+
   '<button type="submit" class="primary">변경사항 저장</button></div></form>');
}
function bulkSetTab(name){
 const form=document.getElementById("bulkForm");if(!form||!["tasks","bonuses"].includes(name))return;
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
 if(form)form.dataset.dirty="1";
}
function bulkSyncRows(form){
 if(!form)return;
 form.querySelectorAll(".bulk-task-row").forEach(row=>{
  const textarea=row.querySelector('[name="task-items"]');
  if(!textarea)return;
  textarea.value=Array.from(row.querySelectorAll('.bulk-subitems [name="sub-title"]'))
   .map(input=>String(input.value||"").trim()).filter(Boolean).join("\n");
 });
}
function bulkUpdatePreview(row){
 if(!row)return;
 const find=name=>row.querySelector('[name="'+name+'"]');
 const task=row.classList.contains("bulk-task-row"),
   title=find(task?"task-title":"bonus-title")?.value?.trim()|| (task?"새 할 일":"새 상벌"),
   amount=Number(find(task?"task-minutes":"bonus-minutes")?.value||0),
   sign=task||find("bonus-type")?.value==="add"?"+":"−",
   count=task?row.querySelectorAll('.bulk-subitems [name="sub-title"]').length:0;
 const label=row.querySelector(".bulk-summary-title"),
  extra=row.querySelector(".bulk-summary-extra"),
  inactive=row.querySelector(".bulk-summary-status");
 if(label)label.textContent=title;
 if(extra){
  extra.textContent=sign+amount+"분"+(task?" · "+(count?count+"개 하위 항목":"단일 체크"):"");
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
   title=get(row,"task-title"),minutes=Number(get(row,"task-minutes")),
   subitems=String(field(row,"task-items")?.value||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if((id&&!prev)||!title||title.length>80||!Number.isInteger(minutes)||minutes<1||minutes>180||
     subitems.length>20||subitems.some(x=>x.length>48))throw Error("할 일 이름, 시간, 하부 항목을 확인해주세요.");
  const already=prev?.items||[];
  const reserved=new Set();
  const items=subitems.map((name,i)=>{
   const found=already[i]?.title===name&&!reserved.has(already[i].id)?already[i]:
     already.find(x=>x.title===name&&!reserved.has(x.id));
   if(found)reserved.add(found.id);
   return {id:found?.id||uid(),title:name};
  });
  return prev?{...prev,title,reward_minutes:minutes,items,active:bool(row,"task-active"),sort_order:index+1}:
   {id:uid(),title,reward_minutes:minutes,items,active:bool(row,"task-active"),
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
function toolsPanel(){
 requireParent();
 open('<div class="form"><div class="modal-head"><h2>설정 · 데이터</h2>'+el("닫기","tiny","close")+'</div>'+
 '<div class="parent-device-settings"><strong>공통 DB</strong>'+
 '<p>연결됨 · '+safe(serverDevice?.label||"부모")+' · 실시간에 가까운 자동 갱신</p>'+
 el("아이·부모 기기 연결 코드","ghost","device-list")+
 '<small>아이 태블릿이나 다른 부모 휴대폰에서 연결할 때 사용할 코드를 발급할 수 있습니다. 이미 연결된 기기의 코드를 새로 발급하면 이전 연결은 해제됩니다.</small>'+
 '</div><div class="form-actions">'+el("DB 데이터 백업","ghost","export")+el("백업 불러오기","primary","import")+
 '</div><input id="restoreFile" type="file" accept=".json,application/json" hidden></div>');
}
async function showDeviceCodes(){
 requireParent();
 const result=await syncRequest("devices");
 const rows=result.devices||[];
 open('<div class="form"><div class="modal-head"><h2>기기 연결</h2>'+el("닫기","tiny","close")+'</div>'+
 '<p class="setup-note">아래 기기를 선택해 1회용 연결 코드를 발급합니다.</p>'+
 rows.map(d=>'<div class="device-code-row"><div><strong>'+safe(d.label)+'</strong>'+
 '<small>'+(d.role==="parent"?"부모용":"아이용")+' · '+(d.paired_at?"연결됨":"연결 전")+'</small></div>'+
 el("코드 발급","tiny","device-code",'data-id="'+safe(d.id)+'" data-connected="'+(d.paired_at?"1":"0")+'"')+
 '</div>').join("")+'</div>');
}
async function issueDeviceCode(id,isConnected){
 requireParent();
 if(isConnected&&!confirm("이미 연결된 기기입니다. 새 코드를 발급하면 기존 기기의 연결이 해제됩니다. 계속할까요?"))return;
 const d=await syncRequest("reissue",{targetId:id});
 open('<div class="form"><div class="modal-head"><h2>'+safe(d.label)+' 연결 코드</h2>'+el("닫기","tiny","close")+'</div>'+
 '<p class="setup-note">대상 기기의 좋은습관 첫 화면에서 해당 모드와 아래 코드를 입력해주세요.</p>'+
 '<div class="device-code-value" id="generatedDeviceCode">'+safe(d.code)+'</div>'+
 el("코드 복사","primary","copy-code",'data-code="'+safe(d.code)+'"')+'</div>');
}
function assignChildMode(){
 requireParent();
 if(!confirm("이 기기를 아이 전용으로 설정할까요?\n아이 화면에는 부모 모드 전환 버튼이 표시되지 않습니다.\n저장된 기록은 유지됩니다."))return;
 localStorage.setItem(MODE,"child");
 viewDay=seoulToday();screen="today";statsAnchor=seoulToday();close();render();
}
function exportData(){
 const blob=new Blob([JSON.stringify(read(),null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="좋은습관-"+seoulToday()+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
 notify("백업 저장");
}
document.addEventListener("click",e=>{
 const t=e.target.closest("[data-action]");if(!t)return;
 const act=t.dataset.action,hid=t.dataset.id;
 try{
  if(act==="role"&&role()==="parent"){
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
  else if(act==="cycle")cycleStudy();
  else if(act==="bulk-edit"&&role()==="parent")bulkEditor();
  else if(act==="bulk-tab"&&role()==="parent")bulkSetTab(t.dataset.panel);
  else if(act==="bulk-add-task"&&role()==="parent"){
   const list=document.getElementById("bulkTasks");
   list?.insertAdjacentHTML("beforeend",bulkTaskRow(null));
   const row=list?.lastElementChild;if(row){row.open=true;row.querySelector('[name="task-title"]')?.focus();}
   bulkDirty(document.getElementById("bulkForm"));
  }
  else if(act==="bulk-add-bonus"&&role()==="parent"){
   const list=document.getElementById("bulkBonuses");
   list?.insertAdjacentHTML("beforeend",bulkBonusRow(null));
   const row=list?.lastElementChild;if(row){row.open=true;row.querySelector('[name="bonus-title"]')?.focus();}
   bulkDirty(document.getElementById("bulkForm"));
  }
  else if(act==="bulk-add-sub"&&role()==="parent"){
   const row=t.closest(".bulk-task-row"),list=row?.querySelector(".bulk-subitems");
   list?.insertAdjacentHTML("beforeend",bulkSubRow(""));
   list?.lastElementChild?.querySelector("input")?.focus();
   bulkUpdatePreview(row);bulkDirty(document.getElementById("bulkForm"));
  }
  else if(act==="bulk-remove-sub"&&role()==="parent"){
   const row=t.closest(".bulk-task-row");
   t.closest(".bulk-subitem")?.remove();
   bulkUpdatePreview(row);bulkDirty(document.getElementById("bulkForm"));
  }
  else if(act==="bulk-remove"&&role()==="parent"&&t.closest(".bulk-row")?.dataset.created==="1"){
   t.closest(".bulk-row").remove();
   bulkDirty(document.getElementById("bulkForm"));
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
  else if(act==="tools"&&role()==="parent")toolsPanel();
  else if(act==="device-list"&&role()==="parent")void showDeviceCodes().catch(e=>notify(e.message));
  else if(act==="device-code"&&role()==="parent")void issueDeviceCode(hid,t.dataset.connected==="1").catch(e=>notify(e.message));
  else if(act==="copy-code"&&role()==="parent"){
   void navigator.clipboard.writeText(t.dataset.code||"").then(()=>notify("연결 코드 복사 완료")).catch(()=>notify("코드를 길게 눌러 복사해주세요."));
  }
  else if(act==="sync-retry")void loadFromDatabase(true);
  else if(act==="close")close();
  else if(act==="export"&&role()==="parent")exportData();
  else if(act==="import"&&role()==="parent")document.getElementById("restoreFile")?.click();
 }catch(err){notify(err.message||"처리 실패");}
});
document.addEventListener("submit",e=>{
 const f=e.target;
 if(!["pinForm","bulkForm","bonusApplyForm","useForm"].includes(f.id))return;
 e.preventDefault();
 const v=Object.fromEntries(new FormData(f).entries());
 try{
  if(f.id==="pinForm"){
   void registerDevice(v.pin,v.deviceMode,v.pairCode).catch(err=>notify(err.message||"기기 연결 실패"));return;
  }
  if(f.id==="bulkForm"){
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
 bulkUpdatePreview(row);bulkDirty(document.getElementById("bulkForm"));
});
document.addEventListener("change",e=>{
 const row=e.target.closest?.(".bulk-row");
 if(!row||role()!=="parent")return;
 bulkUpdatePreview(row);bulkDirty(document.getElementById("bulkForm"));
});
dialog.addEventListener("cancel",e=>{
 if(document.getElementById("bulkForm")?.dataset.dirty==="1"&&!confirm("저장하지 않은 변경사항을 버릴까요?"))e.preventDefault();
});
document.addEventListener("change",async e=>{
 if(e.target.id!=="restoreFile"||!e.target.files?.length)return;
 if(role()!=="parent"){notify("부모 화면에서 관리해주세요.");return;}
 const file=e.target.files[0];e.target.value="";
 if(file.size>8e6){notify("파일 크기 초과");return;}
 try{
  const d=JSON.parse(await file.text());if(!validate(d))throw Error("백업 형식을 확인해주세요.");
  if(!confirm("현재 기록을 백업 내용으로 교체할까요?"))return;
  save(migrate(d));close();render();notify("복원 완료");
 }catch(err){notify(err.message||"복원 실패");}
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
if("serviceWorker" in navigator)navigator.serviceWorker.register("/kid-habits/sw.js",{scope:"/kid-habits/"}).catch(()=>{});
if(hasSyncToken()){
 void loadFromDatabase(true);
}
setInterval(()=>{
 if(hasSyncToken()&&document.visibilityState==="visible"&&!outstandingWrites&&!childActionBusy)void loadFromDatabase();
},5000);
window.addEventListener("online",()=>{if(hasSyncToken())void loadFromDatabase(true);});
render();
})();

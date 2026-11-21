(()=>{
"use strict";
const STORE="kid_habits_personal_v1",SETUP="kid_habits_personal_setup_v1",MODE="kid_habits_personal_role_v1";
const app=document.getElementById("app"),dialog=document.getElementById("modal"),dialogBody=document.getElementById("modalBody");
let viewDay=seoulToday(),screen="today",statsUnit="week",statsAnchor=seoulToday(),lastPending=0;
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
function fresh(){return {version:6,started_on:seoulToday(),habits:JSON.parse(JSON.stringify(starter)).map(h=>({...h,created_on:seoulToday()})),bonusItems:JSON.parse(JSON.stringify(DEFAULT_BONUSES)),checks:[],ledger:[],subchecks:{},subcheckTimes:{},studyDays:{}};}
function validate(d){return d&&[1,2,3,4,5,6].includes(d.version)&&Array.isArray(d.habits)&&Array.isArray(d.checks)&&Array.isArray(d.ledger)&&d.habits.length<500&&d.checks.length<100000&&d.ledger.length<100000&&d.habits.every(h=>h&&typeof h.id==="string"&&typeof h.title==="string"&&Number.isInteger(h.reward_minutes));}
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
 d.version=6;
 return d;
}
function read(){
 const raw=localStorage.getItem(STORE);let d;
 if(!raw)d=fresh();
 else{try{d=JSON.parse(raw);}catch(_){throw Error("저장된 기록을 읽을 수 없습니다.");}
 if(!validate(d))throw Error("기록 형식을 확인해주세요.");
 migrate(d);}
 if(!validate(d))throw Error("기록 형식을 확인해주세요.");
 if(!raw||d.version!==JSON.parse(raw).version)localStorage.setItem(STORE,JSON.stringify(d));
 return d;
}
function save(d){localStorage.setItem(STORE,JSON.stringify(d));}
function role(){return localStorage.getItem(MODE)==="child"?"child":"parent";}
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
 notify("부모 확인 대기 · "+title);
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
function status(c){return c?.status==="approved"?"완료":c?.status==="pending"?"확인 대기":c?.status==="rejected"?"다시 하기":"";}
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
 if(isParent)actions.push(el("편집","tiny muted","edit",'data-id="'+safe(h.id)+'"'));
 let detail="";
 // When the parent confirms, the child's subtask list collapses into a single checked row.
 if(items.length&&(isParent||!complete)){
  detail='<div class="subtasks">'+items.map(item=>{
   const itemDone=complete||done.has(item.id),dot='<span class="dot '+(itemDone?"on":"")+'">'+(itemDone?"✓":"")+'</span>';
   return isParent?'<div class="subitem">'+dot+'<span>'+safe(item.title)+'</span></div>':
    '<button type="button" class="subitem selectable" data-action="toggle" data-id="'+safe(h.id)+'" data-item="'+safe(item.id)+'" '+(complete?"disabled":"")+'>'+dot+'<span>'+safe(item.title)+'</span></button>';
  }).join("")+'</div>';
 }
 let actionsBottom="";
 if(isParent&&pending)actionsBottom='<div class="task-foot">'+el("확인","primary","review",'data-id="'+safe(h.id)+'" data-status="approved"')+el("다시 하기","ghost","review",'data-id="'+safe(h.id)+'" data-status="rejected"')+'</div>';
 else if(isParent&&complete&&sameActionDay(c?.reviewed_at))actionsBottom='<div class="task-foot">'+el("완료 취소","ghost","review",'data-id="'+safe(h.id)+'" data-status="rejected"')+'</div>';
 return '<article class="task '+(complete?"task-done":"")+'"><div class="task-top">'+titleRow+
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
function renderWeeklyChecklist(d,active,anchor){
 const range=period("week",anchor),week=Array.from({length:7},(_,i)=>nextDay(range.start,i)),
  byDay=week.map(day=>dailyCompletion(d,active,day)),overall=periodCompletion(d,active,range.start,range.end);
 const labels=["월","화","수","목","금","토","일"];
 const headers=week.map((day,i)=>'<th scope="col" class="'+(day===seoulToday()?"is-today":"")+'">'+
  labels[i]+'<small>'+Number(day.slice(8,10))+'</small></th>').join("");
 const displayed=active.concat(d.habits.filter(h=>h.moved_to_parent_bonus&&h.was_active_before_move&&
  week.some(day=>day>=d.started_on&&day>=h.created_on&&
   (day<h.moved_to_parent_on||(day===h.moved_to_parent_on&&check(d,h.id,day)?.status==="approved")))));
 const rows=displayed.map(h=>{
  const cells=byDay.map(m=>{
   const state=m.byId[h.id]||{status:"out"},key=state.status;
   const mark=key==="approved"?"✓":key==="pending"?"대기":key==="partial"?
    state.steps+"/"+state.total:key==="rejected"?"다시":"·";
   const accessible=key==="approved"?"부모 확인 완료":key==="pending"?"확인 대기":
    key==="partial"?state.steps+"개 체크 / "+state.total+"개":key==="rejected"?"다시 하기":
    key==="out"?"기록 대상 아님":"미완료";
   return '<td><span class="week-cell week-'+key+'" title="'+safe(m.day+" "+h.title+" "+accessible)+'" aria-label="'+safe(m.day+" "+h.title+" "+accessible)+'">'+mark+'</span></td>';
  }).join("");
  return '<tr><th scope="row">'+safe(h.title)+'</th>'+cells+'</tr>';
 }).join("");
 const totals=byDay.map(m=>'<td><span class="week-day-rate">'+(m.completedPercent===null?"—":m.completedPercent+"%")+'</span></td>').join("");
 const summary='<div class="completion-summary"><div><small>완료한 할 일</small><strong>'+
  overall.confirmed+' <em>/ '+overall.planned+'</em></strong></div>'+
  '<div><small>부모 확인 완료율</small><strong class="positive">'+(overall.percent===null?"—":overall.percent+"%")+'</strong></div>'+
  '<div><small>체크 진행률</small><strong class="neutral">'+(overall.checkedPercent===null?"—":overall.checkedPercent+"%")+'</strong></div></div>';
 return '<section class="child-weekly"><div class="period-nav">'+
  el("‹","date-button","statprev")+'<strong>'+dateLabel(range.start)+' ~ '+dateLabel(range.end)+'</strong>'+
  el("›","date-button","statnext",range.end>=seoulToday()?"disabled":"")+'</div>'+summary+
  '<div class="week-grid-scroll"><table class="week-matrix"><thead><tr><th scope="col">할 일</th>'+headers+
  '</tr></thead><tbody>'+rows+'</tbody><tfoot><tr><th scope="row">완료율</th>'+totals+'</tr></tfoot></table></div>'+
  '<div class="week-legend"><span><b class="week-cell week-approved">✓</b> 확인 완료</span>'+
  '<span><b class="week-cell week-pending">대기</b> 확인 대기</span>'+
  '<span><b class="week-cell week-partial">1/4</b> 일부 체크</span></div>'+
  '<div class="group-head"><h2>이번 주 기록</h2></div>'+renderWeekEvents(d,range.start,range.end)+'</section>';
}
function renderWeekEvents(d,start,end){
 const events=[];
 d.ledger.filter(l=>l.day>=start&&l.day<=end).forEach(l=>events.push({type:"ledger",day:l.day,
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
   amount='<span class="waiting">확인 대기</span>';
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
 const valid=weeks.map((w,i)=>({...w,i})).filter(w=>w.metrics.percent!==null),
  width=640,height=232,left=45,right=18,top=20,bottom=36,
  spanX=width-left-right,spanY=height-top-bottom,
  y=v=>top+spanY*(100-v)/100,
  x=i=>left+spanX*(weeks.length===1?.5:i/(weeks.length-1));
 const guides=[0,50,100].map(n=>
  '<line x1="'+left+'" x2="'+(width-right)+'" y1="'+y(n)+'" y2="'+y(n)+'" stroke="#e1e9e2" stroke-width="1"/>'+
  '<text x="'+(left-10)+'" y="'+(y(n)+4)+'" text-anchor="end" font-size="12" fill="#79877e">'+n+'</text>').join("");
 function line(key,color,dash){
  const data=valid.map(w=>({x:x(w.i),y:y(w.metrics[key]),value:w.metrics[key]}));
  if(!data.length)return "";
  const poly='<polyline points="'+data.map(p=>p.x+','+p.y).join(" ")+'" fill="none" stroke="'+color+
   '" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" '+(dash?'stroke-dasharray="7 6"':"")+'/>';
  return poly+data.map(p=>'<circle cx="'+p.x+'" cy="'+p.y+'" r="5" fill="'+color+'" stroke="white" stroke-width="2.3"/>').join("");
 }
 const labels=weeks.map((w,i)=>'<text x="'+x(i)+'" y="'+(height-10)+'" text-anchor="middle" font-size="13" fill="#62776a">'+(i+1)+'주</text>').join("");
 return '<svg class="completion-svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="월간 주별 확인 완료율과 체크율의 변화" xmlns="http://www.w3.org/2000/svg">'+
  guides+line("percent","#2e8056",false)+line("checkedPercent","#b48643",true)+labels+'</svg>';
}
function renderMonthlyCompletion(d,active,anchor){
 const {range,weeks}=monthlyWeeks(d,active,anchor),
  overall=periodCompletion(d,active,range.start,range.end),
  ledger=summaryRows(d,"month",range).sum;
 let previous=null;
 const lines=weeks.map((week,i)=>{
  const m=week.metrics;
  let delta='—',deltaClass="";
  if(m.percent!==null&&previous!==null){
   const diff=m.percent-previous;delta=(diff>0?"+":"")+diff+"%p";
   deltaClass=diff>0?"positive":diff<0?"negative":"";
  }
  if(m.percent!==null)previous=m.percent;
  return '<div class="trend-entry"><span class="trend-label">'+(i+1)+'주 <small>'+week.label+'</small></span>'+
   '<span class="trend-rate">'+(m.percent===null?"—":m.percent+"%")+'</span>'+
   '<span class="trend-change '+deltaClass+'">'+delta+'</span></div>';
 }).join("");
 return '<section class="child-monthly"><div class="period-nav">'+
  el("‹","date-button","statprev")+'<strong>'+range.title+'</strong>'+
  el("›","date-button","statnext",range.end>=seoulToday()?"disabled":"")+'</div>'+
  '<div class="completion-summary month-summary"><div><small>완료한 할 일</small><strong>'+overall.confirmed+
  ' <em>/ '+overall.planned+'</em></strong></div>'+
  '<div><small>확인 완료율</small><strong class="positive">'+(overall.percent===null?"—":overall.percent+"%")+'</strong></div>'+
  '<div><small>체크 진행률</small><strong>'+ (overall.checkedPercent===null?"—":overall.checkedPercent+"%")+'</strong></div></div>'+
  '<div class="completion-chart"><div class="group-head"><h2>주별 완료율 변화</h2></div>'+
  '<div class="chart-legend"><span><i class="confirmed-line"></i>확인 완료율</span>'+
  '<span><i class="checked-line"></i>체크 진행률</span></div>'+
  weeklyTrendSvg(weeks)+'<div class="trend-rows">'+lines+'</div></div>'+
  '<div class="month-bonus-summary"><div><small>보너스 적립</small><strong class="positive">+'+time(ledger.plus)+'</strong></div>'+
  '<div><small>차감 · 사용</small><strong class="negative">−'+time(ledger.minus)+'</strong></div></div>'+
  '</section>';
}
function renderChildBonusItems(d){
 const items=d.bonusItems.filter(x=>x.active!==false).sort((a,b)=>b.minutes-a.minutes);
 const cards=items.map(item=>
  '<div class="child-bonus-item"><span class="child-bonus-name">'+safe(item.title)+'</span>'+
  '<strong class="'+(item.minutes>0?"positive":"negative")+'">'+(item.minutes>0?"+":"")+item.minutes+'분</strong></div>'
 ).join("");
 return '<section class="child-bonus-group" aria-label="추가 상벌 보너스">'+
  '<div class="group-head"><h2>추가 상벌 보너스</h2></div>'+
  '<div class="child-bonus-list">'+(cards||'<p class="child-empty">등록된 항목 없음</p>')+'</div></section>';
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
 const weekly=summaryRows(d,"week",period("week",day)).sum;
 const recent=d.ledger.slice(0,4).map(l=>{
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
  '<div class="child-progress-states"><span><b class="positive">'+confirmed+'</b> 완료</span><span><b class="waiting">'+waiting+'</b> 확인 대기</span></div>'+
  '</section>'+
  '<section class="child-week"><div class="child-section-title">이번 주</div>'+
  '<div class="child-week-pair"><div><small>모은 시간</small><strong class="positive">+'+time(weekly.plus)+'</strong></div>'+
  '<div><small>차감 · 사용</small><strong class="negative">−'+time(weekly.minus)+'</strong></div></div></section>'+
  '<section class="child-recent"><div class="child-section-title">최근 기록</div>'+
  (recent||'<p class="child-empty">기록 없음</p>')+
  el("전체 기록 보기","child-history-button","history")+'</section>';
}
function header(r){return '<header class="top"><strong>보너스 시간</strong>'+(r?el(r==="parent"?"아이 화면":"부모 화면","mode","role"):"")+'</header>';}
function registration(){
 app.innerHTML='<main class="wrap view-registration">'+header(null)+'<section class="pin"><form id="pinForm"><label for="pin">최초 등록 비밀번호</label><input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off" autofocus placeholder="4자리">'+
 '<button type="submit" class="primary">등록</button></form></section></main>';
}
function render(){
 if(localStorage.getItem(SETUP)!=="1"){registration();return;}
 const d=read(),r=role(),day=r==="child"?seoulToday():viewDay;
 if(r==="parent"&&day>seoulToday())viewDay=seoulToday();
 const active=d.habits.filter(h=>h.active).sort((a,b)=>a.sort_order-b.sort_order);
 if(active.some(h=>h.rotation&&h.items.length&&!d.studyDays[day])){
  active.filter(h=>h.rotation&&h.items.length).forEach(h=>studyAssignment(d,day));save(d);
 }
 const pending=d.checks.filter(c=>c.status==="pending").length;
 const balance='<section class="balance"><span>남은 보너스 시간</span><strong>'+time(totals(d))+'</strong>'+
  (r==="parent"?'<div class="balance-actions">'+el("시간 사용","ghost","use")+'</div>':'')+'</section>';
 const pendingBanner=r==="parent"&&pending?
  '<button type="button" class="pending-banner" data-action="pending"><span class="pending-pulse"></span>확인할 항목 '+pending+'개 <span>보기 ›</span></button>':'';
 const nav=r==="child"?
  '<nav class="child-view-tabs" aria-label="조회 기간">'+
   el("오늘","view-tab "+(screen==="today"?"selected":""),"child-tab",'data-tab="today" aria-pressed="'+(screen==="today")+'"')+
   el("주간","view-tab "+(screen==="week"?"selected":""),"child-tab",'data-tab="week" aria-pressed="'+(screen==="week")+'"')+
   el("월간","view-tab "+(screen==="month"?"selected":""),"child-tab",'data-tab="month" aria-pressed="'+(screen==="month")+'"')+
   '<span class="spacer"></span>'+el("⋯","tiny","tools",'aria-label="백업 및 복원"')+'</nav>'+
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
  (r==="parent"?el("+ 항목","tiny","new"):"")+'</div><div class="tasks">'+active.map(h=>renderTask(d,h,day,r)).join("")+'</div></section>';
 const bonusGroup=r==="parent"?'<section class="group"><div class="group-head"><h2>추가 상벌 보너스</h2>'+el("+ 항목","tiny","bonus-new")+'</div>'+
  '<div class="bonus-list">'+d.bonusItems.map(item=>{
   const amount=(item.minutes>0?"+":"")+item.minutes+"분";
   return '<article class="bonus-entry '+(item.active===false?"inactive":"")+'"><span class="bonus-description">'+safe(item.title)+'</span>'+
    '<span class="bonus-amount '+(item.minutes>0?"positive":"negative")+'">'+amount+'</span>'+
    el("편집","tiny muted","bonus-edit",'data-id="'+safe(item.id)+'"')+
    (item.active!==false?el("적용","tiny apply","bonus-apply",'data-id="'+safe(item.id)+'"'):"")+'</article>';
  }).join("")+'</div></section>':"";
 const childBonus=r==="child"?renderChildBonusItems(d):"";
 const content=screen==="today"?taskGroup+(r==="parent"?bonusGroup:childBonus):
  screen==="week"?renderWeeklyChecklist(d,active,statsAnchor)+childBonus:
  screen==="month"?renderMonthlyCompletion(d,active,statsAnchor)+childBonus:
  renderHistory(d,statsUnit,statsAnchor);
 if(r==="child"){
  app.innerHTML='<main class="wrap view-child screen-'+screen+'">'+header(r)+
   '<aside class="child-aside" aria-label="나의 진행 상황">'+balance+renderChildProgress(d,active,day)+'</aside>'+
   '<div class="child-work">'+nav+content+'</div></main>';
 }else{
  app.innerHTML='<main class="wrap view-parent screen-'+screen+'">'+header(r)+balance+pendingBanner+nav+content+'</main>';
 }
 if(r==="parent"&&pending>lastPending&&document.visibilityState==="visible"){
  try{if("Notification" in window&&Notification.permission==="granted")new Notification("보너스 시간",{body:"확인할 항목 "+pending+"개",tag:"bonus-pending"});}catch(_){}
 }
 lastPending=pending;
}
function open(content){dialogBody.innerHTML=content;if(!dialog.open)dialog.showModal();}
function close(){dialog.close();}
function notify(msg){const el=document.getElementById("toast");el.textContent=msg;el.hidden=false;clearTimeout(notify.timeout);notify.timeout=setTimeout(()=>el.hidden=true,2400);}
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
   return '<div class="log"><div><strong>'+safe(h?.title||"할 일")+'</strong><small>'+safe(c.day)+' · '+formatMoment(c.submitted_at)+' · 확인 대기</small>'+
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
 open('<div class="form"><div class="modal-head"><h2>데이터</h2>'+el("닫기","tiny","close")+'</div><div class="form-actions">'+el("백업 저장","ghost","export")+el("백업 불러오기","primary","import")+'</div><input id="restoreFile" type="file" accept=".json,application/json" hidden></div>');
}
function exportData(){
 const blob=new Blob([JSON.stringify(read(),null,2)],{type:"application/json"}),url=URL.createObjectURL(blob),a=document.createElement("a");
 a.href=url;a.download="보너스시간-"+seoulToday()+".json";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
 notify("백업 저장");
}
document.addEventListener("click",e=>{
 const t=e.target.closest("[data-action]");if(!t)return;
 const act=t.dataset.action,hid=t.dataset.id;
 try{
  if(act==="role"){
   localStorage.setItem(MODE,role()==="parent"?"child":"parent");
   viewDay=seoulToday();screen="today";render();
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
  else if(act==="edit")editor(hid);
  else if(act==="new")editor(null);
  else if(act==="history")history();
  else if(act==="bonuses")bonusesPanel();
  else if(act==="bonus-new")bonusEditor(null);
  else if(act==="bonus-edit")bonusEditor(hid);
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
  else if(act==="tools")toolsPanel();
  else if(act==="close")close();
  else if(act==="export")exportData();
  else if(act==="import")document.getElementById("restoreFile")?.click();
 }catch(err){notify(err.message||"처리 실패");}
});
document.addEventListener("submit",e=>{
 const f=e.target;
 if(!["pinForm","editForm","bonusItemForm","bonusApplyForm","useForm"].includes(f.id))return;
 e.preventDefault();
 const v=Object.fromEntries(new FormData(f).entries());
 try{
  if(f.id==="pinForm"){
   if(v.pin!=="5555")throw Error("비밀번호를 확인해주세요.");
   localStorage.setItem(SETUP,"1");localStorage.setItem(MODE,"parent");render();return;
  }
  if(f.id==="editForm"){
   setHabit({id:v.id,title:v.title,minutes:v.minutes,items:v.items,active:!!f.querySelector('[name="active"]')?.checked});
   close();
  }
  if(f.id==="bonusItemForm"){
   saveBonusItem({id:v.id,title:v.title,minutes:v.minutes,type:v.type,active:!!f.querySelector('[name="active"]')?.checked});
   close();
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
document.addEventListener("change",async e=>{
 if(e.target.id!=="restoreFile"||!e.target.files?.length)return;
 const file=e.target.files[0];e.target.value="";
 if(file.size>8e6){notify("파일 크기 초과");return;}
 try{
  const d=JSON.parse(await file.text());if(!validate(d))throw Error("백업 형식을 확인해주세요.");
  if(!confirm("현재 기록을 백업 내용으로 교체할까요?"))return;
  save(migrate(d));close();render();notify("복원 완료");
 }catch(err){notify(err.message||"복원 실패");}
});
dialog.addEventListener("click",e=>{if(e.target===dialog)close();});
window.addEventListener("storage",e=>{if([STORE,MODE,SETUP].includes(e.key))render();});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")render();});
if("serviceWorker" in navigator)navigator.serviceWorker.register("/kid-habits/sw.js",{scope:"/kid-habits/"}).catch(()=>{});
render();
})();

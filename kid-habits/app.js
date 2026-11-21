(()=>{
"use strict";
const STORE="kid_habits_personal_v1",SETUP="kid_habits_personal_setup_v1",MODE="kid_habits_personal_role_v1";
const app=document.getElementById("app"),dialog=document.getElementById("modal"),dialogBody=document.getElementById("modalBody");
let viewDay=seoulToday();
const starter=[
 {id:"morning",title:"아침 할 일",reward_minutes:5,sort_order:1,active:true,items:[{id:"bathroom",title:"소변 보기"},{id:"brush",title:"치카하기"},{id:"wash",title:"세수하기"},{id:"water",title:"물 마시기"}]},
 {id:"study",title:"공부하기",reward_minutes:10,sort_order:2,active:true,rotation:true,items:[{id:"math",title:"수학"},{id:"read",title:"책 읽기"},{id:"write",title:"받아쓰기 / 바르게 쓰기"}]},
 {id:"sleep",title:"잠들기",reward_minutes:5,sort_order:3,active:true,items:[]},
 {id:"posture",title:"바른 자세",reward_minutes:10,sort_order:4,active:true,items:[]}
];
function seoulToday(){let p=Object.fromEntries(new Intl.DateTimeFormat("en-US",{timeZone:"Asia/Seoul",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date()).map(x=>[x.type,x.value]));return p.year+"-"+p.month+"-"+p.day;}
function nextDay(day,offset=1){let d=new Date(day+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10);}
function diffDays(a,b){return Math.round((Date.parse(a+"T12:00:00Z")-Date.parse(b+"T12:00:00Z"))/86400000);}
function uid(){return typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():"p"+Date.now().toString(36)+Math.random().toString(36).slice(2);}
function safe(v){return String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function fresh(){return {version:2,habits:JSON.parse(JSON.stringify(starter)),checks:[],ledger:[],subchecks:{},studyDays:{}};}
function validate(d){return d&&[1,2].includes(d.version)&&Array.isArray(d.habits)&&Array.isArray(d.checks)&&Array.isArray(d.ledger)&&d.habits.length<500&&d.checks.length<100000&&d.ledger.length<100000&&d.habits.every(h=>h&&typeof h.id==="string"&&typeof h.title==="string"&&Number.isInteger(h.reward_minutes));}
function migrate(d){
 if(!d.subchecks||typeof d.subchecks!=="object")d.subchecks={};
 if(!d.studyDays||typeof d.studyDays!=="object")d.studyDays={};
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
 d.version=2;
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
function time(n){n=Math.max(0,Number(n)||0);return n<60?n+"분":Math.floor(n/60)+"시간"+(n%60?" "+n%60+"분":"");}
function totals(d){return d.ledger.reduce((s,l)=>s+(Number(l.minutes)||0),0);}
function check(d,hid,day){return d.checks.find(c=>c.habit_id===hid&&c.day===day);}
function checkKey(hid,day){return day+"|"+hid;}
function checked(d,hid,day){return d.subchecks[checkKey(hid,day)]||[];}
function log(d,kind,minutes,description,day,checkId){d.ledger.unshift({id:uid(),kind,minutes,description,day,check_id:checkId||null,actor_id:"personal-parent",created_at:new Date().toISOString()});}
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
 const k=checkKey(hid,day),done=new Set(checked(d,hid,day));
 if(done.has(itemId))done.delete(itemId);else done.add(itemId);
 d.subchecks[k]=Array.from(done);
 if(items.every(i=>done.has(i.id)))pushCheck(d,h,day);
 else if(existing&&existing.status==="pending")d.checks=d.checks.filter(x=>x!==existing);
 save(d);render();
}
function submitSimple(hid){
 if(role()!=="child")return;
 const d=read(),day=seoulToday(),h=habit(d,hid);
 if(h.items.length)return;
 const c=check(d,hid,day);
 if(c&&c.status==="pending")d.checks=d.checks.filter(x=>x!==c);
 else if(!c||c.status==="rejected")pushCheck(d,h,day);
 save(d);render();
}
function review(hid,status){
 requireParent();const d=read(),h=habit(d,hid),day=viewDay,c=check(d,hid,day);
 if(!c||!["pending","approved"].includes(c.status))return;
 if(status==="approved"&&c.status==="pending"){c.status="approved";c.awarded_minutes=h.reward_minutes;log(d,"habit",h.reward_minutes,h.title,day,c.id);}
 if(status==="rejected"){
  if(c.status==="approved")log(d,"reversal",-c.awarded_minutes,h.title,day,c.id);
  c.status="rejected";c.awarded_minutes=0;d.subchecks[checkKey(hid,day)]=[];
 }
 c.reviewed_at=new Date().toISOString();c.reviewed_by="personal-parent";save(d);render();
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
function adjust(kind,minutes,description){
 requireParent();const d=read(),n=Number(minutes),desc=String(description||"").trim();
 if(!["bonus","penalty","spend"].includes(kind)||!Number.isInteger(n)||n<1||n>300||!desc||desc.length>100)throw Error("시간과 내용을 확인해주세요.");
 if(kind!=="bonus"&&n>totals(d))throw Error("남은 시간보다 많습니다.");
 log(d,kind,kind==="bonus"?n:-n,desc,seoulToday(),null);save(d);render();
}
function setHabit(data){
 requireParent();const d=read(),prev=data.id?d.habits.find(x=>x.id===data.id):null;
 const title=String(data.title||"").trim(),minutes=Number(data.minutes),titles=String(data.items||"").split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
 if(!title||title.length>80||!Number.isInteger(minutes)||minutes<1||minutes>180||titles.length>20||titles.some(x=>x.length>48))throw Error("항목·시간을 확인해주세요.");
 const items=titles.map((t,i)=>({id:prev?.items[i]?.id||uid(),title:t}));
 if(prev){prev.title=title;prev.reward_minutes=minutes;prev.items=items;prev.active=data.active;}
 else d.habits.push({id:uid(),title,reward_minutes:minutes,sort_order:d.habits.length+1,active:true,items});
 save(d);render();
}
function el(label,cls,action,attr=""){return '<button type="button" class="'+cls+'" data-action="'+action+'" '+attr+'>'+label+'</button>';}
function status(c){return c?.status==="approved"?"완료":c?.status==="pending"?"확인 대기":c?.status==="rejected"?"다시 하기":"";}
function renderTask(d,h,day,r){
 const c=check(d,h.id,day),items=shownItems(d,h,day),done=new Set(checked(d,h.id,day)),s=status(c),isParent=r==="parent";
 const actions=[];
 if(h.rotation&&isParent&&h.items.length>1)actions.push(el("다음","tiny","cycle",'aria-label="다음 공부 항목"'));
 if(isParent)actions.push(el("편집","tiny muted","edit",'data-id="'+safe(h.id)+'"'));
 let itemsUI="";
 if(items.length)itemsUI='<div class="subtasks">'+items.map(item=>{
  const isDone=c?.status==="approved"||done.has(item.id),key=safe(item.id);
  return isParent?
   '<div class="subitem"><span class="dot '+(isDone?"on":"")+'">'+(isDone?"✓":"")+'</span><span>'+safe(item.title)+'</span></div>':
   '<button type="button" class="subitem selectable" data-action="toggle" data-id="'+safe(h.id)+'" data-item="'+key+'" '+(c?.status==="approved"?"disabled":"")+'><span class="dot '+(isDone?"on":"")+'">'+(isDone?"✓":"")+'</span><span>'+safe(item.title)+'</span></button>';
 }).join("")+'</div>';
 let footer="";
 if(isParent&&c?.status==="pending")footer='<div class="task-foot">'+el("승인","primary","review",'data-id="'+safe(h.id)+'" data-status="approved"')+el("반려","ghost","review",'data-id="'+safe(h.id)+'" data-status="rejected"')+'</div>';
 else if(isParent&&c?.status==="approved")footer='<div class="task-foot">'+el("승인 취소","ghost","review",'data-id="'+safe(h.id)+'" data-status="rejected"')+'</div>';
 else if(!isParent&&!items.length)footer='<div class="task-foot">'+el(c?.status==="pending"?"요청 취소":c?.status==="approved"?"승인 완료":"완료",c?.status==="approved"?"ghost":"primary","complete",'data-id="'+safe(h.id)+'" '+(c?.status==="approved"?"disabled":""))+'</div>';
 return '<article class="task"><div class="task-top"><div class="task-name">'+safe(h.title)+'</div><div class="right">'+(s?'<span class="state '+(c?.status==="approved"?"done":"")+'">'+s+'</span>':'')+'<span class="reward">+'+h.reward_minutes+'분</span>'+actions.join("")+'</div></div>'+itemsUI+footer+'</article>';
}
function header(r){return '<header class="top"><strong>보너스 시간</strong>'+(r?el(r==="parent"?"아이 화면":"부모 화면","mode","role"):"")+'</header>';}
function registration(){
 app.innerHTML='<main class="wrap">'+header(null)+'<section class="pin"><form id="pinForm"><label for="pin">최초 등록 비밀번호</label><input id="pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required autocomplete="off" autofocus placeholder="4자리">'+
 '<button type="submit" class="primary">등록</button></form></section></main>';
}
function render(){
 if(localStorage.getItem(SETUP)!=="1"){registration();return;}
 const d=read(),r=role(),day=r==="child"?seoulToday():viewDay;
 if(r==="parent"&&day>seoulToday())viewDay=seoulToday();
 const active=d.habits.filter(h=>h.active).sort((a,b)=>a.sort_order-b.sort_order);
 if(active.some(h=>h.rotation&&h.items.length&&!d.studyDays[day])){active.filter(h=>h.rotation&&h.items.length).forEach(h=>studyAssignment(d,day));save(d);}
 const balance='<section class="balance"><span>남은 시간</span><strong>'+time(totals(d))+'</strong>'+(r==="parent"?'<div class="balance-actions">'+el("+ 추가","primary","adjust",'data-kind="bonus"')+el("− 차감","ghost","adjust",'data-kind="penalty"')+el("사용","ghost","adjust",'data-kind="spend"')+'</div>':'')+'</section>';
 const nav='<div class="daybar">'+(r==="parent"?el("‹","date-button","prev",'aria-label="전날"'):'')+'<span>'+dateLabel(day)+'</span>'+(r==="parent"?el("›","date-button","next",'aria-label="다음 날" '+(day>=seoulToday()?"disabled":"")):'')+'<div class="spacer"></div>'+el("기록","tiny","history")+(r==="parent"?el("+ 항목","tiny","new"):'')+el("⋯","tiny","tools",'aria-label="백업 및 복원"')+'</div>';
 app.innerHTML='<main class="wrap">'+header(r)+balance+nav+'<section class="tasks">'+active.map(h=>renderTask(d,h,day,r)).join("")+'</section></main>';
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
function adjustment(kind){
 const title={bonus:"보너스 추가",penalty:"시간 차감",spend:"시간 사용"}[kind];
 open('<form id="adjustForm" class="form"><h2>'+title+'</h2><input type="hidden" name="kind" value="'+kind+'">'+
 '<label>시간 (분)<input name="minutes" type="number" min="1" max="300" value="5" required></label>'+
 '<label>내용<input name="description" maxlength="100" required></label>'+
 '<div class="form-actions">'+el("취소","ghost","close")+'<button type="submit" class="primary">저장</button></div></form>');
}
function history(){
 const logs=read().ledger.slice(0,80),kinds={habit:"적립",reversal:"승인 취소",bonus:"추가",penalty:"차감",spend:"사용"};
 open('<div class="history"><div class="modal-head"><h2>기록</h2>'+el("닫기","tiny","close")+'</div>'+
 (logs.length?logs.map(l=>'<div class="log"><div><strong>'+safe(l.description)+'</strong><small>'+safe(l.day)+' · '+(kinds[l.kind]||"")+'</small></div><b class="'+(l.minutes>0?"positive":"")+'">'+(l.minutes>0?"+":"")+l.minutes+'분</b></div>').join(""):'<p class="empty">기록 없음</p>')+'</div>');
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
  if(act==="role"){localStorage.setItem(MODE,role()==="parent"?"child":"parent");viewDay=seoulToday();render();}
  else if(act==="prev"){viewDay=nextDay(viewDay,-1);render();}
  else if(act==="next"&&viewDay<seoulToday()){viewDay=nextDay(viewDay);render();}
  else if(act==="toggle")toggleItem(hid,t.dataset.item);
  else if(act==="complete")submitSimple(hid);
  else if(act==="review")review(hid,t.dataset.status);
  else if(act==="cycle")cycleStudy();
  else if(act==="edit")editor(hid);
  else if(act==="new")editor(null);
  else if(act==="adjust")adjustment(t.dataset.kind);
  else if(act==="history")history();
  else if(act==="tools")toolsPanel();
  else if(act==="close")close();
  else if(act==="export")exportData();
  else if(act==="import")document.getElementById("restoreFile")?.click();
 }catch(err){notify(err.message||"처리 실패");}
});
document.addEventListener("submit",e=>{
 const f=e.target;if(!["pinForm","editForm","adjustForm"].includes(f.id))return;e.preventDefault();
 const v=Object.fromEntries(new FormData(f).entries());
 try{
  if(f.id==="pinForm"){
   if(v.pin!=="5555")throw Error("비밀번호를 확인해주세요.");
   localStorage.setItem(SETUP,"1");localStorage.setItem(MODE,"parent");render();return;
  }
  if(f.id==="editForm"){setHabit({id:v.id,title:v.title,minutes:v.minutes,items:v.items,active:!!f.querySelector('[name="active"]')?.checked});close();}
  if(f.id==="adjustForm"){adjust(v.kind,v.minutes,v.description);close();}
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

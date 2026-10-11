const POL=["COD","BOD","SS","TP","TN","NH3"],PN={COD:"COD",BOD:"BOD",SS:"SS",TP:"TP",TN:"TN",NH3:"NH₃-N"},EPS=1e-9;
const Z=()=>({COD:0,BOD:0,SS:0,TP:0,TN:0,NH3:0}),cl=(v,a,b)=>Math.min(b,Math.max(a,Number.isFinite(+v)?+v:a));
const arr=a=>Object.fromEntries(POL.map((p,i)=>[p,a[i]]));
function defaultModel(){
 const U=(id,name,type,x,y,eta,cap,o)=>({id,name,type,x,y,eta:arr(eta||[0,0,0,0,0,0]),cap:arr(cap||[0,0,0,0,0,0]),qLoss:0,ts:0,conc:20000,chemP:0,chemYield:2.5,filt:0,...o});
 return {name:"示範水資源回收中心（示範數據，非正式設計值）",
 source:{Q:4350,factor:1,C:{COD:275.5,BOD:187.8,SS:214.2,TP:7,TN:46.2,NH3:32.9}},
 energy:defaultEnergy(),
 params:{tol:1e-12,maxIter:1000,errAbs:0.01,errRel:1e-6},
 units:[U("T01-01","進流水","source",80,60),U("T01-02","調整池","water",300,60),
 U("T01-03","粗細格柵","water",520,60,[.02,.02,.08,.03,.01,0]),
 U("T01-04","初沉池","clarifier",740,60,[.3,.3,.55,.2,.1,.03],[.7,.7,.95,.7,.1,0]),
 U("T01-05","生物反應池","biological",960,60,[.55,.75,.1,.35,.65,.9],[.35,.35,.9,.25,0,0]),
 U("T01-06","二沉池","clarifier",1180,60,[.1,.1,.75,.15,.08,.05],[.3,.3,.95,.4,.1,.05]),
 U("T01-07","砂濾池","filter",1400,60,[.08,.08,.6,.2,.05,.03]),
 U("T01-08","UV消毒","water",1590,60),U("T01-09","放流水","sink",1590,260),
 U("T01-10","污泥混合槽","sludge",960,420),U("T01-11","污泥濃縮","sludge",1180,420,0,0,{ts:5}),
 U("T01-12","厭氧消化","sludge",1400,420,[0,0,.35,0,0,0],0,{ts:4}),
 U("T01-13","污泥脫水（濾餅）","sink",1590,560,[0,0,.05,0,0,0],0,{ts:20,filt:1})],
 streams:[...[1,2,3,4,5,6,7,8].map(i=>({id:"W-0"+i,from:"T01-0"+i,to:"T01-0"+(i+1),type:"water",pct:100})),
 {id:"S-01",from:"T01-04",to:"T01-10",type:"sludge",pct:100},{id:"S-02",from:"T01-06",to:"T01-10",type:"sludge",pct:100},
 {id:"S-03",from:"T01-10",to:"T01-11",type:"sludge",pct:100},{id:"S-04",from:"T01-11",to:"T01-12",type:"sludge",pct:100},
 {id:"S-05",from:"T01-12",to:"T01-13",type:"sludge",pct:100},
 {id:"R-01",from:"T01-06",to:"T01-05",type:"recycle",pct:50},{id:"R-02",from:"T01-05",to:"T01-05",type:"internal",pct:200},
 {id:"F-01",from:"T01-11",to:"T01-02",type:"filtrate",pct:100},{id:"F-02",from:"T01-12",to:"T01-02",type:"filtrate",pct:100},{id:"F-03",from:"T01-13",to:"T01-02",type:"filtrate",pct:100}]};
}
/* 穩態質量平衡求解器：recycle/internal 的 pct = 相對進流 Q0 的回流比；water/sludge 的 pct = 分流權重 */
function solve(M){
 const Q0=M.source.Q*M.source.factor,srcL=Z();POL.forEach(p=>srcL[p]=Q0*M.source.C[p]/1000);
 const U=Object.fromEntries(M.units.map(u=>[u.id,u]));let warn=[];
 const inS=id=>M.streams.filter(s=>s.to===id),outS=id=>M.streams.filter(s=>s.from===id);
 const st={};M.streams.forEach(s=>st[s.id]={Q:0,L:Z()});
 let res={},it=0,conv=false,delta=Infinity;
 for(it=1;it<=M.params.maxIter;it++){
  delta=0;res={};warn=[];
  for(const u of M.units){
   let Qin=0,Lin=Z();
   if(u.type==="source"){Qin=Q0;POL.forEach(p=>Lin[p]=srcL[p])}
   inS(u.id).forEach(s=>{Qin+=st[s.id].Q;POL.forEach(p=>Lin[p]+=st[s.id].L[p])});
   const out=outS(u.id),rec=out.filter(s=>s.type==="recycle"||s.type==="internal"),
    slu=out.filter(s=>s.type==="sludge"),wat=out.filter(s=>s.type==="water"),filt=out.filter(s=>s.type==="filtrate");
   const lineUnit=!wat.length&&slu.length&&u.type!=="clarifier"&&u.type!=="biological";
   const fwd=lineUnit?slu:wat,sOut=lineUnit?[]:slu;
   const R=Z(),S=Z(),X=Z(),W=Z();let gen=0;
   POL.forEach(p=>{let e=cl(u.eta[p],0,1);if(p==="TP")e=Math.max(e,cl(u.chemP,0,1));R[p]=Lin[p]*e;
    S[p]=sOut.length?R[p]*cl(u.cap[p],0,1):0;X[p]=R[p]-S[p];W[p]=Lin[p]-R[p]});
   if(u.chemP>0){gen=Lin.TP*cl(u.chemP,0,1)*Math.max(0,u.chemYield);if(sOut.length)S.SS+=gen;else W.SS+=gen}
   const Lf=Z();if(filt.length)POL.forEach(p=>{Lf[p]=X[p]*cl(u.filt,0,1);X[p]-=Lf[p]});
   const Qs=sOut.length?Math.min(Qin,S.SS*1000/Math.max(u.conc,1)):0,Qoth=cl(u.qLoss,0,1)*Qin;
   const Qw=Math.max(0,Qin-Qs-Qoth);let Qf=Qw,Qrej=0;
   if(u.ts>0&&W.SS>EPS){Qf=Math.min(Qw,W.SS*1000/(u.ts*1e4));Qrej=Qw-Qf}
   let Qleft=Qf;const Lleft={...W},ns={};
   rec.forEach(s=>{const q=Math.min(Qleft,Q0*cl(s.pct,0,1e4)/100);if(q<Q0*s.pct/100-1e-6)warn.push(`${s.id}：回流量超過可用水量，已截斷`);
    const f=Qf>EPS?q/Qf:0;ns[s.id]={Q:q,L:Z()};POL.forEach(p=>{const l=W[p]*f;ns[s.id].L[p]=l;Lleft[p]-=l});Qleft-=q});
   const sp=(arr,Q,L)=>{const t=arr.reduce((a,s)=>a+Math.max(0,s.pct),0)||1;arr.forEach(s=>{const f=Math.max(0,s.pct)/t;ns[s.id]={Q:Q*f,L:Object.fromEntries(POL.map(p=>[p,L[p]*f]))}})};
   let tQ=0,tL=Z();
   if(fwd.length)sp(fwd,Qleft,Lleft);else{tQ=Qleft;tL=Lleft}
   if(sOut.length)sp(sOut,Qs,S);
   const Qfilt=filt.length?Qrej+Qoth:0;if(filt.length){sp(filt,Qfilt,Lf);if(Qfilt<1e-9&&POL.some(p=>Lf[p]>1e-9))warn.push(`${u.id}：濾液流股有負荷但無水量（請設定出泥 TS%）`)}
   Object.entries(ns).forEach(([id,v])=>{const o=st[id];delta=Math.max(delta,Math.abs(o.Q-v.Q),...POL.map(p=>Math.abs(o.L[p]-v.L[p])));st[id]=v});
   if(!sOut.length&&POL.some(p=>cl(u.cap[p],0,1)>0&&R[p]>0&&!lineUnit&&u.type!=="sink"&&u.type!=="biological"))warn.push(`${u.id} ${u.name}：設有污泥捕獲率但無污泥流股，捕獲量計入「轉化／其他移除」`);
   res[u.id]={u,Qin,Lin,R,S,X,W,gen,Qs,Qside:filt.length?0:Qoth+Qrej,tQ,tL};
  }
  if(delta<Math.max(M.params.tol,1e-12)*(1+Q0)){conv=true;break}
 }
 /* 以實際流股重算各單元誤差（獨立驗證，不依賴求解中間量） */
 const Tq=M.params.errAbs,rel=M.params.errRel;
 M.units.forEach(u=>{const r=res[u.id];let Qo=r.tQ+r.Qside,Lo=Z();outS(u.id).forEach(s=>{Qo+=st[s.id].Q;POL.forEach(p=>Lo[p]+=st[s.id].L[p])});
  POL.forEach(p=>Lo[p]+=r.tL[p]+r.X[p]);
  r.errQ=r.Qin-Qo;r.errL=Z();POL.forEach(p=>r.errL[p]=r.Lin[p]+(p==="SS"?r.gen:0)-Lo[p]);
  r.Lout=Lo;r.Qout=Qo});
 const G={in:{Q:Q0,L:{...srcL}},gen:0,term:{Q:0,L:Z()},X:Z(),side:0,terms:[]};
 M.units.forEach(u=>{const r=res[u.id];G.gen+=r.gen;G.side+=r.Qside;POL.forEach(p=>{G.term.L[p]+=r.tL[p];G.X[p]+=r.X[p]});G.term.Q+=r.tQ;
  if(inS(u.id).length&&!outS(u.id).some(s=>!["recycle","internal","filtrate"].includes(s.type))&&u.type!=="source")G.terms.push({id:u.id,name:u.name,Q:r.tQ,L:r.tL,Qrej:r.Qside})});
 G.errQ=Q0-G.term.Q-G.side;G.errL=Z();POL.forEach(p=>G.errL[p]=srcL[p]+(p==="SS"?G.gen:0)-G.term.L[p]-G.X[p]);
 const ok=(e,ref)=>Math.abs(e)<=Math.max(Tq,rel*Math.abs(ref));
 G.status=ok(G.errQ,Q0)&&POL.every(p=>ok(G.errL[p],srcL[p]))&&conv?"BALANCED":(conv?"UNBALANCED":"NOT_CONVERGED");
 const isolated=M.units.filter(u=>!inS(u.id).length&&!outS(u.id).length&&u.type!=="source").map(u=>u.id);
 isolated.forEach(i=>warn.push(`${i} 為孤立節點`));
 const src=M.units.find(u=>u.type==="source");if(src&&!outS(src.id).length)warn.push("進流水單元沒有任何出流股，全廠無水流");
 return {st,res,G,iters:it,conv,delta,warn:[...new Set(warn)],Q0,srcL,ok};
}

const UT=["source","water","clarifier","biological","filter","sink","sludge"],ST=["water","sludge","recycle","internal","filtrate"];
function validate(o){const e=[],idr=/^[A-Za-z0-9_-]{1,24}$/,n=(v,a,b)=>typeof v==="number"&&Number.isFinite(v)&&v>=a&&v<=b;
 if(!o||!Array.isArray(o.units)||!Array.isArray(o.streams)||!o.source)return["缺少 units／streams／source"];
 if(o.units.length>200||o.streams.length>600)e.push("單元或流股數量過多");
 if(o.units.filter(u=>u.type==="source").length!==1)e.push("必須且只能有 1 個 source 單元");
 const ids=new Set();o.units.forEach(u=>{if(!idr.test(u.id||"")||ids.has(u.id))e.push("單元 ID 不合法或重複："+String(u.id).slice(0,30));ids.add(u.id);
  if(!UT.includes(u.type))e.push(u.id+" 類型不合法");if(!n(u.x,-5e3,5e3)||!n(u.y,-5e3,5e3))e.push(u.id+" 座標不合法");
  POL.forEach(p=>{if(!n(u.eta?.[p],0,1)||!n(u.cap?.[p],0,1))e.push(u.id+" "+p+" 去除率/捕獲率須為 0–1")});
  if(!n(u.qLoss,0,1)||!n(u.ts,0,100)||!n(u.conc,1,1e6)||!n(u.chemP,0,1)||!n(u.chemYield,0,100)||!n(u.filt,0,1))e.push(u.id+" 參數超出範圍")});
 const sid=new Set();o.streams.forEach(s=>{if(!idr.test(s.id||"")||sid.has(s.id))e.push("流股 ID 不合法或重複");sid.add(s.id);
  if(!ids.has(s.from)||!ids.has(s.to))e.push((s.id||"?")+" 端點不存在");if(!ST.includes(s.type))e.push(s.id+" 類型不合法");if(!n(s.pct,0,1e4))e.push(s.id+" 參數不合法");
  if(s.from===s.to&&s.type!=="internal"&&s.type!=="recycle")e.push(s.id+" 自我迴圈僅限 recycle/internal")});
 if(o.energy!==undefined)validateEnergy(o.energy).forEach(x=>e.push(x));if(!n(o.source.Q,0,1e7)||!n(o.source.factor,0,100)||POL.some(p=>!n(o.source.C?.[p],0,1e5)))e.push("進水條件不合法");return e.slice(0,10)}
function buildModel(o){return{name:String(o.name||"").slice(0,80),source:{Q:o.source.Q,factor:o.source.factor,C:Object.fromEntries(POL.map(p=>[p,o.source.C[p]]))},params:defaultModel().params,energy:o.energy?{...defaultEnergy(),...Object.fromEntries(Object.keys(ER).map(k=>[k,o.energy[k]]))}:defaultEnergy(),
 units:o.units.map(u=>({id:u.id,name:String(u.name||u.id).slice(0,40),type:u.type,x:u.x,y:u.y,eta:{...u.eta},cap:{...u.cap},qLoss:u.qLoss,ts:u.ts,conc:u.conc,chemP:u.chemP,chemYield:u.chemYield,filt:u.filt})),
 streams:o.streams.map(s=>({id:s.id,from:s.from,to:s.to,type:s.type,pct:s.pct}))}}
const sx=v=>typeof v==="string"&&/^[=+\-@\t\r]/.test(v)?"'"+v:v,usx=v=>typeof v==="string"?v.replace(/^'(?=[=+\-@])/,""):v;
function modelToSheets(M,R){const g=R.G;return{
 Source:[{key:"Q",value:M.source.Q},{key:"factor",value:M.source.factor},...POL.map(p=>({key:"C_"+p,value:M.source.C[p]}))],
 Units:M.units.map(u=>({id:u.id,name:sx(u.name),type:u.type,x:u.x,y:u.y,qLoss:u.qLoss,ts:u.ts,conc:u.conc,chemP:u.chemP,chemYield:u.chemYield,filt:u.filt,...Object.fromEntries(POL.map(p=>["eta_"+p,u.eta[p]])),...Object.fromEntries(POL.map(p=>["cap_"+p,u.cap[p]]))})),
 Streams:M.streams.map(s=>({id:s.id,from:s.from,to:s.to,type:s.type,pct:s.pct})),
 Result_Streams:M.streams.map(s=>({id:s.id,Q_m3d:R.st[s.id].Q,...Object.fromEntries(POL.map(p=>[p+"_kgd",R.st[s.id].L[p]]))})),
 Result_Units:M.units.map(u=>{const r=R.res[u.id];return{id:u.id,name:sx(u.name),Qin:r.Qin,Q_error:r.errQ,...Object.fromEntries(POL.map(p=>[p+"_in",r.Lin[p]])),...Object.fromEntries(POL.map(p=>[p+"_error",r.errL[p]]))}}),
 Balance:[{item:"Q",in:R.Q0,generated:0,terminal:g.term.Q,conversion:0,side:g.side,error:g.errQ},...POL.map(p=>({item:p,in:R.srcL[p],generated:p==="SS"?g.gen:0,terminal:g.term.L[p],conversion:g.X[p],side:0,error:g.errL[p]}))],
 Energy:Object.keys(ER).map(k=>({key:k,value:M.energy[k]})),
 Result_Energy:(()=>{const x=energy(M,R);return[...x.items.map(i=>({item:i.name,kW:i.kW,kWh_d:i.kWhd})),{item:"合計",kW:x.avgKW,kWh_d:x.total}]})(),
 Info:[{key:"status",value:g.status},{key:"note",value:"示範數據，非正式設計值；須由專業人員覆核"}]}}
function sheetsToModel(sh){const num=v=>v===""||v==null?0:Number(v),has=(r,k)=>r[k]!==""&&r[k]!=null,S={C:{}};
 (sh.Source||[]).forEach(r=>{if(r.key==="Q")S.Q=num(r.value);else if(r.key==="factor")S.factor=num(r.value);else if(String(r.key).startsWith("C_"))S.C[String(r.key).slice(2)]=num(r.value)});
 POL.forEach(p=>{if(S.C[p]===undefined)S.C[p]=NaN});if(S.factor===undefined)S.factor=1;
 const en=(sh.Energy||[]).length?Object.fromEntries((sh.Energy||[]).map(r=>[String(r.key),num(r.value)])):undefined;
 return{name:"Excel 匯入",energy:en,source:S,units:(sh.Units||[]).map(r=>({id:String(r.id??"").trim(),name:usx(String(r.name??r.id)),type:String(r.type??"").trim(),x:num(r.x),y:num(r.y),qLoss:num(r.qLoss),ts:num(r.ts),conc:has(r,"conc")?num(r.conc):20000,chemP:num(r.chemP),chemYield:has(r,"chemYield")?num(r.chemYield):2.5,filt:num(r.filt),
  eta:Object.fromEntries(POL.map(p=>[p,num(r["eta_"+p])])),cap:Object.fromEntries(POL.map(p=>[p,num(r["cap_"+p])]))})),
  streams:(sh.Streams||[]).map(r=>({id:String(r.id??"").trim(),from:String(r.from??"").trim(),to:String(r.to??"").trim(),type:String(r.type??"").trim(),pct:num(r.pct)}))}}

/* ===== 能耗推估（輔助估算；預設值為教科書典型範圍／占位值，須以現場量測與設備資料取代） ===== */
const ER={oBOD:[0,3],nitO2:[0,8],denO2:[0,5],denFrac:[0,1],T:[5,40],alpha:[.2,1],beta:[.5,1],F:[.3,1],theta:[1,1.1],DO:[0,8],depth:[1,12],sote:[1,12],loss:[0,100],blowerEff:[.2,.9],
 hLift:[0,100],etaLift:[.2,.9],hRas:[0,50],etaRas:[.2,.9],hInt:[0,20],etaInt:[.2,.9],hSlu:[0,100],etaSlu:[.1,.9],hFilt:[0,50],etaFilt:[.2,.9],uv:[0,2],dewater:[0,500],fixedKW:[0,5000],tariff:[0,100]};
const EL={oBOD:"碳氧化需氧 kgO₂/kgBOD去除",nitO2:"硝化需氧 kgO₂/kgNH₃-N",denO2:"脫硝氧信用 kgO₂/kgN",denFrac:"TN去除中脫硝比例 0–1",T:"水溫 °C",alpha:"α 係數",beta:"β 係數",F:"結垢係數 F",theta:"θ 溫度係數",DO:"DO設定值 mg/L",depth:"曝氣水深 m",sote:"SOTE %/m水深",loss:"管路與擴散器損失 kPa",blowerEff:"鼓風機整體效率",
 hLift:"進流揚程 m",etaLift:"進流泵效率",hRas:"RAS揚程 m",etaRas:"RAS泵效率",hInt:"內循環揚程 m",etaInt:"內循環泵效率",hSlu:"污泥泵揚程 m",etaSlu:"污泥泵效率",hFilt:"濾液泵揚程 m",etaFilt:"濾液泵效率",uv:"UV 比能耗 kWh/m³放流（占位）",dewater:"脫水 kWh/tDS（占位）",fixedKW:"其他固定負載 kW（占位）",tariff:"電價 NT$/kWh（占位）"};
const defaultEnergy=()=>({oBOD:1,nitO2:4.57,denO2:2.86,denFrac:1,T:25,alpha:.6,beta:.95,F:.9,theta:1.024,DO:2,depth:4.5,sote:6,loss:10,blowerEff:.65,hLift:8,etaLift:.7,hRas:4,etaRas:.65,hInt:1,etaInt:.6,hSlu:15,etaSlu:.45,hFilt:5,etaFilt:.6,uv:.03,dewater:60,fixedKW:0,tariff:3});
const validateEnergy=e=>{const r=[];if(!e||typeof e!=="object")return["energy 缺失"];Object.keys(ER).forEach(k=>{const v=e[k];if(typeof v!=="number"||!Number.isFinite(v)||v<ER[k][0]||v>ER[k][1])r.push("能耗參數 "+k+" 超出範圍")});return r};
const csat=T=>14.652-0.41022*T+0.007991*T*T-0.000077774*T*T*T;
function energy(M,R,ov){const E={...M.energy,...(ov||{})},g=R.G,bio=M.units.filter(u=>u.type==="biological").map(u=>R.res[u.id]);
 const sum=p=>bio.reduce((a,r)=>a+r.R[p],0),BODrem=sum("BOD"),Nit=sum("NH3"),Den=sum("TN")*E.denFrac;
 const AOR=Math.max(0,E.oBOD*BODrem+E.nitO2*Nit-E.denO2*Den);
 const CsT=csat(E.T),Cs20=csat(20),dens=E.alpha*E.F*((E.beta*CsT-E.DO)/Cs20)*Math.pow(E.theta,E.T-20);
 const SOTR=dens>0.01?AOR/dens:NaN,SOTE=E.sote/100*E.depth,air=SOTR/(0.279*SOTE)/24;/* Nm³/h；0.279 kgO₂/Nm³空氣(20°C,1atm) */
 const ratio=(101.325+E.depth*9.81+E.loss)/101.325,m=air*1.204/3600,kW_air=m*1.005*(E.T+273.15)*(Math.pow(ratio,0.2857)-1)/E.blowerEff;
 const qs=t=>M.streams.filter(s=>s.type===t).reduce((a,s)=>a+R.st[s.id].Q,0);
 const pump=(name,Q,H,eta)=>({name,Q,H,eta,kW:1000*9.81*(Q/86400)*H/eta/1000});
 const pumps=[pump("進流揚水",R.Q0,E.hLift,E.etaLift),pump("回流污泥 RAS",qs("recycle"),E.hRas,E.etaRas),pump("硝化液內循環",qs("internal"),E.hInt,E.etaInt),pump("污泥輸送",qs("sludge"),E.hSlu,E.etaSlu),pump("濾液回流",qs("filtrate"),E.hFilt,E.etaFilt)];
 const isW=t=>M.streams.some(x=>x.to===t.id&&x.type==="water"),effT=g.terms.filter(isW),eff=effT.reduce((a,t)=>a+t.Q,0),cakeDS=g.terms.filter(t=>!isW(t)).reduce((a,t)=>a+t.L.SS,0);
 const items=[{name:"曝氣鼓風機",kW:kW_air,grp:"aer"},...pumps.map(p=>({name:p.name,kW:p.kW,grp:"pump"})),{name:"UV 消毒",kW:E.uv*eff/24,grp:"oth"},{name:"污泥脫水",kW:E.dewater*cakeDS/1000/24,grp:"oth"},{name:"其他固定負載",kW:E.fixedKW,grp:"oth"}].map(i=>({...i,kWhd:i.kW*24}));
 const tot=items.reduce((a,i)=>a+i.kWhd,0),bodRemPlant=R.srcL.BOD-effT.reduce((a,t)=>a+t.L.BOD,0);
 return{E,AOR,SOTR,SOTE,air,kW_air,pumps,items,total:tot,avgKW:tot/24,perM3:R.Q0>0?tot/R.Q0:NaN,perBOD:bodRemPlant>0?tot/bodRemPlant:NaN,costYear:tot*365*E.tariff,BODrem,Nit,Den,valid:Number.isFinite(SOTR)&&SOTR>=0}}
if(typeof module!=="undefined")module.exports={solve,defaultModel,POL,validate,buildModel,modelToSheets,sheetsToModel,energy,defaultEnergy,validateEnergy,ER};

(async function(){
const BASE=document.body.dataset.base||'/';
let D;
try{D=await fetch(BASE+'assets/data.json',{cache:'no-cache'}).then(r=>r.json());}catch(e){document.querySelectorAll('main').forEach(m=>m.insertAdjacentHTML('afterbegin','<section><p class="sub" style="margin:0">Τα δεδομένα δεν φόρτωσαν. Δοκιμάστε ανανέωση της σελίδας.</p></section>'));return;}
const UPDATED=D.updated;
const RAW=D.players;
const TEAMS=D.teams;
const POS={Guard:"Γκαρντ",Forward:"Φόργουορντ",Center:"Σέντερ"};
const COUNTRY={"United States of America":"ΗΠΑ","Greece":"Ελλάδα","France":"Γαλλία","Spain":"Ισπανία","Serbia":"Σερβία","Italy":"Ιταλία","Turkiye":"Τουρκία","Germany":"Γερμανία","Lithuania":"Λιθουανία","Israel":"Ισραήλ","Slovenia":"Σλοβενία","Croatia":"Κροατία","Montenegro":"Μαυροβούνιο","Latvia":"Λετονία","Canada":"Καναδάς","Nigeria":"Νιγηρία","Senegal":"Σενεγάλη","Brazil":"Βραζιλία","Australia":"Αυστραλία","Bosnia and Herzegovina":"Βοσνία-Ερζεγοβίνη","North Macedonia":"Β. Μακεδονία","Dominican Republic":"Δομινικανή Δημ.","Ireland":"Ιρλανδία","Georgia":"Γεωργία","Finland":"Φινλανδία","Belgium":"Βέλγιο","Poland":"Πολωνία","Czech Republic":"Τσεχία","Argentina":"Αργεντινή","Puerto Rico":"Πουέρτο Ρίκο","Netherlands":"Ολλανδία","Ukraine":"Ουκρανία","Estonia":"Εσθονία","United Kingdom":"Ην. Βασίλειο","Great Britain":"Ην. Βασίλειο","Cameroon":"Καμερούν","Mali":"Μάλι","Sweden":"Σουηδία","Denmark":"Δανία","Hungary":"Ουγγαρία","Bulgaria":"Βουλγαρία","Russia":"Ρωσία","Cyprus":"Κύπρος","Austria":"Αυστρία","Switzerland":"Ελβετία","Portugal":"Πορτογαλία","Uruguay":"Ουρουγουάη","Mexico":"Μεξικό","Venezuela":"Βενεζουέλα","Angola":"Αγκόλα","Congo":"Κονγκό","DR Congo":"ΛΔ Κονγκό","Jamaica":"Τζαμάικα","Bahamas":"Μπαχάμες","Japan":"Ιαπωνία","China":"Κίνα","New Zealand":"Ν. Ζηλανδία","Iceland":"Ισλανδία","Slovakia":"Σλοβακία","Romania":"Ρουμανία","Kosovo":"Κόσοβο","Egypt":"Αίγυπτος","Tunisia":"Τυνησία","Ivory Coast":"Ακτή Ελεφαντοστού","Guinea":"Γουινέα","Gabon":"Γκαμπόν","Chad":"Τσαντ","Sudan":"Σουδάν","South Sudan":"Νότιο Σουδάν","Belarus":"Λευκορωσία","Armenia":"Αρμενία","Azerbaijan":"Αζερμπαϊτζάν","Kazakhstan":"Καζακστάν","Panama":"Παναμάς","Cuba":"Κούβα","Haiti":"Αϊτή","Colombia":"Κολομβία","Chile":"Χιλή","Peru":"Περού","Ghana":"Γκάνα","Cape Verde":"Πράσινο Ακρωτήριο","Cabo Verde":"Πράσινο Ακρωτήριο","Morocco":"Μαρόκο","Algeria":"Αλγερία","Lebanon":"Λίβανος","Jordan":"Ιορδανία","Iran":"Ιράν","Philippines":"Φιλιππίνες","South Korea":"Ν. Κορέα","Korea, Republic of":"Ν. Κορέα","Taiwan":"Ταϊβάν","Latvia ":"Λετονία"};
const tName=c=>c.split(';').map(x=>(TEAMS[x]||[x])[0]).join(' / ');
const tColor=c=>(TEAMS[c.split(';').pop()]||[0,"#555"])[1];
function nice(n){const [a,b]=n.split(',').map(s=>s.trim());const cap=s=>s.toLowerCase().replace(/(^|[\s\-'])([a-zà-ÿ])/g,(m,p,c)=>p+c.toUpperCase());return b?cap(b)+' '+cap(a):cap(a);}
const f1=x=>isFinite(x)?x.toFixed(1):'–';
const pc=(m,a)=>a?(100*m/a).toFixed(1)+'%':'–';
const mmss=s=>{s=Math.round(s);return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
const ddmm=d=>{const [y,m,dd]=d.split('-');return dd+'/'+m;};

// ---- derive per-player aggregates
const P=RAW.map(p=>{
  const g=p.g.filter(r=>r[7]>0);
  const T=new Array(26).fill(0); g.forEach(r=>{for(let i=7;i<26;i++)T[i]+=r[i];});
  const G=g.length, sec=T[7], min=sec/60;
  const fga=T[10]+T[12];
  const a={G,GS:g.filter(r=>r[6]).length,min,
    pts:T[8],reb:T[15]+T[16],or:T[15],dr:T[16],ast:T[17],stl:T[18],tov:T[19],blk:T[20],pir:T[25],pm:T[24],fc:T[22],fr:T[23],
    m2:T[9],a2:T[10],m3:T[11],a3:T[12],ftm:T[13],fta:T[14]};
  a.ts=(fga+0.44*a.fta)?a.pts/(2*(fga+0.44*a.fta)):NaN;
  a.efg=fga?(a.m2+a.m3*1.5)/fga:NaN;
  a.p3=a.a3?a.m3/a.a3:NaN;
  a.ast_to=a.tov?a.ast/a.tov:a.ast;
  a.par3=fga?a.a3/fga:NaN; a.ftr=fga?a.fta/fga:NaN;
  return Object.assign({},p,{name:nice(p.n),games:g,A:a});
});
const byCode=Object.fromEntries(P.map(p=>[p.c,p]));
const pUrl=c=>BASE+'paiktis/'+(byCode[c]?byCode[c].s:c)+'/';
const tUrl=c=>BASE+'omada/'+(TEAMS[c]?TEAMS[c][2]:c.toLowerCase())+'/';
const qualified=P.filter(p=>p.A.G>=3&&p.A.min/p.A.G>=10);

const METRICS=[
 ["Πόντοι",a=>a.pts/a.G,v=>f1(v)],
 ["Ριμπάουντ",a=>a.reb/a.G,v=>f1(v)],
 ["Ασίστ",a=>a.ast/a.G,v=>f1(v)],
 ["PIR",a=>a.pir/a.G,v=>f1(v)],
 ["Πόντοι ανά 36'",a=>a.pts/a.min*36,v=>f1(v)],
 ["True Shooting",a=>a.ts,v=>isFinite(v)?(v*100).toFixed(1)+'%':'–',a=>a.a2+a.a3+a.fta>=15],
 ["Τρίποντα %",a=>a.p3,v=>isFinite(v)?(v*100).toFixed(1)+'%':'–',a=>a.a3>=10],
 ["Κλεψίματα",a=>a.stl/a.G,v=>f1(v)],
 ["Κοψίματα",a=>a.blk/a.G,v=>f1(v)],
 ["Λάθη (λιγότερα)",a=>-a.tov/a.min*36,v=>f1(-v)+" /36'"],
 ["+/− ανά αγώνα",a=>a.pm/a.G,v=>(v>0?'+':'')+f1(v)]
];
function percentile(val,arr){if(!isFinite(val)||!arr.length)return null;let below=0,eq=0;arr.forEach(x=>{if(x<val)below++;else if(x===val)eq++;});return Math.round(100*(below+0.5*eq)/arr.length);}
const pcol=p=>p>=75?'var(--good)':p>=50?'var(--ok)':p>=25?'var(--mid)':'var(--low)';

let cur=null, mode='avg', cmp='all';

function render(code){
  const p=byCode[code]||byCode['012610']||P[0]; cur=p; const A=p.A;
  
  document.getElementById('jersey').textContent=p.no?'#'+p.no:'';
  document.getElementById('pname').textContent=p.name;
  const age=p.age?p.age+' ετών':'';
  const meta=document.getElementById('pmeta'); meta.innerHTML='';
  const chip=document.createElement('button'); chip.className='teamchip'; 
  chip.innerHTML='<span class="crest" style="background:'+tColor(p.t)+'">'+p.t.split(';').pop()+'</span>';
  chip.appendChild(document.createTextNode(tName(p.t)));
  chip.title='Σελίδα ομάδας';chip.onclick=()=>{location.href=tUrl(p.t.split(';').pop());};
  meta.appendChild(chip);
  [[POS[p.pos]||p.pos],[p.h?(p.h/100).toFixed(2).replace('.',',')+' μ.':''],[age],[COUNTRY[p.ct]||p.ct]].forEach(([t])=>{if(t){const s=document.createElement('span');s.textContent=t;meta.appendChild(s);}});
  const W=p.games.filter(r=>r[4]>r[5]).length, L=p.games.length-W;
  document.getElementById('prec').innerHTML='<span>Ρεκόρ με τον παίκτη</span><b>'+W+'–'+L+'</b><span>'+A.GS+' βασικός σε '+A.G+'</span>';
  const G=A.G||1;
  document.getElementById('board').innerHTML=[['Πόντοι',A.pts/G],['Ριμπ.',A.reb/G],['Ασίστ',A.ast/G],['PIR',A.pir/G],['Λεπτά',null],['+/−',A.pm/G]]
   .map(([l,v])=>'<div><b>'+(l==='Λεπτά'?mmss(A.min*60/G):(l==='+/−'&&v>0?'+':'')+f1(v))+'</b><span>'+l+'</span></div>').join('');
  renderAvg(); renderShoot(); renderChart(); renderLog(); renderPct(); renderSplits(); renderMates(); renderPHeat();
  
}

function renderAvg(){
  const A=cur.A, G=A.G||1;
  const div=mode==='avg'?G:mode==='p36'?(A.min/36||1):1;
  const cols=[["Αγ.",A.G,0],["Λεπτά",mode==='tot'?Math.round(A.min):(mode==='p36'?36:A.min/G),1],["Πόντοι",A.pts/div],["2π",null,'2'],["3π",null,'3'],["Βολές",null,'ft'],["Επ.Ρ",A.or/div],["Αμ.Ρ",A.dr/div],["Ριμπ.",A.reb/div],["Ασίστ",A.ast/div],["Κλεψ.",A.stl/div],["Λάθη",A.tov/div],["Κοψ.",A.blk/div],["Φάουλ",A.fc/div],["Κερδ.φ.",A.fr/div],["PIR",A.pir/div]];
  const fmt=(m,a)=>mode==='tot'?m+'/'+a:(m/div).toFixed(1)+'/'+(a/div).toFixed(1);
  const cell=c=>{if(c[2]==='2')return fmt(A.m2,A.a2);if(c[2]==='3')return fmt(A.m3,A.a3);if(c[2]==='ft')return fmt(A.ftm,A.fta);if(c[2]===0)return c[1];if(c[0]==='Λεπτά'&&mode==='avg')return mmss(c[1]*60);if(mode==='tot')return Math.round(c[1]);return f1(c[1]);};
  document.getElementById('avgtbl').innerHTML='<thead><tr>'+cols.map(c=>'<th>'+c[0]+'</th>').join('')+'</tr></thead><tbody><tr>'+cols.map((c,i)=>'<td'+(c[0]==='PIR'||c[0]==='Πόντοι'?' class="hi"':'')+'>'+cell(c)+'</td>').join('')+'</tr></tbody>';
  document.getElementById('avgsub').textContent=mode==='avg'?'Μέσος όρος ανά αγώνα':mode==='p36'?'Προβολή σε 36 λεπτά συμμετοχής':'Σύνολα σεζόν';
  const pp=A.a2+A.a3+A.fta;
  document.getElementById('adv').innerHTML=[
    ['True Shooting',isFinite(A.ts)?(A.ts*100).toFixed(1)+'%':'–'],['eFG%',isFinite(A.efg)?(A.efg*100).toFixed(1)+'%':'–'],
    ['Ασίστ / λάθη',A.tov?(A.ast/A.tov).toFixed(2):'–'],['Κατοχές ανά αγ.',cur.poss?String(cur.poss).replace('.',','):'–'],
    ['Μερίδιο τριπόντων',isFinite(A.par3)?(A.par3*100).toFixed(0)+'%':'–'],['Ρυθμός βολών',isFinite(A.ftr)?(A.ftr*100).toFixed(0)+'%':'–'],
    ['Πόντοι ανά σουτ',pp?(A.pts/(A.a2+A.a3+0.44*A.fta)).toFixed(2):'–'],['Διπλά-διπλά',cur.dd||0]
  ].map(([l,v])=>'<div><span>'+l+'</span><b>'+v+'</b></div>').join('');
}

function ring(m,a,label,lg){
  const r=40,c=2*Math.PI*r,v=a?m/a:0;
  return '<div class="ring"><svg viewBox="0 0 100 100" role="img" aria-label="'+label+' '+pc(m,a)+'"><circle cx="50" cy="50" r="'+r+'" fill="none" stroke="var(--line)" stroke-width="10"/>'+
   '<circle cx="50" cy="50" r="'+r+'" fill="none" stroke="var(--accent)" stroke-width="10" stroke-linecap="round" stroke-dasharray="'+(c*v).toFixed(1)+' '+c.toFixed(1)+'" transform="rotate(-90 50 50)"/>'+
   '<text x="50" y="55" text-anchor="middle" font-size="18" font-weight="700" fill="var(--ink)" font-family="var(--display)">'+(a?(100*v).toFixed(1)+'%':'–')+'</text></svg>'+
   '<b>'+label+'</b><small>'+m+'/'+a+(lg!=null?' · λίγκα '+lg:'')+'</small></div>';
}
const LG=(()=>{let m2=0,a2=0,m3=0,a3=0,fm=0,fa=0;P.forEach(p=>{m2+=p.A.m2;a2+=p.A.a2;m3+=p.A.m3;a3+=p.A.a3;fm+=p.A.ftm;fa+=p.A.fta;});return{p2:pc(m2,a2),p3:pc(m3,a3),ft:pc(fm,fa)};})();
function renderShoot(){const A=cur.A;document.getElementById('shoot').innerHTML=ring(A.m2,A.a2,'Δίποντα',LG.p2)+ring(A.m3,A.a3,'Τρίποντα',LG.p3)+ring(A.ftm,A.fta,'Βολές',LG.ft);}

function renderChart(){
  const g=cur.games; const el=document.getElementById('chart');
  if(!g.length){el.innerHTML='<p class="sub">Καμία συμμετοχή ακόμη.</p>';return;}
  const W=640,H=230,pl=34,pr=12,pt=14,pb=34;
  const maxV=Math.max(10,...g.map(r=>r[8]),...g.map(r=>r[25]));const minV=Math.min(0,...g.map(r=>r[25]));
  const top=Math.ceil(maxV/5)*5, bot=Math.floor(minV/5)*5;
  const y=v=>pt+(top-v)/(top-bot)*(H-pt-pb);
  const bw=(W-pl-pr)/g.length;
  let s='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Πόντοι και PIR ανά αγώνα">';
  for(let v=bot;v<=top;v+=5){if((top-bot)>30&&v%10)continue;s+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--line)" stroke-width="'+(v===0?1.2:0.6)+'"/><text x="'+(pl-6)+'" y="'+(y(v)+4)+'" text-anchor="end">'+v+'</text>';}
  g.forEach((r,i)=>{const x=pl+i*bw+bw*0.2,w=bw*0.6;s+='<rect x="'+x.toFixed(1)+'" y="'+y(Math.max(r[8],0)).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+(y(0)-y(r[8])).toFixed(1)+'" rx="2" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width=".8"><title>Αγ. '+r[0]+' vs '+tName(r[2])+': '+r[8]+' πόντοι, PIR '+r[25]+'</title></rect>';
    s+='<text x="'+(pl+i*bw+bw/2)+'" y="'+(H-pb+15)+'" text-anchor="middle">'+r[0]+'</text><text x="'+(pl+i*bw+bw/2)+'" y="'+(H-pb+28)+'" text-anchor="middle" style="font-size:9px">'+r[2]+'</text>';});
  const pts=g.map((r,i)=>(pl+i*bw+bw/2).toFixed(1)+','+y(r[25]).toFixed(1)).join(' ');
  s+='<polyline points="'+pts+'" fill="none" stroke="var(--ink)" stroke-width="2"/>';
  g.forEach((r,i)=>{const last=i===g.length-1;s+='<circle cx="'+(pl+i*bw+bw/2).toFixed(1)+'" cy="'+y(r[25]).toFixed(1)+'" r="'+(last?4.5:3)+'" fill="'+(last?'var(--accent)':'var(--ink)')+'"/>';});
  s+='</svg>';
  el.innerHTML=s+'<div class="legend"><span><i style="background:var(--accent-soft);border:1px solid var(--accent)"></i>Πόντοι</span><span><i style="background:var(--ink)"></i>PIR</span><span>Κάτω: αγωνιστική και αντίπαλος</span></div>';
}

function renderLog(){
  const g=cur.games.slice().reverse();
  const head=['Αγ.','Ημ/νία','Αντίπαλος','Απ.','Σκορ','Λεπ.','Πόντ.','2π','3π','Βολ.','Ριμπ.','Ασίστ','Κλ.','Λάθ.','Κοψ.','+/−','PIR'];
  let h='<thead><tr>'+head.map(x=>'<th>'+x+'</th>').join('')+'</tr></thead><tbody>';
  const best=Math.max(...cur.games.map(r=>r[25]));
  g.forEach(r=>{const w=r[4]>r[5];
    h+='<tr><td>'+r[0]+'</td><td class="l">'+ddmm(r[1])+'</td><td class="l">'+(r[3]?'':'@ ')+tName(r[2])+'</td><td><span class="res '+(w?'w':'l')+'">'+(w?'Ν':'Η')+'</span></td><td>'+r[4]+'-'+r[5]+'</td><td>'+mmss(r[7])+'</td><td>'+r[8]+'</td><td>'+r[9]+'/'+r[10]+'</td><td>'+r[11]+'/'+r[12]+'</td><td>'+r[13]+'/'+r[14]+'</td><td>'+(r[15]+r[16])+'</td><td>'+r[17]+'</td><td>'+r[18]+'</td><td>'+r[19]+'</td><td>'+r[20]+'</td><td>'+(r[24]>0?'+':'')+r[24]+'</td><td'+(r[25]===best?' class="hi"':'')+'>'+r[25]+'</td></tr>';});
  h+='</tbody>';
  document.getElementById('log').innerHTML=h;
}

function renderPct(){
  const pool=(cmp==='pos'?qualified.filter(q=>q.pos===cur.pos):qualified);
  const isQ=qualified.includes(cur);
  document.getElementById('pctsub').textContent=(isQ?'':'Λίγα λεπτά ακόμη· η θέση είναι ενδεικτική. ')+'Η θέση του ανάμεσα σε '+pool.length+' παίκτες'+(cmp==='pos'?' ('+(POS[cur.pos]||cur.pos)+')':'')+' σε κάθε κατηγορία.';
  document.getElementById('pct').innerHTML=METRICS.map(([label,fn,fmt,gate])=>{
    const el=pool.filter(q=>!gate||gate(q.A)).filter(q=>isFinite(fn(q.A)));
    const v=fn(cur.A); const ok=(!gate||gate(cur.A))&&isFinite(v);
    const rk=ok?1+el.filter(q=>fn(q.A)>v).length:null; const n=el.length+(ok&&!el.includes(cur)?1:0);
    const top=el.slice().sort((a,b)=>fn(b.A)-fn(a.A))[0];
    const tier=rk==null?'':rk<=n*0.25?'t1':rk<=n*0.5?'t2':rk<=n*0.75?'t3':'t4';
    return '<div class="rrow"><div><b>'+label+'</b><span class="val">'+(ok?fmt(v):'λίγες προσπάθειες')+'</span></div>'+
      '<div class="lead">'+(top&&top!==cur?'1ος: <a href="'+pUrl(top.c)+'\">'+top.name+'</a> '+fmt(fn(top.A)):(top===cur?'Πρώτος στη λίγκα':''))+'</div>'+
      '<div class="rank '+tier+'">'+(rk==null?'–':rk+'<small>ος/'+n+'</small>')+'</div></div>';
  }).join('');
}

function renderSplits(){
  const g=cur.games; const sets=[['Εντός έδρας',r=>r[3]===1],['Εκτός έδρας',r=>r[3]===0],['Σε νίκες',r=>r[4]>r[5]],['Σε ήττες',r=>r[4]<r[5]],['Βασικός',r=>r[6]===1],['Από τον πάγκο',r=>r[6]===0]];
  let h='<thead><tr><th></th><th>Αγ.</th><th>Λεπ.</th><th>Πόντ.</th><th>Ριμπ.</th><th>Ασίστ</th><th>PIR</th></tr></thead><tbody>';
  sets.forEach(([l,f])=>{const s=g.filter(f),n=s.length;const sum=i=>s.reduce((t,r)=>t+r[i],0);
    h+='<tr><td>'+l+'</td><td>'+n+'</td>'+(n?'<td>'+mmss(sum(7)/n)+'</td><td>'+f1(sum(8)/n)+'</td><td>'+f1((sum(15)+sum(16))/n)+'</td><td>'+f1(sum(17)/n)+'</td><td>'+f1(sum(25)/n)+'</td>':'<td>–</td><td>–</td><td>–</td><td>–</td><td>–</td>')+'</tr>';});
  document.getElementById('splits').innerHTML=h+'</tbody>';
}

function renderMates(){
  const tc=cur.t; const list=P.filter(q=>q.t===tc).sort((a,b)=>(b.A.pir/(b.A.G||1))-(a.A.pir/(a.A.G||1)));
  document.getElementById('matesTitle').textContent='Ρόστερ: '+tName(tc);
  const box=document.getElementById('mates'); box.innerHTML='';
  list.forEach(q=>{const b=document.createElement('button');b.className='mate'+(q===cur?' cur':'');b.innerHTML='<span></span><small>'+f1(q.A.pir/(q.A.G||1))+' PIR</small>';b.firstChild.textContent=(q.no?'#'+q.no+' ':'')+q.name;b.onclick=()=>{location.href=pUrl(q.c);};box.appendChild(b);});
}

// ---- search
const q=document.getElementById('q'), sg=document.getElementById('sugg'); let hits=[],sel=0;
const norm=s=>s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'');
function suggest(){
  const t=norm(q.value.trim()); if(!t){sg.hidden=true;return;}
  const th=Object.keys(TEAMS).filter(c=>norm(TEAMS[c][0]).includes(t)||c.toLowerCase()===t).map(c=>({team:c}));
  const ph=P.filter(p=>norm(p.name).includes(t)).sort((a,b)=>(b.A.pir/(b.A.G||1))-(a.A.pir/(a.A.G||1)));
  hits=th.concat(ph).slice(0,12);
  sel=0; sg.innerHTML=''; if(!hits.length){sg.innerHTML='<button disabled>Δεν βρέθηκε παίκτης ή ομάδα</button>';sg.hidden=false;return;}
  hits.forEach((p,i)=>{const b=document.createElement('button');b.type='button';if(i===0)b.className='on';
    if(p.team){b.innerHTML='<span></span><small>Ομάδα</small>';b.firstChild.textContent=TEAMS[p.team][0];}
    else{b.innerHTML='<span></span><small>'+tName(p.t)+'</small>';b.firstChild.textContent=p.name;}
    b.onmousedown=e=>{e.preventDefault();pick(p);};sg.appendChild(b);});
  sg.hidden=false;
}
function pick(p){q.value='';sg.hidden=true;q.blur();location.href=p.team?tUrl(p.team):pUrl(p.c);}
q.addEventListener('input',suggest);
q.addEventListener('keydown',e=>{if(sg.hidden)return;const bs=[...sg.querySelectorAll('button')];
  if(e.key==='ArrowDown'){sel=Math.min(sel+1,bs.length-1);e.preventDefault();}else if(e.key==='ArrowUp'){sel=Math.max(sel-1,0);e.preventDefault();}
  else if(e.key==='Enter'){if(hits[sel])pick(hits[sel]);e.preventDefault();return;}else if(e.key==='Escape'){sg.hidden=true;return;}
  bs.forEach((b,i)=>b.classList.toggle('on',i===sel));});
q.addEventListener('blur',()=>setTimeout(()=>sg.hidden=true,120));

document.getElementById('modeSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;mode=b.dataset.m;[...e.currentTarget.children].forEach(x=>x.classList.toggle('on',x===b));renderAvg();});
document.getElementById('cmpSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;cmp=b.dataset.c;[...e.currentTarget.children].forEach(x=>x.classList.toggle('on',x===b));renderPct();});
{const u=document.getElementById('upd');if(u)u.textContent=UPDATED;}

// ---- league: standings, schedule, team aggregates
const LEAGUE=D.league;
const STAND=LEAGUE.stand, GAMES=LEAGUE.games;
const SROW=Object.fromEntries(STAND.map(s=>[s[1],s]));
function gDate(s){const y=2020+(+s[8]);return new Date(Date.UTC(y,+s.slice(0,2)-1,+s.slice(2,4),+s.slice(4,6),+s.slice(6,8)));}
function when(s){try{return gDate(s).toLocaleString('el-GR',{timeZone:'Europe/Athens',weekday:'short',day:'numeric',month:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});}catch(e){return s;}}
const crest=(c,cls)=>'<span class="'+(cls||'crest')+'" style="background:'+tColor(c)+'">'+c+'</span>';
const tlink=c=>'<a class="tlink" href="'+tUrl(c)+'\">'+crest(c)+'<span>'+tName(c)+'</span></a>';
const recOf=c=>SROW[c]?SROW[c][2]+'-'+SROW[c][3]:'';
const ord=n=>n+'η';
const pct1=v=>isFinite(v)?(v*100).toFixed(1)+'%':'–';
const sgn=v=>(v>0?'+':'')+f1(v);

const TG={};
P.forEach(p=>{if(p.t.includes(';'))return;p.games.forEach(r=>{const k=p.t+'|'+r[0];const a=TG[k]||(TG[k]={team:p.t,opp:r[2],round:r[0],s:new Array(26).fill(0)});for(let i=7;i<26;i++)a.s[i]+=r[i];});});
const TS={};
Object.values(TG).forEach(g=>{const T=TS[g.team]||(TS[g.team]={g:0,s:new Array(26).fill(0),o:new Array(26).fill(0)});T.g++;for(let i=7;i<26;i++)T.s[i]+=g.s[i];const O=TG[g.opp+'|'+g.round];if(O)for(let i=7;i<26;i++)T.o[i]+=O.s[i];});
Object.entries(TS).forEach(([c,T])=>{const s=T.s,o=T.o,G=T.g||1;
  const fga=s[10]+s[12], ofga=o[10]+o[12];
  const poss=fga-s[15]+s[19]+0.44*s[14], oposs=ofga-o[15]+o[19]+0.44*o[14], pp=(poss+oposs)/2||1;
  Object.assign(T,{G,ppg:s[8]/G,oppg:o[8]/G,diff:(s[8]-o[8])/G,reb:(s[15]+s[16])/G,ast:s[17]/G,stl:s[18]/G,tov:s[19]/G,blk:s[20]/G,pir:s[25]/G,
    p2:s[10]?s[9]/s[10]:NaN,p3:s[12]?s[11]/s[12]:NaN,ft:s[14]?s[13]/s[14]:NaN,
    ortg:s[8]/pp*100,drtg:o[8]/pp*100,pace:pp/G,
    efg:fga?(s[9]+1.5*s[11])/fga:NaN,tovp:s[19]/poss,orbp:(s[15]+o[16])?s[15]/(s[15]+o[16]):NaN,ftr:fga?s[13]/fga:NaN,
    oefg:ofga?(o[9]+1.5*o[11])/ofga:NaN,otovp:o[19]/oposs,oorbp:(o[15]+s[16])?o[15]/(o[15]+s[16]):NaN,oftr:ofga?o[13]/ofga:NaN});
  T.net=T.ortg-T.drtg;});
function rank(code,key,high){const v=TS[code]&&TS[code][key];if(!isFinite(v))return null;const arr=Object.values(TS).map(t=>t[key]).filter(isFinite);return 1+arr.filter(x=>high?x>v:x<v).length;}

// generic sortable table
function sortable(el,cols,rows,key,dir,onRow){
  let sk=key,sd=dir;
  function draw(){
    const col=cols.find(c=>c.k===sk);
    const rs=rows.slice().sort((a,b)=>{const x=col.v(a),y=col.v(b);if(typeof x==='string')return sd*x.localeCompare(y,'el');return sd*((isFinite(x)?x:-1e9)-(isFinite(y)?y:-1e9));});
    el.innerHTML='<thead><tr>'+cols.map(c=>'<th data-k="'+c.k+'"'+(c.k===sk?' class="sorted"':'')+(c.t?' title="'+c.t+'"':'')+'>'+c.h+(c.k===sk?(sd>0?' ▲':' ▼'):'')+'</th>').join('')+'</tr></thead><tbody>'+
      rs.map((r,i)=>'<tr'+(onRow?' class="click" data-i="'+rows.indexOf(r)+'"':'')+'>'+cols.map(c=>'<td'+(c.l?' class="l"':'')+'>'+c.f(r,i)+'</td>').join('')+'</tr>').join('')+'</tbody>';
  }
  el.onclick=e=>{const th=e.target.closest('th');if(th){const k=th.dataset.k;if(k===sk)sd=-sd;else{sk=k;sd=cols.find(c=>c.k===k).d||-1;}draw();return;}
    if(e.target.closest('a'))return;const tr=e.target.closest('tr.click');if(tr&&onRow)onRow(rows[+tr.dataset.i]);};
  draw();
}

function renderStand(){
  
  const played=GAMES.filter(g=>g[6]).length, lastR=Math.max(...GAMES.filter(g=>g[6]).map(g=>g[0]));
  document.getElementById('standSub').textContent='Κανονική περίοδος · μετά την '+lastR+'η αγωνιστική · '+played+' αγώνες';
  const nextOf=c=>GAMES.find(g=>!g[6]&&(g[2]===c||g[3]===c));
  let h='<thead><tr><th>#</th><th>Ομάδα</th><th>Αγ.</th><th>Ν</th><th>Η</th><th>%</th><th>Υπέρ</th><th>Κατά</th><th>Διαφ.</th><th>Έδρα</th><th>Εκτός</th><th>Φόρμα</th><th>Επόμενος</th></tr></thead><tbody>';
  STAND.forEach(s=>{const [pos,c,w,l,pf,pa,hr,ar,f,chg]=s;const n=nextOf(c);const zone=pos<=6?'z1':pos<=10?'z2':'z0';
    h+='<tr class="click" data-c="'+c+'"><td class="pos"><i class="'+zone+'"></i>'+pos+(chg==='Up'?'<span class="chg up">▲</span>':chg==='Down'?'<span class="chg down">▼</span>':'')+'</td><td class="l">'+tlink(c)+'</td><td>'+(w+l)+'</td><td><b>'+w+'</b></td><td>'+l+'</td><td>'+(w+l?(100*w/(w+l)).toFixed(0):0)+'</td><td>'+pf+'</td><td>'+pa+'</td><td>'+((pf-pa)>0?'+':'')+(pf-pa)+'</td><td>'+hr+'</td><td>'+ar+'</td><td><span class="form">'+f.split('').map(x=>'<b class="'+x+'">'+(x==='W'?'Ν':'Η')+'</b>').join('')+'</span></td><td class="l">'+(n?(n[2]===c?'vs ':'@ ')+tName(n[2]===c?n[3]:n[2]):'–')+'</td></tr>';});
  const tb=document.getElementById('standTbl');tb.innerHTML=h+'</tbody>';
  tb.onclick=e=>{if(e.target.closest('a'))return;const tr=e.target.closest('tr.click');if(tr)location.href=tUrl(tr.dataset.c);};
  const nr=Math.min(...GAMES.filter(g=>!g[6]).map(g=>g[0]));
  const ng=GAMES.filter(g=>g[0]===nr);
  document.getElementById('nextSub').textContent=nr+'η αγωνιστική · ώρα Ελλάδας';
  document.getElementById('nextRound').innerHTML=ng.map(g=>'<div class="fx"><span class="when">'+when(g[1])+(g[6]?' · τελικό':'')+'</span><div class="row"><a href="'+tUrl(g[2])+'\">'+crest(g[2])+' '+tName(g[2])+'</a><span class="rk">'+(g[6]?g[4]:recOf(g[2]))+'</span></div><div class="row"><a href="'+tUrl(g[3])+'\">'+crest(g[3])+' '+tName(g[3])+'</a><span class="rk">'+(g[6]?g[5]:recOf(g[3]))+'</span></div></div>').join('');
  const codes=STAND.map(s=>s[1]).filter(c=>TS[c]);
  const cols=[
    {k:'team',h:'Ομάδα',l:1,v:c=>tName(c),f:c=>tlink(c),d:1},
    {k:'ppg',h:'Πόντοι',v:c=>TS[c].ppg,f:c=>f1(TS[c].ppg)},
    {k:'oppg',h:'Κατά',v:c=>-TS[c].oppg,f:c=>f1(TS[c].oppg)},
    {k:'ortg',h:'Επ. απόδ.',t:'Πόντοι ανά 100 κατοχές',v:c=>TS[c].ortg,f:c=>f1(TS[c].ortg)},
    {k:'drtg',h:'Αμ. απόδ.',t:'Πόντοι που δέχεται ανά 100 κατοχές (χαμηλότερο = καλύτερο)',v:c=>-TS[c].drtg,f:c=>f1(TS[c].drtg)},
    {k:'net',h:'Καθαρή',t:'Επιθετική μείον αμυντική απόδοση',v:c=>TS[c].net,f:c=>sgn(TS[c].net)},
    {k:'pace',h:'Ρυθμός',t:'Κατοχές ανά αγώνα',v:c=>TS[c].pace,f:c=>f1(TS[c].pace)},
    {k:'reb',h:'Ριμπ.',v:c=>TS[c].reb,f:c=>f1(TS[c].reb)},
    {k:'ast',h:'Ασίστ',v:c=>TS[c].ast,f:c=>f1(TS[c].ast)},
    {k:'tov',h:'Λάθη',v:c=>-TS[c].tov,f:c=>f1(TS[c].tov)},
    {k:'p2',h:'2π%',v:c=>TS[c].p2,f:c=>pct1(TS[c].p2)},
    {k:'p3',h:'3π%',v:c=>TS[c].p3,f:c=>pct1(TS[c].p3)},
    {k:'ft',h:'Βολές%',v:c=>TS[c].ft,f:c=>pct1(TS[c].ft)},
    {k:'pir',h:'PIR',v:c=>TS[c].pir,f:c=>f1(TS[c].pir)}];
  sortable(document.getElementById('teamStats'),cols,codes,'net',-1,c=>{location.href=tUrl(c);});
}

function renderTeam(c){
  if(!TEAMS[c]){location.href=BASE;return;}
  const s=SROW[c]||[0,c,0,0,0,0,'0-0','0-0','',''], T=TS[c]||{};
  
  const bc=document.getElementById('tCrest');bc.className='bigcrest';bc.style.background=tColor(c);bc.textContent=c;
  document.getElementById('tName').textContent=TEAMS[c][0];
  document.getElementById('tMeta').innerHTML='<span><b>'+ord(s[0])+'</b> στη βαθμολογία</span><span>Έδρα '+s[6]+'</span><span>Εκτός '+s[7]+'</span><span class="form">'+s[8].split('').map(x=>'<b class="'+x+'">'+(x==='W'?'Ν':'Η')+'</b>').join('')+'</span>';
  const d=s[4]-s[5];
  document.getElementById('tRec').innerHTML='<span>Ρεκόρ</span><b>'+s[2]+'–'+s[3]+'</b><span>Διαφορά '+(d>0?'+':'')+d+'</span>';
  const bx=(l,v,k,high)=>'<div><b>'+v+'</b><span>'+l+'</span><small>'+(rank(c,k,high)?ord(rank(c,k,high))+' στη λίγκα':'')+'</small></div>';
  document.getElementById('tBoard').innerHTML=bx('Πόντοι',f1(T.ppg),'ppg',1)+bx('Κατά',f1(T.oppg),'oppg',0)+bx('Επ. απόδοση',f1(T.ortg),'ortg',1)+bx('Αμ. απόδοση',f1(T.drtg),'drtg',0)+bx('Καθαρή',sgn(T.net),'net',1)+bx('Ρυθμός',f1(T.pace),'pace',1);
  // results + chart
  const res=GAMES.filter(g=>g[6]&&(g[2]===c||g[3]===c)).map(g=>{const home=g[2]===c;return{r:g[0],opp:home?g[3]:g[2],home,us:home?g[4]:g[5],them:home?g[5]:g[4]};});
  const el=document.getElementById('tChart');
  if(res.length){const W=640,H=200,pl=34,pr=12,pt=12,pb=34;const mx=Math.max(10,...res.map(r=>Math.abs(r.us-r.them)));const top=Math.ceil(mx/10)*10;
    const y=v=>pt+(top-v)/(2*top)*(H-pt-pb);const bw=(W-pl-pr)/res.length;
    let sv='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Διαφορά πόντων ανά αγώνα">';
    [-top,-top/2,0,top/2,top].forEach(v=>{sv+='<line x1="'+pl+'" x2="'+(W-pr)+'" y1="'+y(v)+'" y2="'+y(v)+'" stroke="var(--line)" stroke-width="'+(v===0?1.4:.6)+'"/><text x="'+(pl-6)+'" y="'+(y(v)+4)+'" text-anchor="end">'+(v>0?'+':'')+v+'</text>';});
    res.forEach((r,i)=>{const m=r.us-r.them,x=pl+i*bw+bw*.2,w=bw*.6;sv+='<rect x="'+x.toFixed(1)+'" y="'+y(Math.max(m,0)).toFixed(1)+'" width="'+w.toFixed(1)+'" height="'+Math.abs(y(m)-y(0)).toFixed(1)+'" rx="2" fill="'+(m>0?'var(--good)':'var(--low)')+'"><title>'+r.r+'η αγ. '+(r.home?'vs ':'@ ')+tName(r.opp)+': '+r.us+'-'+r.them+'</title></rect><text x="'+(pl+i*bw+bw/2)+'" y="'+(H-pb+15)+'" text-anchor="middle">'+r.r+'</text><text x="'+(pl+i*bw+bw/2)+'" y="'+(H-pb+28)+'" text-anchor="middle" style="font-size:9px">'+r.opp+'</text>';});
    el.innerHTML=sv+'</svg>';}else el.innerHTML='<p class="sub">Δεν έχει παίξει ακόμη.</p>';
  document.getElementById('tResults').innerHTML=res.slice().reverse().map(r=>'<div class="rs"><span class="res '+(r.us>r.them?'w':'l')+'">'+(r.us>r.them?'Ν':'Η')+'</span><a href="'+tUrl(r.opp)+'\">'+(r.home?'vs ':'@ ')+tName(r.opp)+'</a><small>'+r.us+'-'+r.them+'</small></div>').join('');
  // roster
  const ros=P.filter(p=>p.t===c||p.t.split(';').pop()===c);
  const g1=p=>p.A.G||1;
  sortable(document.getElementById('tRoster'),[
    {k:'no',h:'#',v:p=>-(+p.no||99),f:p=>p.no||'',d:-1},
    {k:'name',h:'Παίκτης',l:1,v:p=>p.name,f:p=>'<a class="tlink" href="'+pUrl(p.c)+'\"><span>'+p.name.replace(/</g,'')+'</span></a>',d:1},
    {k:'pos',h:'Θέση',l:1,v:p=>POS[p.pos]||p.pos,f:p=>POS[p.pos]||p.pos,d:1},
    {k:'g',h:'Αγ.',v:p=>p.A.G,f:p=>p.A.G},
    {k:'min',h:'Λεπ.',v:p=>p.A.min/g1(p),f:p=>p.A.G?mmss(p.A.min*60/g1(p)):'–'},
    {k:'pts',h:'Πόντ.',v:p=>p.A.pts/g1(p),f:p=>f1(p.A.pts/g1(p))},
    {k:'reb',h:'Ριμπ.',v:p=>p.A.reb/g1(p),f:p=>f1(p.A.reb/g1(p))},
    {k:'ast',h:'Ασίστ',v:p=>p.A.ast/g1(p),f:p=>f1(p.A.ast/g1(p))},
    {k:'p3',h:'3π%',v:p=>p.A.p3,f:p=>p.A.a3?pct1(p.A.p3):'–'},
    {k:'ts',h:'TS%',t:'True Shooting',v:p=>p.A.ts,f:p=>pct1(p.A.ts)},
    {k:'pm',h:'+/−',v:p=>p.A.pm/g1(p),f:p=>sgn(p.A.pm/g1(p))},
    {k:'pir',h:'PIR',v:p=>p.A.pir/g1(p),f:p=>'<b>'+f1(p.A.pir/g1(p))+'</b>'}],ros,'pir',-1,p=>{location.href=pUrl(p.c);});
  // four factors
  const ff=[['Ευστοχία (eFG%)','efg',1,'oefg',0],['Λάθη ανά κατοχή','tovp',0,'otovp',1],['Επιθ. ριμπάουντ %','orbp',1,'oorbp',0],['Βολές ανά σουτ','ftr',1,'oftr',0]];
  document.getElementById('tFactors').innerHTML='<thead><tr><th></th><th>Επίθεση</th><th>Άμυνα</th></tr></thead><tbody>'+ff.map(([l,k,h,ok,oh])=>'<tr><td class="l">'+l+'</td><td>'+pct1(T[k])+' <span class="rk">('+ord(rank(c,k,h))+')</span></td><td>'+pct1(T[ok])+' <span class="rk">('+ord(rank(c,ok,oh))+')</span></td></tr>').join('')+'</tbody>';
  // leaders
  const elig=ros.filter(p=>p.A.G>=Math.min(3,T.G||3));
  const lead=(l,fn,fmt)=>{const b=elig.slice().sort((a,b)=>fn(b)-fn(a))[0];return b?'<button class="ld" data-c="'+b.c+'"><span>'+l+'</span><b>'+fmt(fn(b))+'</b><em></em></button>':'';};
  const LB=document.getElementById('tLeaders');
  LB.innerHTML=lead('Πόντοι',p=>p.A.pts/g1(p),f1)+lead('Ριμπάουντ',p=>p.A.reb/g1(p),f1)+lead('Ασίστ',p=>p.A.ast/g1(p),f1)+lead('PIR',p=>p.A.pir/g1(p),f1);
  LB.querySelectorAll('.ld').forEach(b=>{b.querySelector('em').textContent=byCode[b.dataset.c].name;b.onclick=()=>{location.href=pUrl(b.dataset.c);};});
  renderTeamHeat(c);
  // fixtures
  const nx=GAMES.filter(g=>!g[6]&&(g[2]===c||g[3]===c)).slice(0,5);
  document.getElementById('tNext').innerHTML=nx.length?nx.map(g=>{const home=g[2]===c,o=home?g[3]:g[2];return '<div class="fx"><span class="when">'+g[0]+'η αγ. · '+when(g[1])+'</span><div class="row"><a href="'+tUrl(o)+'\">'+(home?'vs ':'@ ')+crest(o)+' '+tName(o)+'</a><span class="rk">'+recOf(o)+' · '+ord(SROW[o]?SROW[o][0]:0)+'</span></div></div>';}).join(''):'<p class="sub">Δεν υπάρχουν προγραμματισμένοι αγώνες.</p>';
}

// ---- Θερμόμετρο: last 3 games vs all earlier games
const avgI=(a,i)=>a.reduce((s,r)=>s+r[i],0)/a.length;
function heatOf(p){const g=p.games;if(g.length<5)return null;const l3=g.slice(-3),pre=g.slice(0,-3);
  return{d:avgI(l3,25)-avgI(pre,25),l3:avgI(l3,25),pre:avgI(pre,25),pts3:avgI(l3,8),ptsPre:avgI(pre,8),min3:avgI(l3,7)/60,minPre:avgI(pre,7)/60,last:l3};}
function heatLab(d,s){s=s||1;return d>=5*s?['Καίει','var(--hot)']:d>=2*s?['Ζεσταίνεται','var(--warm)']:d>-2*s?['Σταθερός','var(--flat)']:d>-5*s?['Κρυώνει','var(--cool)']:['Παγωμένος','var(--cold)'];}
const deg=d=>(d>0?'+':d<0?'−':'')+Math.abs(d).toFixed(1)+'°';
const heatElig=()=>P.filter(p=>p.A.G>=5&&p.A.min/p.A.G>=10).map(p=>({p,h:heatOf(p)})).filter(x=>x.h);
function hrow(p,h,sub){const [,col]=heatLab(h.d);
  return '<a class="hrow" href="'+pUrl(p.c)+'\"><span class="deg" style="background:'+col+'">'+deg(h.d)+'</span><span class="nm"><span class="pn"></span><small>'+(sub||tName(p.t))+'</small></span><span class="tr">PIR '+f1(h.pre)+' → <b>'+f1(h.l3)+'</b></span></a>';}
function fillNames(el,list){el.querySelectorAll('.pn').forEach((s,i)=>{s.textContent=list[i].p.name;});}

function renderPHeat(){
  const el=document.getElementById('pHeat');const h=heatOf(cur);
  if(!h){el.innerHTML='<p class="sub" style="margin:0">Χρειάζονται τουλάχιστον 5 αγώνες για να μετρήσει η φόρμα.</p>';return;}
  const [lab,col]=heatLab(h.d);
  const row=(l,a,b,fmt)=>'<tr><td class="l">'+l+'</td><td>'+fmt(b)+'</td><td><b>'+fmt(a)+'</b></td><td>'+((a-b)>0?'+':'')+fmt(a-b)+'</td></tr>';
  el.innerHTML='<div class="therm"><div class="big" style="background:'+col+'"><div><b>'+deg(h.d)+'</b><span>'+lab+'</span></div></div>'+
    '<div class="tbl"><table><thead><tr><th></th><th>Πριν</th><th>Τελ. 3</th><th>Διαφ.</th></tr></thead><tbody>'+
    row('PIR',h.l3,h.pre,f1)+row('Πόντοι',h.pts3,h.ptsPre,f1)+row('Λεπτά',h.min3,h.minPre,f1)+'</tbody></table></div></div>'+
    '<p class="note">Τελευταίοι 3: '+h.last.map(r=>r[0]+'η '+(r[3]?'vs ':'@ ')+r[2]+' ('+r[25]+')').join(' · ')+'</p>';
}

function renderTeamHeat(c){
  const list=P.filter(p=>p.t===c||p.t.split(';').pop()===c).map(p=>({p,h:heatOf(p)})).filter(x=>x.h).sort((a,b)=>b.h.d-a.h.d);
  const el=document.getElementById('tHeat');
  if(!list.length){el.innerHTML='<p class="sub">Χρειάζονται τουλάχιστον 5 αγώνες ανά παίκτη.</p>';return;}
  el.innerHTML=list.map(x=>hrow(x.p,x.h,POS[x.p.pos]||x.p.pos)).join('');fillNames(el,list);
}

function teamHeat(c){const r=GAMES.filter(g=>g[6]&&(g[2]===c||g[3]===c)).map(g=>g[2]===c?g[4]-g[5]:g[5]-g[4]);if(r.length<5)return null;
  const l3=r.slice(-3),pre=r.slice(0,-3),av=a=>a.reduce((s,x)=>s+x,0)/a.length;return{d:av(l3)-av(pre),l3,pre:av(pre),m3:av(l3)};}

function renderForm(){
  
  const all=heatElig().sort((a,b)=>b.h.d-a.h.d);
  const hot=all.filter(x=>x.h.d>0).slice(0,10), cold=all.filter(x=>x.h.d<0).slice(-10).reverse();
  const H=document.getElementById('fHot'),C=document.getElementById('fCold');
  H.innerHTML=hot.map(x=>hrow(x.p,x.h)).join('')||'<p class="sub">Κανείς ακόμη.</p>';fillNames(H,hot);
  C.innerHTML=cold.map(x=>hrow(x.p,x.h)).join('')||'<p class="sub">Κανείς ακόμη.</p>';fillNames(C,cold);
  const tl=Object.keys(TEAMS).map(c=>({c,h:teamHeat(c)})).filter(x=>x.h).sort((a,b)=>b.h.d-a.h.d);
  document.getElementById('fTeams').innerHTML=tl.map(({c,h})=>{const [,col]=heatLab(h.d,1.6);
    return '<a class="hrow" href="'+tUrl(c)+'\"><span class="deg" style="background:'+col+'">'+deg(h.d)+'</span><span class="nm">'+crest(c)+' '+tName(c)+'<small>Διαφορά '+sgn(h.pre)+' → '+sgn(h.m3)+'</small></span><span class="form">'+h.l3.map(m=>'<b class="'+(m>0?'W':'L')+'">'+(m>0?'Ν':'Η')+'</b>').join('')+'</span></a>';}).join('');
}

// ---- Fantasy
const FPOS={Guard:'Γκαρντ',Forward:'Φόργουορντ',Center:'Σέντερ'};
let fpos='Guard', fsort='v';
const FSORT={base:['PIR σεζόν',x=>x.base],rec:['PIR 3 τελευταίων',x=>x.rec],heat:['φόρμα (Θερμόμετρο)',x=>x.h?x.h.d:-99],v:['εκτίμηση PIR',x=>x.v]};
const lgAllowed=(()=>{const v=Object.values(TS).map(t=>t.o[25]/t.G);return v.reduce((a,b)=>a+b,0)/v.length;})();
const allowed=c=>TS[c]?TS[c].o[25]/TS[c].G:lgAllowed;
const allowedRank=c=>{const arr=Object.keys(TS).map(allowed);return 1+arr.filter(x=>x>allowed(c)).length;}; // 1 = gives up most PIR = easiest
const nextGames=(c,n)=>GAMES.filter(g=>!g[6]&&(g[2]===c||g[3]===c)).slice(0,n);
function weekKey(s){const d=gDate(s);const day=(d.getUTCDay()+6)%7;return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()-day)).toISOString().slice(0,10);}
function easeCol(rk){return rk<=5?'var(--good)':rk<=10?'var(--ok)':rk<=15?'var(--mid)':'var(--low)';}
function proj(p){
  const h=heatOf(p), A=p.A, base=A.pir/A.G, rec=h?h.l3:base, c=p.t.split(';').pop();
  const ng=nextGames(c,1)[0]; if(!ng)return null;
  const home=ng[2]===c, opp=home?ng[3]:ng[2];
  const v=(0.5*base+0.5*rec)*(allowed(opp)/lgAllowed)*(home?1.03:0.97);
  return{v,base,rec,opp,home,h,g:ng};
}
function renderFantasy(){
  
  const nr=Math.min(...GAMES.filter(g=>!g[6]).map(g=>g[0]));
  document.getElementById('fanSub').textContent='Προτάσεις για την '+nr+'η αγωνιστική με βάση φόρμα, μέσο όρο και αντίπαλο';
  // picks
  const pool=P.filter(p=>p.pos===fpos&&!p.t.includes(';')&&p.A.G>=3&&p.A.min/p.A.G>=12).map(p=>({p,x:proj(p)})).filter(o=>o.x).sort((a,b)=>FSORT[fsort][1](b.x)-FSORT[fsort][1](a.x)).slice(0,15);
  document.getElementById('fanPicksSub').textContent='Οι 15 πρώτοι ανά θέση με βάση '+FSORT[fsort][0]+' · πατήστε μια στήλη για άλλη ταξινόμηση';
  const tb=document.getElementById('fanPicks');
  tb.innerHTML='<thead><tr><th>#</th><th>Παίκτης</th><th>Αντίπαλος</th>'+[['base','PIR','Μέσο PIR σεζόν'],['rec','Τελ. 3','Μέσο PIR 3 τελευταίων'],['heat','Θερμόμετρο','Φόρμα: τελευταίοι 3 σε σχέση με τους προηγούμενους'],['v','Εκτίμηση','Εκτίμηση PIR για τον επόμενο αγώνα']].map(([k,l,ti])=>'<th class="sth'+(fsort===k?' sorted':'')+'" data-s="'+k+'" title="'+ti+'" tabindex="0" role="button">'+l+(fsort===k?' ▼':'')+'</th>').join('')+'</tr></thead><tbody>'+
   pool.map((o,i)=>{const x=o.x,rk=allowedRank(x.opp),lab=x.h?heatLab(x.h.d):null;
    return '<tr class="click" data-c="'+o.p.c+'"><td>'+(i+1)+'</td><td class="l"><a class="tlink" href="'+pUrl(o.p.c)+'\">'+crest(o.p.t)+'<span class="pn"></span></a></td><td class="l">'+(x.home?'vs ':'@ ')+tName(x.opp)+' <span class="ease" style="background:'+easeCol(rk)+'" title="'+ord(rk)+' σε PIR που δέχεται">'+ord(rk)+'</span></td><td>'+f1(x.base)+'</td><td>'+f1(x.rec)+'</td><td>'+(lab?'<span class="deg sm" style="background:'+lab[1]+'">'+deg(x.h.d)+'</span>':'–')+'</td><td class="hi">'+f1(x.v)+'</td></tr>';}).join('')+'</tbody>';
  tb.querySelectorAll('.pn').forEach((s,i)=>s.textContent=pool[i].p.name);
  tb.onclick=e=>{const th=e.target.closest('th.sth');if(th){fsort=th.dataset.s;renderFantasy();return;}if(e.target.closest('a'))return;const tr=e.target.closest('tr.click');if(tr)location.href=pUrl(tr.dataset.c);};
  // schedule difficulty
  const R=[...new Set(GAMES.filter(g=>!g[6]).map(g=>g[0]))].slice(0,5);
  const codes=STAND.map(s=>s[1]);
  let h='<thead><tr><th>Ομάδα</th>'+R.map(r=>'<th>'+r+'η</th>').join('')+'<th title="Μέσος δείκτης ευκολίας των 5 αγώνων">Ευκολία</th></tr></thead><tbody>';
  const rowsD=codes.map(c=>{const cells=R.map(r=>GAMES.find(g=>g[0]===r&&(g[2]===c||g[3]===c)));const wk={};cells.forEach(g=>{if(g){const k=weekKey(g[1]);wk[k]=(wk[k]||0)+1;}});
    const score=cells.filter(Boolean).reduce((s,g)=>{const o=g[2]===c?g[3]:g[2];return s+(21-allowedRank(o));},0)/Math.max(1,cells.filter(Boolean).length);
    return{c,cells,wk,score};}).sort((a,b)=>b.score-a.score);
  rowsD.forEach(({c,cells,wk,score})=>{h+='<tr><td class="l">'+tlink(c)+'</td>'+cells.map(g=>{if(!g)return '<td>–</td>';const home=g[2]===c,o=home?g[3]:g[2],rk=allowedRank(o),dbl=wk[weekKey(g[1])]>1;
      return '<td class="fxc" style="--e:'+easeCol(rk)+'" title="'+(home?'Εντός':'Εκτός')+' με '+tName(o)+(dbl?' · διπλή εβδομάδα':'')+'">'+(home?o:'@'+o)+(dbl?'<sup>×2</sup>':'')+'</td>';}).join('')+'<td><b>'+score.toFixed(1)+'</b></td></tr>';});
  document.getElementById('fanSched').innerHTML=h+'</tbody>';
  // team of the round
  const lr=Math.max(...GAMES.filter(g=>g[6]).map(g=>g[0]));
  const perf=[];P.forEach(p=>p.games.forEach(r=>{if(r[0]===lr)perf.push({p,r});}));
  perf.sort((a,b)=>b.r[25]-a.r[25]);
  const need={Guard:2,Forward:2,Center:1},five=[];
  perf.forEach(o=>{if(need[o.p.pos]>0){need[o.p.pos]--;five.push(o);}});
  const sixth=perf.find(o=>!five.includes(o));
  const all=five.concat(sixth?[sixth]:[]);
  const tot=five.reduce((s,o)=>s+o.r[25],0)+five[0].r[25]+(sixth?sixth.r[25]:0);
  document.getElementById('fanTotSub').textContent=lr+'η αγωνιστική · 2 γκαρντ, 2 φόργουορντ, 1 σέντερ και 6ος παίκτης · με αρχηγό (×2) τον πρώτο: '+tot+' PIR';
  const F=document.getElementById('fanTot');
  F.innerHTML=all.map((o,i)=>'<button class="ld" data-c="'+o.p.c+'"><span>'+(i===5?'6ος παίκτης':FPOS[o.p.pos])+(i===0?' · αρχηγός':'')+'</span><b>'+o.r[25]+'</b><em></em><small class="rk">'+tName(o.p.t)+' · '+o.r[8]+' πόντοι</small></button>').join('');
  F.querySelectorAll('.ld').forEach((b,i)=>{b.querySelector('em').textContent=all[i].p.name;b.onclick=()=>{location.href=pUrl(all[i].p.c);};});
}

document.getElementById('fanPicks').addEventListener('keydown',e=>{const th=e.target.closest('th.sth');if(th&&(e.key==='Enter'||e.key===' ')){e.preventDefault();fsort=th.dataset.s;renderFantasy();}});
document.getElementById('fanSeg').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;fpos=b.dataset.p;[...e.currentTarget.children].forEach(x=>x.classList.toggle('on',x===b));renderFantasy();});

// ---- Προγνωστικά: εκτίμηση από αποδόσεις ανά 100 κατοχές
const HCA=3; // πλεονέκτημα έδρας σε πόντους
function ncdf(x){const t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2);const p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p;}
function predict(h,a){const H=TS[h],A=TS[a];if(!H||!A)return null;const pace=(H.pace+A.pace)/2;
  const ph=pace*((H.ortg+A.drtg)/2)/100+HCA/2, pa=pace*((A.ortg+H.drtg)/2)/100-HCA/2;
  return{ph,pa,prob:ncdf((ph-pa)/11),total:ph+pa};}
function renderPreds(){
  const nr=Math.min(...GAMES.filter(g=>!g[6]).map(g=>g[0]));
  if(!isFinite(nr)){document.getElementById('preds').innerHTML='<p class="sub">Δεν υπάρχουν προγραμματισμένοι αγώνες.</p>';return;}
  document.getElementById('predSub').textContent=nr+'η αγωνιστική · ώρα Ελλάδας';
  const arts=(D.articles||[]).filter(x=>x.type==='prognostiko');
  const gs=GAMES.filter(g=>g[0]===nr);
  const side=(c,home)=>{const s=SROW[c];const hh=teamHeat(c);const hot=P.filter(p=>p.t===c).map(p=>({p,h:heatOf(p)})).filter(x=>x.h&&x.p.A.min/x.p.A.G>=10).sort((a,b)=>b.h.d-a.h.d)[0];
    return '<div class="pside"><a class="tlink" href="'+tUrl(c)+'">'+crest(c)+'<span>'+tName(c)+'</span></a><div class="rk">'+(s?ord(s[0])+' · '+s[2]+'-'+s[3]+' · '+(home?'έδρα '+s[6]:'εκτός '+s[7]):'')+'</div>'+
      (s?'<span class="form">'+s[8].split('').map(x=>'<b class="'+x+'">'+(x==='W'?'Ν':'Η')+'</b>').join('')+'</span>':'')+
      (hot?'<div class="rk">Σε φόρμα: <a href="'+pUrl(hot.p.c)+'" class="hotp" data-c="'+hot.p.c+'"></a> '+deg(hot.h.d)+'</div>':'')+'</div>';};
  const box=document.getElementById('preds');
  box.innerHTML=gs.map(g=>{const [r,w,h,a,hs,as,pl]=g;const x=predict(h,a);const art=arts.find(z=>z.game===h+'-'+a);
    const h2h=GAMES.filter(z=>z[6]&&((z[2]===h&&z[3]===a)||(z[2]===a&&z[3]===h)));
    let mid='';
    if(pl)mid='<div class="pscore"><b>'+hs+' – '+as+'</b><span class="rk">τελικό</span></div>';
    else if(x){const fav=x.prob>=.5?h:a,pp=Math.round(100*Math.max(x.prob,1-x.prob));
      mid='<div class="pscore"><b>'+Math.round(x.ph)+' – '+Math.round(x.pa)+'</b><span class="rk">εκτίμηση σκορ</span></div>'+
      '<div class="pbar" title="Πιθανότητα νίκης"><i style="width:'+(100*x.prob).toFixed(0)+'%;background:'+tColor(h)+'"></i><i style="width:'+(100-100*x.prob).toFixed(0)+'%;background:'+tColor(a)+'"></i></div>'+
      '<div class="rk pfacts">Φαβορί: <b>'+tName(fav)+'</b> ('+pp+'%) · Σύνολο ~'+Math.round(x.total)+' πόντοι'+(h2h.length?' · Φέτος: '+h2h.map(z=>z[2]+' '+z[4]+'-'+z[5]+' '+z[3]).join(', '):'')+'</div>';}
    return '<article class="pcard"><div class="when">'+when(w)+'</div><div class="pgrid">'+side(h,1)+'<div class="pmid">'+mid+'</div>'+side(a,0)+'</div>'+
      (art?'<a class="pread" href="'+art.url+'">Διάβασε το προγνωστικό μας →</a>':'')+((D.tips||[]).filter(t=>t.g===h+'-'+a&&t.r===r).length?'<div class="ptips"><a href="'+BASE+'tipsters/">Tipsters</a>: '+(D.tips||[]).filter(t=>t.g===h+'-'+a&&t.r===r).map(t=>'<a class="tipa" href="'+(t.u||BASE+'tipsters/')+'"><b>'+t.n.replace(/</g,'')+'</b> '+t.l.replace(/</g,'')+'</a>').join(' · ')+'</div>':'')+'</article>';}).join('');
  box.querySelectorAll('.hotp').forEach(el=>el.textContent=byCode[el.dataset.c].name);
  const L=document.getElementById('predArts');
  if(arts.length){L.innerHTML=arts.slice(0,8).map(z=>'<a class="acard" href="'+z.url+'"><time>'+z.dateText+'</time><h2></h2><p></p></a>').join('');
    L.querySelectorAll('.acard').forEach((el,i)=>{el.querySelector('h2').textContent=arts[i].title;el.querySelector('p').textContent=arts[i].desc||'';});}
  else document.getElementById('predArtSec').hidden=true;
}
// ---- router (each page says which view it is)
const VIEW=document.body.dataset.view, VID=document.body.dataset.id;
function show(v){
  ['Stand','Team','Player','Form','Fantasy','Preds'].forEach(n=>{const el=document.getElementById('v'+n);if(el)el.hidden=n.toLowerCase()!==v;});
  document.querySelectorAll('.nav a').forEach(a=>a.classList.toggle('on',a.dataset.v===v));
}
if(VIEW==='player'&&byCode[VID]){show('player');render(VID);}
else if(VIEW==='team'&&TEAMS[VID]){show('team');renderTeam(VID);}
else if(VIEW==='form'){show('form');renderForm();}
else if(VIEW==='fantasy'){show('fantasy');renderFantasy();}
else if(VIEW==='preds'){show('preds');renderPreds();}
else if(VIEW==='stand'){show('stand');renderStand();}
else{document.querySelectorAll('.nav a').forEach(el=>el.classList.toggle('on',el.dataset.v===VIEW));}
})();

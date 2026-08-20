/* app.js — UI 控制 */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const TYPES = ["選擇","複選","填空","計算","證明","設計"];

  // ── 目前科目狀態 ──
  let SUBJ, SUBJID, IMG, CUR, HIST, EXAMDIR, BOOKDIR, BOOKNAMES;
  let selectedUnits = new Set();
  let unitWeightVals = {}; // 依單元占比模式：uid → 使用者填的權重字串
  let timerId = null;

  function selectSubject(id){
    SUBJ = window.SUBJECTS[id]; SUBJID = id;
    IMG = SUBJ.images; CUR = id+"_current_exam"; HIST = id+"_exams_v1";
    EXAMDIR = SUBJ.examImgDir; BOOKDIR = SUBJ.bookImgDir; BOOKNAMES = SUBJ.bookNames;
    ENGINE.setSubject(id); SRS.setSubject(id);
    const tag=$("#subjectTag"); if(tag) tag.textContent = SUBJ.name;
    const sel=$("#subjectSel"); if(sel) sel.value = id;
    selectedUnits.clear();
    unitWeightVals = {};
    $("#countOverride").value = "";
    updateSourceLabels();
    if(timerId) clearInterval(timerId);
    renderUnits();
    applyExamModeUI();
    showScreen("start");
  }

  // 題目來源標籤隨科目更新（考古題數、課本名與課本題數）
  function updateSourceLabels(){
    const exam=ENGINE.BANK.filter(q=>ENGINE.srcOf(q)==="exam").length;
    const tb=ENGINE.BANK.filter(q=>ENGINE.srcOf(q)==="textbook").length;
    const books=[...new Set(ENGINE.BANK.filter(q=>q.book).map(q=>q.book))].map(b=>(BOOKNAMES&&BOOKNAMES[b])||b);
    const yrs=ENGINE.BANK.filter(q=>q.year>0).map(q=>q.year);
    const span=yrs.length?`${Math.min(...yrs)}–${Math.max(...yrs)}，`:"";
    const el1=$("#srcExamLabel"), el2=$("#srcTbLabel");
    if(el1) el1.textContent=`考古題（${span}${exam} 題，優先）`;
    if(el2) el2.textContent=`課本習題（${books.join("／")||"課本"}，${tb} 題）`;
  }

  function genMode(){ return (document.querySelector('input[name="genMode"]:checked')||{}).value || "random"; }
  function getOpts(){
    const sources=[];
    if($("#srcExam").checked) sources.push("exam");
    if($("#srcTb").checked) sources.push("textbook");
    const co=parseInt($("#countOverride").value,10);
    const mode=genMode();
    let unitRatios=null;
    if(mode==="ratio"){ unitRatios={}; selectedUnits.forEach(uid=>{ const v=parseFloat(unitWeightVals[uid]); unitRatios[uid]=(v>0?v:1); }); }
    return { sources: sources.length?sources:["exam"], countOverride: (co>0?co:0),
             excludeCorrect: $("#excludeCorrect").checked, mode, unitRatios };
  }
  // 依單元占比模式：為每個已選單元渲染權重輸入欄
  function renderUnitWeights(){
    const box=$("#unitWeights"); if(!box) return;
    const show = genMode()==="ratio" && selectedUnits.size>0;
    box.hidden=!show;
    if(!show){ box.innerHTML=""; return; }
    box.innerHTML="";
    ENGINE.UNITS.units.filter(u=>selectedUnits.has(u.id)).forEach(u=>{
      const row=document.createElement("div"); row.className="uw-row";
      const name=document.createElement("span"); name.className="uw-name"; name.textContent=u.name;
      const inp=document.createElement("input"); inp.type="number"; inp.min="0"; inp.step="1";
      inp.placeholder="1"; inp.className="uw-input"; inp.value=unitWeightVals[u.id]||"";
      inp.addEventListener("input",()=>{ unitWeightVals[u.id]=inp.value; updateScope(); });
      row.appendChild(name); row.appendChild(inp); box.appendChild(row);
    });
  }
  document.querySelectorAll('input[name="genMode"]').forEach(r=> r.addEventListener("change",()=>{
    $("#ratioHint").hidden = genMode()!=="ratio";
    renderUnitWeights(); updateScope();
  }));

  /* ---------- 考試模式：模擬出題 / 考古真卷 ＋ 不限時 ---------- */
  function examMode(){ return (document.querySelector('input[name="examMode"]:checked')||{}).value || "mock"; }
  // 目前科目的考古題依 學校→年份 分組（無 school 欄位者歸「台大」）
  function pastExamData(){
    const map={};
    ENGINE.BANK.filter(q=>ENGINE.srcOf(q)==="exam" && q.year>0).forEach(q=>{
      const sc=q.school||"台大"; (map[sc]=map[sc]||{}); (map[sc][q.year]=map[sc][q.year]||[]).push(q);
    });
    return map;
  }
  function renderPastControls(){
    const data=pastExamData();
    const schools=Object.keys(data); if(!schools.length) return;
    const scSel=$("#pastSchool"), yrSel=$("#pastYear");
    scSel.innerHTML=schools.map(s=>`<option value="${s}">${s}</option>`).join("");
    const sc=scSel.value||schools[0];
    const years=Object.keys(data[sc]||{}).map(Number).sort((a,b)=>b-a); // 新→舊
    yrSel.innerHTML=years.map(y=>`<option value="${y}">${y} 年（${data[sc][y].length} 題）</option>`).join("");
    updatePastPreview();
  }
  function updatePastPreview(){
    const data=pastExamData();
    const sc=$("#pastSchool").value, yr=parseInt($("#pastYear").value,10);
    const qs=(data[sc]&&data[sc][yr])||[];
    const prev=$("#genPreview"), btn=$("#startBtn");
    if(!qs.length){ prev.textContent="此年無題目。"; btn.disabled=true; return; }
    btn.disabled=false;
    const pts=qs.reduce((a,q)=>a+(q.points||0),0);
    const types=[...new Set(qs.map(q=>q.type))].join("・");
    const dur = $("#untimed").checked ? "不限時" : `限時 ${ENGINE.cfg.durationMinutes} 分`;
    prev.innerHTML=`<b>${sc} ${yr} 年</b> 完整真卷：<b>${qs.length}</b> 題・配分 ${pts}・${dur}。<br><span class="muted">題型：${types}。題目照原卷題號順序呈現。</span>`;
  }
  function applyExamModeUI(){
    const past=examMode()==="past";
    $("#mockPanel").hidden=past; $("#pastPanel").hidden=!past;
    if(past) renderPastControls(); else updateScope();
  }
  document.querySelectorAll('input[name="examMode"]').forEach(r=> r.addEventListener("change",applyExamModeUI));
  $("#pastSchool").addEventListener("change",renderPastControls);
  $("#pastYear").addEventListener("change",updatePastPreview);
  $("#untimed").addEventListener("change",()=>{ if(examMode()==="past") updatePastPreview(); });
  ["srcExam","srcTb","excludeCorrect","countOverride"].forEach(id=>{
    const el=document.getElementById(id);
    el.addEventListener("change",updateScope); el.addEventListener("input",updateScope);
  });

  // ── 考古題比重滑桿 ── 0–100 → 倍率 0.25×–4×（50＝均衡 1.0×，預設 37≈0.7×）
  function sliderToMult(v){ return 0.25 * Math.pow(16, v/100); }
  function examWeightLabel(m){
    if(m<0.5) return "課本為主"; if(m<0.8) return "偏課本";
    if(m<=1.25) return "均衡"; if(m<=2.5) return "偏考古"; return "考古為主";
  }
  function applyExamWeight(save){
    const v=parseInt($("#examWeight").value,10)||0;
    const m=sliderToMult(v);
    ENGINE.setExamWeight(m);
    const el=$("#examWeightVal"); if(el) el.textContent=`×${m.toFixed(2)}（${examWeightLabel(m)}）`;
    if(save) localStorage.setItem("pref_exam_weight", String(v));
  }
  $("#examWeight").addEventListener("input",()=>applyExamWeight(true));

  /* ---------- 畫面切換 ---------- */
  function showScreen(name){
    $$(".screen").forEach(s=>s.classList.remove("active"));
    $("#screen-"+name).classList.add("active");
    $$(".navbtn").forEach(b=>b.classList.toggle("active", b.dataset.screen===name));
    if(name==="pool") renderPool();
    if(name==="history") renderHistory();
    if(name==="heat") renderHeat();
    if(name==="trend") renderTrend();
  }
  $$(".navbtn").forEach(b=> b.addEventListener("click",()=>showScreen(b.dataset.screen)));

  /* ---------- 單元選擇 ---------- */
  function unitCounts(uid){
    const qs=ENGINE.BANK.filter(q=>q.units.includes(uid));
    const exam=qs.filter(q=>ENGINE.srcOf(q)==="exam").length;
    return { total:qs.length, exam };
  }
  // 目前科目各單元的考古命中最大值（熱度分級用；至少為 1 以免除以 0）
  function maxExamHits(){ return Math.max(1, ...ENGINE.UNITS.units.map(u=>unitCounts(u.id).exam)); }
  // 以「命中數 / 該科最大命中數」分級：高頻✦✦✦ ≥⅔、中頻✦✦ ≥⅓、低頻✦ ≥1、冷門 0
  function heatTier(exam, maxExam){
    if(exam<=0) return {fires:0, label:"冷門", cls:"cold"};
    const r=exam/maxExam;
    if(r>=0.66) return {fires:3, label:"高頻", cls:"hot3"};
    if(r>=0.33) return {fires:2, label:"中頻", cls:"hot2"};
    return {fires:1, label:"低頻", cls:"hot1"};
  }
  function renderUnits(){
    const wrap=$("#unitList"); wrap.innerHTML="";
    const mx=maxExamHits();
    ENGINE.UNITS.units.forEach(u=>{
      const div=document.createElement("div");
      div.className="unit-card"+(selectedUnits.has(u.id)?" sel":"");
      const c=unitCounts(u.id);
      const t=heatTier(c.exam,mx);
      const badge=`<span class="uheat ${t.cls}" title="歷屆考古命中 ${c.exam} 題">${t.fires?`<span class="stars">${"✦".repeat(t.fires)}</span> `:""}${t.label}</span>`;
      div.innerHTML=`<div class="uname">${u.name}${badge}</div>
        <div class="ubook">${u.textbook}</div>
        <div class="ucount">${c.total} 題（歷屆考古 ${c.exam}）・${u.keywords.length} 關鍵字</div>`;
      div.addEventListener("click",()=>{
        if(selectedUnits.has(u.id)) selectedUnits.delete(u.id); else selectedUnits.add(u.id);
        div.classList.toggle("sel"); updateScope();
      });
      wrap.appendChild(div);
    });
    updateScope();
  }
  function updateScope(){
    const n=selectedUnits.size;
    $("#scopeSummary").textContent = n? `已選 ${n} 單元` : "尚未選擇單元";
    renderUnitWeights();
    const prev=$("#genPreview"), btn=$("#startBtn");
    if(!n){ prev.textContent="請至少選一個單元。"; btn.disabled=true; return; }
    btn.disabled=false;
    const opts=getOpts();
    const p=ENGINE.plan([...selectedUnits], opts);
    if(p.poolSize===0){
      btn.disabled=true;
      prev.innerHTML=`<span style="color:var(--warn)">所選範圍在目前篩選下沒有題目可出（可能已全部答對，或來源都未勾選）。取消「排除已答對的題」或勾選題目來源即可。</span>`;
      return;
    }
    const co=opts.countOverride;
    const cntDesc = co? `自訂 <b>${p.targetN}</b> 題` : `固定 <b>${p.targetN}</b> 題（歷屆單年約 ${p.singleYear} 題 ×${p.overshoot}，<b>不隨範圍變動</b>）`;
    if(opts.mode==="ratio" && p.unitQuota){
      const parts=p.unitQuota.map(q=>`${ENGINE.unitById(q.unit)?.name||q.unit} <b>${q.n}</b>`).join("・");
      prev.innerHTML=`本卷${cntDesc}。<b>依單元占比</b>分配：${parts}。題庫可用 ${p.poolSize} 題（考古 ${p.examN}・課本 ${p.tbN}）。`
        +`<br><span class="muted">按你填的權重（留空＝1）分題；某單元題數不足時自動由其他單元補足。此模式不強制涵蓋全部關鍵字。</span>`;
      return;
    }
    const types=Object.entries(p.typeTargets).filter(([,v])=>v>0).map(([t,v])=>`${t}${v}`).join("・");
    prev.innerHTML=`本卷${cntDesc}。題型比例貼合歷屆（${types}）。題庫可用 ${p.poolSize} 題（考古 ${p.examN}・課本 ${p.tbN}）。`
      +`<br><span class="muted">所選範圍含 ${p.reqKw.length} 個關鍵字；`
      +(p.targetN>=p.reqKw.length
         ? `本卷題數足以涵蓋全部關鍵字（每個至少一題），其餘名額依錯題題海加權補題。`
         : `<span style="color:var(--warn)">範圍大於單卷容量（${p.targetN} 題 < ${p.reqKw.length} 關鍵字），本卷會優先涵蓋最多關鍵字，其餘留待下一卷——建議分批考或聚焦少數單元。</span>`)
      +`</span>`
      +(p.gapKw.length?`<br><span style="color:var(--warn)">⚠ ${p.gapKw.length} 個關鍵字題庫尚無題：${p.gapKw.join("、")}</span>`:"");
  }
  $("#selAll").addEventListener("click",()=>{ENGINE.UNITS.units.forEach(u=>selectedUnits.add(u.id));renderUnits();});
  $("#selNone").addEventListener("click",()=>{selectedUnits.clear();renderUnits();});

  /* ---------- 開始考試 ---------- */
  $("#startBtn").addEventListener("click",()=>{
    const untimed=$("#untimed").checked;
    let qlist, scope, coveredAll=null, missedKw=[], durationSec, mode=examMode();
    if(mode==="past"){
      const data=pastExamData();
      const sc=$("#pastSchool").value, yr=parseInt($("#pastYear").value,10);
      qlist=((data[sc]&&data[sc][yr])||[]).slice().sort((a,b)=>(a.qnum||0)-(b.qnum||0)||(a.part||0)-(b.part||0));
      if(!qlist.length){ alert("此年無題目。"); return; }
      scope=[`${sc} ${yr} 年 真卷`]; durationSec=ENGINE.cfg.durationMinutes*60;
    } else {
      if(!selectedUnits.size) return;
      const ex=ENGINE.generate([...selectedUnits], getOpts());
      if(!ex.questions.length){ alert("所選範圍沒有可出的題目 🎉\n（可能是「排除已答對的題」把剩下的都排除了，或來源都未勾選——取消勾選即可繼續複習）"); return; }
      qlist=ex.questions; scope=ex.scope; coveredAll=ex.coveredAll; missedKw=ex.missedKw; durationSec=ex.durationSec;
    }
    const exam={
      questions: qlist.map(q=>q.id),
      meta: qlist.map(q=>({id:q.id,year:q.year,type:q.type,points:q.points,title:q.title,
        stem:q.stem,keywords:q.keywords,source:q.source,book:q.book,page:q.page})),
      answers:{}, startTime:Date.now(), durationSec, untimed, mode,
      scope, coveredAll, missedKw
    };
    localStorage.setItem(CUR, JSON.stringify(exam));
    renderExam(); showScreen("exam");
  });

  function getExam(){ try{return JSON.parse(localStorage.getItem(CUR));}catch(e){return null;} }

  /* ---------- 考試頁 ---------- */
  function renderExam(){
    const ex=getExam(); if(!ex) return;
    $("#examScope").textContent="範圍："+ex.scope.join("、");
    const timeStr = ex.untimed ? "不限時（正計時）" : `限時 ${Math.round(ex.durationSec/60)} 分`;
    let cov;
    if(ex.mode==="past") cov="・完整真卷（原卷題序）";
    else cov = ex.coveredAll? "・已涵蓋所選範圍全部關鍵字" : `・本卷涵蓋部分關鍵字（範圍大於單卷容量，剩 ${(ex.missedKw||[]).length} 個待下一卷）`;
    $("#examMeta").textContent=`共 ${ex.questions.length} 題・${timeStr}${cov}`;
    const wrap=$("#examQuestions"); wrap.innerHTML="";
    ex.meta.forEach((q,i)=>{
      const card=document.createElement("div"); card.className="q-card";
      const imgs=(q.year>0 && IMG[q.year])? IMG[q.year] : null;
      let origHtml;
      if(imgs){
        origHtml=`<details class="orig"><summary>📄 展開原卷頁面（${q.year} 年完整試卷，第 ${q.source.match(/第(\d+)題/)?.[1]||"?"} 題在其中）</summary>`
          + imgs.map(f=>`<img loading="lazy" src="${EXAMDIR}/${f}" alt="${q.year} ${f}">`).join("") + `</details>`;
      } else if(q.book && q.page){
        const bookName=(BOOKNAMES&&BOOKNAMES[q.book])||q.book;
        origHtml=`<details class="orig"><summary>📖 展開課本原頁（${bookName} PDF 第 ${q.page} 頁；含圖與精確數學式）</summary>`
          +`<img loading="lazy" src="${BOOKDIR}/${q.book}_p${q.page}.png" alt="${bookName} p${q.page}"></details>`;
      } else {
        origHtml=`<div class="no-orig">（課本題，無頁面圖；題幹見上方）</div>`;
      }
      card.innerHTML=`
        <div class="q-head">
          <span class="q-num">第 ${i+1} 題</span>
          <span class="badge type">${q.type}</span>
          <span class="badge pts">${q.points||"?"} 分</span>
          <span class="badge src">${q.source}</span>
        </div>
        <div class="q-title">${q.title}</div>
        <div class="q-stem">${q.stem}</div>
        <div class="q-kw">${q.keywords.map(k=>`<span class="kw">${k}</span>`).join("")}</div>
        ${origHtml}
        <textarea class="ans" data-qid="${q.id}" placeholder="在此作答（選擇/複選請寫選項，如 A,C；證明/設計請寫完整論述）">${ex.answers[q.id]||""}</textarea>`;
      wrap.appendChild(card);
    });
    wrap.querySelectorAll("textarea.ans").forEach(ta=>{
      ta.addEventListener("input",()=>{
        const ex=getExam(); ex.answers[ta.dataset.qid]=ta.value;
        localStorage.setItem(CUR,JSON.stringify(ex));
      });
    });
    startTimer();
  }

  function startTimer(){
    if(timerId) clearInterval(timerId);
    const tick=()=>{
      const ex=getExam(); if(!ex){clearInterval(timerId);return;}
      const elapsed=(Date.now()-ex.startTime)/1000;
      const t=$("#timer");
      if(ex.untimed){ // 不限時：正計時、不自動交卷
        const e=Math.floor(elapsed), m=Math.floor(e/60), s=e%60;
        t.textContent=`⏱ ${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
        t.className="timer up"; return;
      }
      let rem=Math.max(0, Math.round(ex.durationSec-elapsed));
      const m=Math.floor(rem/60), s=rem%60;
      t.textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
      t.className="timer"+(rem<=60?" danger":rem<=300?" warn":"");
      if(rem<=0){ clearInterval(timerId); alert("時間到！自動送出作答。"); submitExam(); }
    };
    tick(); timerId=setInterval(tick,1000);
  }

  $("#abortBtn").addEventListener("click",()=>{
    if(confirm("確定放棄此卷？作答不會被記錄。")){ localStorage.removeItem(CUR); if(timerId)clearInterval(timerId); showScreen("start"); }
  });

  /* ---------- 送出 → 打包 Markdown ---------- */
  $("#submitBtn").addEventListener("click",submitExam);
  function submitExam(){
    if(timerId) clearInterval(timerId);
    const ex=getExam(); if(!ex) return;
    ex.submittedAt=Date.now();
    localStorage.setItem(CUR,JSON.stringify(ex));
    $("#mdOut").value=buildMarkdown(ex);
    showScreen("submit");
  }
  function fmtDur(sec){ const m=Math.floor(sec/60), s=Math.round(sec%60); return `${m} 分 ${s} 秒`; }
  function buildMarkdown(ex){
    const used=(ex.submittedAt-ex.startTime)/1000;
    let md=`# 台大資工所 模擬考作答卷 — 資料結構與演算法\n\n`;
    md+=`- 日期：${new Date(ex.startTime).toLocaleString("zh-TW")}\n`;
    md+=`- 考試範圍（單元）：${ex.scope.join("、")}\n`;
    md+=`- 題數：${ex.questions.length}　${ex.untimed?"不限時":"限時 "+Math.round(ex.durationSec/60)+" 分"}　實際用時：${fmtDur(used)}\n`;
    md+=`- 配分總計：${ex.meta.reduce((a,q)=>a+(q.points||0),0)} 分\n\n`;
    md+=`> 請依每題的「配分、題型、關鍵字、原卷頁面圖路徑」批改我的作答。對於選擇/複選請判定選項對錯；證明/設計/計算請評估正確性與完整度。批改後請逐題給「✓對／○部分或未答／✗錯」，並簡述錯在哪、應如何訂正。\n\n---\n`;
    ex.meta.forEach((q,i)=>{
      const imgs=(q.year>0&&IMG[q.year])?IMG[q.year].map(f=>`${EXAMDIR}/${f}`).join("、")
        :(q.book&&q.page?`${BOOKDIR}/${q.book}_p${q.page}.png（課本原頁）`:"（課本題，無頁面圖）");
      md+=`\n## 第 ${i+1} 題　(${q.points||"?"} 分・${q.type})\n`;
      md+=`- 來源：${q.source}\n- 關鍵字：${q.keywords.join("、")}\n- 原卷頁面圖：${imgs}\n`;
      md+=`- 題幹摘要：${q.title}。${q.stem}\n\n`;
      md+=`**我的作答：**\n\n${(ex.answers[q.id]||"（未作答）")}\n\n---\n`;
    });
    return md;
  }
  $("#copyMd").addEventListener("click",()=>{ $("#mdOut").select(); navigator.clipboard.writeText($("#mdOut").value).then(()=>toast("已複製到剪貼簿")); });
  $("#downloadMd").addEventListener("click",()=>{
    const ex=getExam(); download(`mock_ds_${ts()}.md`, $("#mdOut").value, "text/markdown");
  });
  $("#toGrade").addEventListener("click",()=>{ renderGrade(); showScreen("grade"); });

  /* ---------- 批改頁 ---------- */
  let gradeResults={};
  function renderGrade(){
    const ex=getExam(); if(!ex) return;
    gradeResults={};
    const wrap=$("#gradeList"); wrap.innerHTML="";
    $("#reportOut").innerHTML="";
    ex.meta.forEach((q,i)=>{
      const row=document.createElement("div"); row.className="grade-row";
      row.innerHTML=`<div class="gq">第 ${i+1} 題　${q.title}<br><small>${q.type}・${q.points||"?"}分・${q.source}</small></div>
        <button class="gbtn ok" data-r="correct" title="對">✓</button>
        <button class="gbtn no" data-r="none" title="無/未答">○</button>
        <button class="gbtn bad" data-r="wrong" title="錯">✗</button>`;
      row.querySelectorAll(".gbtn").forEach(b=>b.addEventListener("click",()=>{
        gradeResults[q.id]=b.dataset.r;
        row.querySelectorAll(".gbtn").forEach(x=>x.classList.remove("sel"));
        b.classList.add("sel");
      }));
      wrap.appendChild(row);
    });
  }
  $("#finishGrade").addEventListener("click",()=>{
    const ex=getExam(); if(!ex) return;
    const ungraded=ex.meta.filter(q=>!gradeResults[q.id]);
    if(ungraded.length && !confirm(`還有 ${ungraded.length} 題未評定，未評定者將視為「無」。仍要產生報告？`)) return;

    // 更新 SRS + 計分
    let got=0, total=0; const before={};
    const perQ=ex.meta.map((q,i)=>{
      const r=gradeResults[q.id]||"none";
      before[q.id]=SRS.get(q.id);
      const st=SRS.applyResult(q.id,r);
      total+=q.points||0; if(r==="correct") got+=q.points||0;
      return {n:i+1,id:q.id,title:q.title,type:q.type,points:q.points||0,units:q.unitsOf||[],result:r,
              wasMark:before[q.id].mark,nowMark:st.mark,streak:st.streak};
    });
    const report=buildReport(ex,perQ,got,total);
    const rec={date:ex.startTime, scope:ex.scope, got, total,
      pct: total? Math.round(got/total*100):0, n:ex.questions.length,
      perQ:perQ.map(p=>({id:p.id,result:p.result})), reportMd:report};
    const hist=JSON.parse(localStorage.getItem(HIST)||"[]"); hist.unshift(rec);
    localStorage.setItem(HIST,JSON.stringify(hist));
    localStorage.removeItem(CUR);
    renderReport(report);
  });

  function buildReport(ex,perQ,got,total){
    const newMarks=perQ.filter(p=>!p.wasMark&&p.nowMark);
    const cleared=perQ.filter(p=>p.wasMark&&!p.nowMark);
    const stillMark=perQ.filter(p=>p.nowMark);
    // 單元正確率
    const byUnit={};
    ex.meta.forEach((q,i)=>{
      const qq=ENGINE.BANK.find(b=>b.id===q.id);
      (qq?.units||[]).forEach(u=>{
        byUnit[u]=byUnit[u]||{c:0,t:0};
        byUnit[u].t++; if(perQ[i].result==="correct") byUnit[u].c++;
      });
    });
    let md=`# 模擬考結果報告（給 AI 分析用）— 資料結構與演算法\n\n`;
    md+=`- 日期：${new Date(ex.startTime).toLocaleString("zh-TW")}\n- 範圍：${ex.scope.join("、")}\n`;
    md+=`- 最終成績：**${got} / ${total} 分（${total?Math.round(got/total*100):0}%）**\n`;
    md+=`- 題數：${ex.questions.length}（✓${perQ.filter(p=>p.result==="correct").length}　✗${perQ.filter(p=>p.result==="wrong").length}　○${perQ.filter(p=>p.result==="none").length}）\n\n`;
    md+=`## 逐題結果\n| # | 題型 | 配分 | 結果 | 題目 |\n|--|--|--|--|--|\n`;
    perQ.forEach(p=>{ const r=p.result==="correct"?"✓對":p.result==="wrong"?"✗錯":"○無";
      md+=`| ${p.n} | ${p.type} | ${p.points} | ${r} | ${p.title} |\n`; });
    md+=`\n## 各單元正確率\n`;
    Object.entries(byUnit).forEach(([u,v])=>{ const name=ENGINE.unitById(u)?.name||u;
      md+=`- ${name}：${v.c}/${v.t}（${Math.round(v.c/v.t*100)}%）\n`; });
    md+=`\n## 錯題題海變化\n`;
    md+=`- 本次新增錯題標記：${newMarks.length?newMarks.map(p=>"第"+p.n+"題").join("、"):"無"}\n`;
    md+=`- 本次消除標記（連兩次答對）：${cleared.length?cleared.map(p=>"第"+p.n+"題").join("、"):"無"}\n`;
    md+=`- 目前仍標記中（本卷內）：${stillMark.length?stillMark.map(p=>"第"+p.n+"題").join("、"):"無"}\n`;
    md+=`\n## 建議給 AI 的分析方向\n請依各單元正確率與錯題型態，指出我的弱點單元、易錯題型（如證明/設計 vs 選擇），並建議下一輪該加強的單元與對應聖經章節。\n`;
    return md;
  }
  function renderReport(md){
    const got=md.match(/\*\*(\d+) \/ (\d+) 分（(\d+)%）\*\*/);
    $("#reportOut").innerHTML=`<div class="report"><div class="scoreline">成績：${got?got[1]+" / "+got[2]+" 分（"+got[3]+"%）":""}</div>`
      +`<div class="btnrow"><button class="primary" id="copyReport">複製報告</button>`
      +`<button class="ghost" id="dlReport">下載報告 .md</button>`
      +`<button class="ghost" id="backStart">回出題</button></div>`
      +`<pre style="white-space:pre-wrap;margin-top:.6rem">${md.replace(/</g,"&lt;")}</pre></div>`;
    $("#copyReport").addEventListener("click",()=>navigator.clipboard.writeText(md).then(()=>toast("已複製報告")));
    $("#dlReport").addEventListener("click",()=>download(`report_ds_${ts()}.md`,md,"text/markdown"));
    $("#backStart").addEventListener("click",()=>showScreen("start"));
  }

  /* ---------- 題海狀態 ---------- */
  function renderPool(){
    const st=SRS.stats(ENGINE.BANK);
    $("#poolStats").innerHTML=`
      <div class="stat"><div class="n">${st.total}</div><div class="l">題庫總題數</div></div>
      <div class="stat"><div class="n" style="color:var(--bad)">${st.marked}</div><div class="l">錯題標記中</div></div>
      <div class="stat"><div class="n" style="color:var(--good)">${st.mastered}</div><div class="l">已答對（降機率）</div></div>
      <div class="stat"><div class="n" style="color:var(--muted)">${st.fresh}</div><div class="l">尚未出現</div></div>`;
    const list=$("#poolList"); list.innerHTML="";
    ENGINE.BANK.slice().sort((a,b)=>SRS.weight(b.id)-SRS.weight(a.id)).forEach(q=>{
      const s=SRS.get(q.id);
      const cls=s.mark?"mark":(s.seen===0?"new":(s.last==="correct"?"ok":"new"));
      const tag=s.mark?`<span class="tag-mark">錯題標記（連對 ${s.streak}/2）</span>`
        :(s.seen===0?`<span class="tag-new">未出現</span>`
        :(s.last==="correct"?`<span class="tag-clear">已答對</span>`:`<span class="tag-new">出現 ${s.seen} 次</span>`));
      const div=document.createElement("div"); div.className="pool-q";
      div.innerHTML=`<span class="dot ${cls}"></span><span style="flex:1">${q.title} <small style="color:var(--muted)">(${q.type}・${q.source})</small></span>`
        +`<span style="font-size:.8rem">${tag}　權重 ${SRS.weight(q.id).toFixed(2)}</span>`;
      list.appendChild(div);
    });
  }

  /* ---------- 歷次成績 ---------- */
  function renderHistory(){
    const hist=JSON.parse(localStorage.getItem(HIST)||"[]");
    const wrap=$("#historyList");
    if(!hist.length){ wrap.innerHTML=`<p class="hint">尚無紀錄。完成一次考試＋批改後會出現在這裡。</p>`; return; }
    wrap.innerHTML="";
    hist.forEach((r,idx)=>{
      const c=document.createElement("div"); c.className="hist-card";
      c.innerHTML=`<div><span class="hs">${r.got}/${r.total} 分（${r.pct}%）</span>
        <span class="muted">${new Date(r.date).toLocaleString("zh-TW")}・${r.n}題</span></div>
        <div class="muted">範圍：${r.scope.join("、")}</div>
        <div class="btnrow"><button class="ghost" data-i="${idx}">查看報告</button></div>`;
      c.querySelector("button").addEventListener("click",()=>{
        const d=document.createElement("div"); d.className="report";
        d.innerHTML=`<pre style="white-space:pre-wrap">${r.reportMd.replace(/</g,"&lt;")}</pre>`;
        c.appendChild(d);
      });
      wrap.appendChild(c);
    });
  }

  /* ---------- 考古熱區 ---------- */
  let heatWindow=0; // 0＝全部；n＝近 n 年
  function renderHeat(){
    const examQs=ENGINE.BANK.filter(q=>ENGINE.srcOf(q)==="exam" && q.year>0);
    const maxY=examQs.length?Math.max(...examQs.map(q=>q.year)):0;
    const minY=examQs.length?Math.min(...examQs.map(q=>q.year)):0;
    const sinceY = heatWindow>0 ? Math.max(minY, maxY-heatWindow+1) : minY;
    const winQs=examQs.filter(q=>q.year>=sinceY);
    // 各單元在此年份範圍內的考古命中次數
    const rows=ENGINE.UNITS.units.map(u=>{
      const exam=winQs.filter(q=>q.units.includes(u.id)).length;
      return {u, exam, total:unitCounts(u.id).total};
    }).sort((a,b)=> b.exam-a.exam || b.total-a.total);
    const mx=Math.max(1, ...rows.map(r=>r.exam));
    const hits=rows.reduce((a,r)=>a+r.exam,0);
    const hot=rows.filter(r=>heatTier(r.exam,mx).fires===3).map(r=>r.u.name);
    const cold=rows.filter(r=>r.exam===0).map(r=>r.u.name);
    const span = heatWindow>0 ? `近 ${heatWindow} 年 ${sinceY}–${maxY}` : `全歷屆 ${minY}–${maxY}`;
    const note=$("#heatNote");
    note.innerHTML=`統計範圍：<b>${span}</b>，考古 <b>${winQs.length}</b> 題、共 <b>${hits}</b> 次單元命中。`
      + (hot.length? `<br><span class="stars hot3">✦✦✦</span> <b>此範圍高頻</b>：${hot.join("、")}` : "")
      + (cold.length? `<br><span style="color:var(--muted)">此範圍 0 命中（可略過或最後補）：${cold.join("、")}</span>` : "");
    const wrap=$("#heatList"); wrap.innerHTML="";
    rows.forEach(r=>{
      const t=heatTier(r.exam,mx);
      const pct=Math.round(r.exam/mx*100);
      const div=document.createElement("div"); div.className="heat-row "+t.cls;
      div.innerHTML=`<div class="heat-name">${r.u.name}</div>`
        +`<div class="heat-bar-wrap"><div class="heat-bar" style="width:${Math.max(pct,r.exam>0?4:0)}%"></div></div>`
        +`<div class="heat-val"><b>${r.exam}</b> 命中 <span class="heat-fire">${"✦".repeat(t.fires)||"·"}</span></div>`;
      wrap.appendChild(div);
    });
  }
  // 「統計範圍」篩選鈕（近 n 年）
  $$(".hfbtn").forEach(b=> b.addEventListener("click",()=>{
    heatWindow=parseInt(b.dataset.n,10)||0;
    $$(".hfbtn").forEach(x=>x.classList.toggle("active", x===b));
    renderHeat();
  }));

  /* ---------- 趨勢預測 ---------- */
  const TREND_YEARS=[102,103,104,105,106,107,108,109,110,111,112,113,114];
  const DS_STRUCT=new Set(["lineardata","tree","heap","hash","unionfind"]); // 其餘 ds 單元＝演算法
  function domOf(sid,units){
    const d=new Set();
    (units||[]).forEach(u=>{
      if(sid==="math") d.add(u.startsWith("la-")?"線性代數":"離散數學");
      else if(sid==="caos") d.add(u.startsWith("ca-")?"計算機結構":"作業系統");
      else if(sid==="ds") d.add(DS_STRUCT.has(u)?"資料結構":"演算法");
    });
    return d;
  }
  function typeBucket(t){ return t==="計算"?"計算型" : (t==="證明"||t==="設計")?"論述型" : "選填型"; }
  function seriesByUnit(ex, uid){ const m={}; ex.forEach(q=>{ if((q.units||[]).includes(uid)) m[q.year]=(m[q.year]||0)+1; }); return m; }
  function trendTableHtml(domains, domMap){
    const V=m=>TREND_YEARS.map(y=>m[y]||0);
    let t=`<table class="trend-tbl"><thead><tr><th>領域</th>`+TREND_YEARS.map(y=>`<th>${y}</th>`).join("")+`<th>Σ</th></tr></thead><tbody>`;
    domains.forEach(d=>{ const vals=V(domMap[d]||{}), tot=vals.reduce((a,b)=>a+b,0);
      t+=`<tr><td>${d}</td>`+vals.map(v=>`<td>${v||""}</td>`).join("")+`<td><b>${tot}</b></td></tr>`; });
    return t+`</tbody></table>`;
  }
  // 各科的趨勢文案（圖表由即時資料算，文字為分析結論）
  const TREND_ED={
    ds:{
      name:"資料結構與演算法", domains:["資料結構","演算法"],
      domainNote:"⚠ 演算法 114 年 18 題，是該年<b>改制成「多小題」</b>（選擇/複選為主），題量暴增≠難度暴增。",
      special:{kind:"line", unit:"aibio", color:"#009e73", title:"ML／生資應用題逐年",
        note:"114 年一次冒出 GNN／WL 頂點排序、c-means 分群、蛋白質序列比對 DP——演算法開始「包 ML 情境」。"},
      typeNarrative:"<b>題型劇烈「機讀化」。</b>早期（102–108）證明／設計／填空各約兩成、題型多元；近年（111–114）<b>選擇 50%＋複選 28%＝78%</b>，計算／證明／設計全萎縮到 10% 以下（107、110、111 甚至整卷選擇）。<b>意義</b>：考點變廣、每題變淺變快，吃「秒判性質／複雜度的廣度」，不再是少數大題深推——備考重心放<b>廣度覆蓋與判斷速度</b>。",
      cards:[
        {cls:"hot", h:"題型 · 機讀化 ↑↑", b:"續走選擇／複選。練『看到就知道用哪個結構、複雜度多少』；證明/設計大題比重下降但仍偶見。"},
        {cls:"hot", h:"DP · 樹 長期雙冠", b:"DP（13）、樹 BST/AVL/RB/B+（10）永遠是重點，必須滾瓜爛熟、能秒答性質題。"},
        {cls:"warm", h:"內容 · ML／生資皮 ↑", b:"114 起題目『包情境』：GNN、分群、序列比對 DP；核心仍是 DP／圖／貪婪，只是換外皮。"},
        {cls:"warm", h:"近似演算法 · 新熱點", b:"CLRS 35：FPTAS、set-cover greedy、LP rounding、integrality gap 開始入題（114），值得補。"},
      ],
      reading:[
        {h:"演算法", pri:"該補", cls:"p2", items:[
          "<b>CLRS 第 35 章（近似）</b>讀熟——考古已到此深度；加保險看 <b>Williamson &amp; Shmoys《The Design of Approximation Algorithms》</b>（免費 PDF）前幾章。",
          "ML／生資：<b>Compeau &amp; Pevzner《Bioinformatics Algorithms》</b>序列比對／分群章；GNN 只需懂<b>訊息傳遞 + Weisfeiler-Lehman</b>概念。",
          "<b>LeetCode</b> 練 DP 與資料結構手感，正好對應機讀化要的廣度與速度（medium 為主）。",
        ]},
        {h:"資料結構", pri:"聖經即可", cls:"p4", items:[
          "CLRS + Pai 已足夠、無科技缺口；行有餘力寫個平衡樹／雜湊 from-scratch 加深理解，但非必要。",
        ]},
      ],
    },
    math:{
      name:"數學（線性代數＋離散數學）", domains:["線性代數","離散數學"], domainNote:"", special:null,
      typeNarrative:"<b>穩定計算導向。</b>計算題長年約 <b>70%</b> 恆定；<b>證明近年幾乎消失</b>（110 後歸零）；複選（敘述真偽）是次要但常見的題型；111 那年整卷改單選為特例。<b>意義</b>：練<b>計算速度與正確率</b>；證明準備成本低，重點放在「<b>懂定理、能判真偽</b>」而非寫完整證明。",
      cards:[
        {cls:"warm", h:"線代 · 內積／特徵值恆主", b:"內積空間（SVD／最小平方／pseudoinverse，8 命中）＋對角化／特徵值（7）為主，偏數值應用面。"},
        {cls:"warm", h:"離散 · 進階計數＋圖論", b:"進階計數（遞迴式／生成函數，9）＋計數（7）＋圖論（6）為主力，穩定不隨科技波動。"},
        {cls:"cool", h:"題型 · 計算為王", b:"計算約 70% 恆定，證明比例低且下降；複選考觀念真偽，要懂定理不能死背。"},
      ],
      reading:[
        {h:"線代／離散", pri:"輕補", cls:"p3", items:[
          "<b>Strang《Introduction to Linear Algebra》</b>——SVD／最小平方／四大基本子空間的直覺，補 Friedberg 太理論的弱點（你已在用）。",
          "想連到 ML：<b>《Mathematics for Machine Learning》</b>（Deisenroth，免費 PDF）Part I。",
          "離散練<b>生成函數解遞迴</b>的熟練度即可；Friedberg／Rosen／周志成已覆蓋，<b>無科技牽引缺口</b>。",
        ]},
      ],
    },
    caos:{
      name:"計算機結構與作業系統", domains:["計算機結構","作業系統"], domainNote:"",
      special:{kind:"bars", units:[["ca-dlp","資料平行/GPU","#0072b2"],["ca-dsa","AI 加速器","#d55e00"]], title:"AI 硬體相關題逐年（架構）",
        note:"GPU／資料平行 ＋ 領域專用加速器（AI）逐年疊高——近 3 年躍上高頻；<b>SSD／Flash／NVMe 考古 0 命中</b>，真正的硬體瓶頸題是「算力與記憶體頻寬」不是儲存。"},
      typeNarrative:"<b>計算＋設計申論雙主軸。</b>計算題約 <b>65%</b>；且<b>每年幾乎必有一題大『設計申論』</b>（105–109、113、114 都有）——近年這題正是 <b>AI 加速器主題</b>（113#1、114#1 的 LLM／H100／FP8／MLPerf／roofline）。近年複選也增加。<b>意義</b>：計算題要熟，外加一定要準備<b>大設計申論</b>（近年鎖定 AI 硬體）。",
      cards:[
        {cls:"hot", h:"AI 硬體 ↑↑（最強且加速）", b:"GPU／資料平行、<b>領域專用加速器（TPU/systolic/NPU）</b>、roofline、<b>量化 FP8/INT8</b>、HBM 頻寬、MLPerf。113/114 連兩年 LLM 加速器申論。"},
        {cls:"hot", h:"設計申論題 · 每年必備", b:"幾乎每年一大題設計＋分析；近年鎖定 AI 加速器，要能『設計 + 用 roofline／量化分析』申論。"},
        {cls:"cool", h:"計算本柱 · 必熟", b:"cache／CPI／pipeline／paging／排程 計算約占 65%，是保底分數，務必快而準。"},
        {cls:"cool", h:"OS · 穩定", b:"排程／同步／記憶體分頁三本柱；偶爾虛擬化、分散式／共識。無明顯科技牽引。"},
      ],
      reading:[
        {h:"計算機結構", pri:"最該補", cls:"p1", items:[
          "<b>H&amp;P 6e 第 7 章「Domain-Specific Architectures」</b>——聖經本自己就有、含 <b>TPU 案例</b>，113/114 加速器題直接對應，<b>務必精讀</b>。",
          "<b>Sze et al.《Efficient Processing of Deep Neural Networks》</b>——DNN 加速器權威（dataflow／systolic／量化）。",
          "<b>Roofline 論文</b>（Williams 2009）＋ <b>TPU 論文</b>（Jouppi, ISCA'17）；懂 FP8/INT8、HBM 頻寬、MLPerf 概念即可。",
        ]},
        {h:"作業系統", pri:"聖經即可", cls:"p4", items:[
          "Silberschatz 已足夠；想動手打底可挑 <b>xv6</b> 幾個 lab（page table／scheduler／locks）。行有餘力補<b>分散式共識（Raft/Paxos 概念）</b>。",
        ]},
      ],
    },
  };
  // 自製 SVG 折線圖：細線、節點附 <title> tooltip、退讓網格、單一 y 軸
  function svgLine({title, series, yMax, w=480, h=210, directLabel=false}){
    const yrs=TREND_YEARS, mL=28, mR=directLabel?60:16, mT=title?20:8, mB=20;
    const pw=w-mL-mR, ph=h-mT-mB;
    const X=i=> mL + (yrs.length>1? pw*i/(yrs.length-1) : pw/2);
    const Y=v=> mT + ph - ph*(v/yMax);
    let g="";
    const step= yMax<=4?1 : yMax<=10?2 : Math.ceil(yMax/5);
    for(let v=0; v<=yMax; v+=step){
      g+=`<line x1="${mL}" y1="${Y(v).toFixed(1)}" x2="${w-mR}" y2="${Y(v).toFixed(1)}" class="cx-grid"/>`;
      g+=`<text x="${mL-4}" y="${(Y(v)+3).toFixed(1)}" class="cx-ylab" text-anchor="end">${v}</text>`;
    }
    yrs.forEach((yr,i)=>{ if(i%2===0||i===yrs.length-1) g+=`<text x="${X(i).toFixed(1)}" y="${h-5}" class="cx-xlab" text-anchor="middle">${yr}</text>`; });
    series.forEach(s=>{
      const pts=yrs.map((yr,i)=>[X(i),Y(s.vals[i])]);
      const d=pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(1)+" "+p[1].toFixed(1)).join(" ");
      g+=`<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach((p,i)=> g+=`<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="${s.color}" class="cx-dot"><title>${s.name}·${yrs[i]}年：${s.vals[i]} 題</title></circle>`);
      if(directLabel){ const l=pts[pts.length-1]; g+=`<text x="${w-mR+4}" y="${(l[1]+3).toFixed(1)}" class="cx-dlab" fill="${s.color}">${s.name}</text>`; }
    });
    const ttl= title? `<text x="${mL-4}" y="12" class="cx-title">${title}</text>` : "";
    return `<svg viewBox="0 0 ${w} ${h}" class="cx-svg" role="img" aria-label="${title||'折線圖'}">${ttl}${g}</svg>`;
  }
  // 堆疊長條圖：稀疏計數用長條比折線清楚（段間留 2px 表面間隙、方角）
  function svgBars({series, yMax, w=560, h=240}){
    const yrs=TREND_YEARS, mL=28, mR=16, mT=8, mB=20;
    const pw=w-mL-mR, ph=h-mT-mB, band=pw/yrs.length, bw=Math.min(24, band*0.62);
    const Y=v=> mT+ph - ph*(v/yMax);
    let g="";
    const step= yMax<=5?1 : Math.ceil(yMax/5);
    for(let v=0; v<=yMax; v+=step){
      g+=`<line x1="${mL}" y1="${Y(v).toFixed(1)}" x2="${w-mR}" y2="${Y(v).toFixed(1)}" class="cx-grid"/>`;
      g+=`<text x="${mL-4}" y="${(Y(v)+3).toFixed(1)}" class="cx-ylab" text-anchor="end">${v}</text>`;
    }
    yrs.forEach((yr,i)=>{
      const cx=mL+band*i+band/2; let acc=0;
      series.forEach(s=>{ const v=s.vals[i]; if(v>0){ const y0=Y(acc), y1=Y(acc+v), hh=Math.max(y0-y1-2,1.5);
        g+=`<rect x="${(cx-bw/2).toFixed(1)}" y="${y1.toFixed(1)}" width="${bw.toFixed(1)}" height="${hh.toFixed(1)}" fill="${s.color}" class="cx-bar"><title>${s.name}·${yr}年：${v} 題</title></rect>`; acc+=v; } });
      g+=`<text x="${cx.toFixed(1)}" y="${h-5}" class="cx-xlab" text-anchor="middle">${yr}</text>`;
    });
    return `<svg viewBox="0 0 ${w} ${h}" class="cx-svg" role="img" aria-label="AI 相關題逐年堆疊">${g}</svg>`;
  }
  function legendRow(series){
    return `<div class="cx-legend">`+series.map(s=>`<span class="cx-leg"><span class="cx-sw" style="background:${s.color}"></span>${s.name}</span>`).join("")+`</div>`;
  }
  function renderTrend(){
    const sid=SUBJID, ed=TREND_ED[sid]; if(!ed) return;
    $("#trendSubjName").textContent=ed.name;
    const ex=ENGINE.BANK.filter(q=>ENGINE.srcOf(q)==="exam" && q.year>0);
    const V=m=>TREND_YEARS.map(y=>m[y]||0);
    // 領域逐年出題量
    const domMap={}; ed.domains.forEach(d=>domMap[d]={});
    ex.forEach(q=> domOf(sid,q.units).forEach(d=>{ if(domMap[d]) domMap[d][q.year]=(domMap[d][q.year]||0)+1; }));
    const domSeries=ed.domains.map((d,i)=>({name:d, color:i===0?"#0072b2":"#d55e00", vals:V(domMap[d])}));
    const domMax=Math.max(3, ...domSeries.flatMap(s=>s.vals));
    // 題型組成（3 桶）
    const tb={"選填型":{},"計算型":{},"論述型":{}};
    ex.forEach(q=>{ const b=typeBucket(q.type); tb[b][q.year]=(tb[b][q.year]||0)+1; });
    const typeSeries=[
      {name:"選填型（選擇/複選/填空）", color:"#0072b2", vals:V(tb["選填型"])},
      {name:"計算型", color:"#d55e00", vals:V(tb["計算型"])},
      {name:"論述型（證明/設計）", color:"#009e73", vals:V(tb["論述型"])},
    ];
    const typeMax=Math.max(3, ...TREND_YEARS.map((y,i)=>typeSeries.reduce((a,s)=>a+s.vals[i],0)));

    const CIRC=["①","②","③","④","⑤","⑥"]; let sec=0;
    const H=t=>`<h3 class="trend-h">${CIRC[sec++]} ${t}</h3>`;
    const P=t=>t?`<p class="trend-p">${t}</p>`:"";
    let html="";

    html+=H("逐年出題量（兩領域）")+P(ed.domainNote);
    html+=`<div class="chart-box">${legendRow(domSeries)}${svgLine({series:domSeries, yMax:domMax, w:560, h:230})}</div>`;

    if(ed.special && ed.special.kind==="line"){
      const s={name:ed.special.title, color:ed.special.color, vals:V(seriesByUnit(ex, ed.special.unit))};
      html+=H(ed.special.title)+P(ed.special.note);
      html+=`<div class="chart-box">${svgLine({series:[s], yMax:Math.max(3,...s.vals), w:560, h:200})}</div>`;
    } else if(ed.special && ed.special.kind==="bars"){
      const bs=ed.special.units.map(([u,nm,c])=>({name:nm, color:c, vals:V(seriesByUnit(ex,u))}));
      const bmax=Math.max(3, ...TREND_YEARS.map((y,i)=>bs.reduce((a,s)=>a+s.vals[i],0)));
      html+=H(ed.special.title)+P(ed.special.note);
      html+=`<div class="chart-box">${legendRow(bs)}${svgBars({series:bs, yMax:bmax, w:560, h:220})}</div>`;
    }

    html+=H("題型組成逐年（機讀 vs 計算 vs 論述）")+P(ed.typeNarrative);
    html+=`<div class="chart-box">${legendRow(typeSeries)}${svgBars({series:typeSeries, yMax:typeMax, w:560, h:230})}</div>`;

    html+=H("方向預測");
    html+=`<div class="trend-cards">`+ed.cards.map(c=>`<div class="tcard ${c.cls}"><div class="tc-h">${c.h}</div>${c.b}</div>`).join("")+`</div>`;

    html+=H("聖經之外該補的閱讀");
    html+=`<div class="read-list">`+ed.reading.map(r=>`<div class="rcard ${r.cls}"><div class="rc-h">${r.h} <span class="pri">${r.pri}</span></div><ul>`+r.items.map(it=>`<li>${it}</li>`).join("")+`</ul></div>`).join("")+`</div>`;

    html+=`<details class="trend-table-wrap"><summary>原始數據表（年 × 領域）</summary>${trendTableHtml(ed.domains, domMap)}</details>`;
    $("#trendBody").innerHTML=html;
  }

  /* ---------- 匯出/匯入進度 ---------- */
  $("#exportBtn").addEventListener("click",()=>{
    const blob={srs:SRS.exportState(), history:JSON.parse(localStorage.getItem(HIST)||"[]")};
    download(`progress_ds_${ts()}.json`, JSON.stringify(blob,null,1), "application/json");
  });
  $("#importFile").addEventListener("change",e=>{
    const f=e.target.files[0]; if(!f) return;
    const rd=new FileReader();
    rd.onload=()=>{ try{ const o=JSON.parse(rd.result);
      if(o.srs) SRS.importState(o.srs);
      if(o.history) localStorage.setItem(HIST,JSON.stringify(o.history));
      toast("已匯入進度"); renderPool();
    }catch(err){ alert("匯入失敗："+err); } };
    rd.readAsText(f);
  });

  /* ---------- 小工具 ---------- */
  function ts(){ return new Date().toISOString().replace(/[:.]/g,"-").slice(0,19); }
  function download(name,content,type){
    const a=document.createElement("a");
    a.href=URL.createObjectURL(new Blob([content],{type}));
    a.download=name; a.click(); URL.revokeObjectURL(a.href);
  }
  let toastT=null;
  function toast(msg){
    let t=$("#toast"); if(!t){ t=document.createElement("div"); t.id="toast";
      t.style.cssText="position:fixed;bottom:1.5rem;left:50%;padding:.55rem 1.1rem;z-index:99;opacity:0;"
        +"transform:translateX(-50%) translateY(6px);transition:opacity .25s ease,transform .25s ease";
      document.body.appendChild(t);}
    t.textContent=msg; t.style.display="block"; clearTimeout(toastT);
    requestAnimationFrame(()=>{ t.style.opacity="1"; t.style.transform="translateX(-50%) translateY(0)"; });
    toastT=setTimeout(()=>{
      t.style.opacity="0"; t.style.transform="translateX(-50%) translateY(6px)";
      setTimeout(()=>{ t.style.display="none"; },260);
    },1600);
  }

  /* ---------- 科目選擇器 ---------- */
  function buildSubjectPicker(){
    const sel=document.createElement("select"); sel.id="subjectSel"; sel.className="subject-sel";
    (window.SUBJECT_ORDER||Object.keys(window.SUBJECTS)).forEach(id=>{
      const o=document.createElement("option"); o.value=id; o.textContent=window.SUBJECTS[id].name; sel.appendChild(o);
    });
    sel.addEventListener("change",()=>selectSubject(sel.value));
    const tag=$("#subjectTag"); tag.replaceWith(sel); // 用下拉取代靜態標籤
    // 仍保留一個隱藏的 #subjectTag 供 selectSubject 寫入（用 option text 即可，故改寫 selectSubject 不依賴它）
  }

  /* ---------- 啟動 ---------- */
  buildSubjectPicker();
  // 還原「考古題比重」偏好（全科目共用）
  const savedW=localStorage.getItem("pref_exam_weight");
  if(savedW!==null) $("#examWeight").value=savedW;
  applyExamWeight(false);
  selectSubject((window.SUBJECT_ORDER||["ds"])[0]);
  // 若有未完成的考試，回復之
  const cur=getExam();
  if(cur && !cur.submittedAt){
    if(confirm("偵測到未完成的考試，要繼續嗎？（取消＝放棄）")){ renderExam(); showScreen("exam"); }
    else localStorage.removeItem(CUR);
  }
})();

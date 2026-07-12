/* app.js — UI 控制 */
(() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const TYPES = ["選擇","複選","填空","計算","證明","設計"];

  // ── 目前科目狀態 ──
  let SUBJ, IMG, CUR, HIST, EXAMDIR, BOOKDIR, BOOKNAMES;
  let selectedUnits = new Set();
  let timerId = null;

  function selectSubject(id){
    SUBJ = window.SUBJECTS[id];
    IMG = SUBJ.images; CUR = id+"_current_exam"; HIST = id+"_exams_v1";
    EXAMDIR = SUBJ.examImgDir; BOOKDIR = SUBJ.bookImgDir; BOOKNAMES = SUBJ.bookNames;
    ENGINE.setSubject(id); SRS.setSubject(id);
    const tag=$("#subjectTag"); if(tag) tag.textContent = SUBJ.name;
    const sel=$("#subjectSel"); if(sel) sel.value = id;
    selectedUnits.clear();
    $("#countOverride").value = "";
    updateSourceLabels();
    if(timerId) clearInterval(timerId);
    renderUnits();
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

  function getOpts(){
    const sources=[];
    if($("#srcExam").checked) sources.push("exam");
    if($("#srcTb").checked) sources.push("textbook");
    const co=parseInt($("#countOverride").value,10);
    return { sources: sources.length?sources:["exam"], countOverride: (co>0?co:0),
             excludeCorrect: $("#excludeCorrect").checked };
  }
  ["srcExam","srcTb","excludeCorrect","countOverride"].forEach(id=>{
    const el=document.getElementById(id);
    el.addEventListener("change",updateScope); el.addEventListener("input",updateScope);
  });

  /* ---------- 畫面切換 ---------- */
  function showScreen(name){
    $$(".screen").forEach(s=>s.classList.remove("active"));
    $("#screen-"+name).classList.add("active");
    $$(".navbtn").forEach(b=>b.classList.toggle("active", b.dataset.screen===name));
    if(name==="pool") renderPool();
    if(name==="history") renderHistory();
  }
  $$(".navbtn").forEach(b=> b.addEventListener("click",()=>showScreen(b.dataset.screen)));

  /* ---------- 單元選擇 ---------- */
  function unitCounts(uid){
    const qs=ENGINE.BANK.filter(q=>q.units.includes(uid));
    const exam=qs.filter(q=>ENGINE.srcOf(q)==="exam").length;
    return { total:qs.length, exam };
  }
  function renderUnits(){
    const wrap=$("#unitList"); wrap.innerHTML="";
    ENGINE.UNITS.units.forEach(u=>{
      const div=document.createElement("div");
      div.className="unit-card"+(selectedUnits.has(u.id)?" sel":"");
      const c=unitCounts(u.id);
      div.innerHTML=`<div class="uname">${u.name}</div>
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
    const prev=$("#genPreview"), btn=$("#startBtn");
    if(!n){ prev.textContent="請至少選一個單元。"; btn.disabled=true; return; }
    btn.disabled=false;
    const p=ENGINE.plan([...selectedUnits], getOpts());
    if(p.poolSize===0){
      btn.disabled=true;
      prev.innerHTML=`<span style="color:var(--warn)">所選範圍在目前篩選下沒有題目可出（可能已全部答對，或來源都未勾選）。取消「排除已答對的題」或勾選題目來源即可。</span>`;
      return;
    }
    const types=Object.entries(p.typeTargets).filter(([,v])=>v>0).map(([t,v])=>`${t}${v}`).join("・");
    const co=getOpts().countOverride;
    const cntDesc = co? `自訂 <b>${p.targetN}</b> 題` : `固定 <b>${p.targetN}</b> 題（歷屆單年約 ${p.singleYear} 題 ×${p.overshoot}，<b>不隨範圍變動</b>）`;
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
    if(!selectedUnits.size) return;
    const ex=ENGINE.generate([...selectedUnits], getOpts());
    if(!ex.questions.length){ alert("所選範圍沒有可出的題目 🎉\n（可能是「排除已答對的題」把剩下的都排除了，或來源都未勾選——取消勾選即可繼續複習）"); return; }
    const exam={
      questions: ex.questions.map(q=>q.id),
      meta: ex.questions.map(q=>({id:q.id,year:q.year,type:q.type,points:q.points,title:q.title,
        stem:q.stem,keywords:q.keywords,source:q.source,book:q.book,page:q.page})),
      answers:{}, startTime:Date.now(), durationSec:ex.durationSec,
      scope:ex.scope, coveredAll:ex.coveredAll, missedKw:ex.missedKw
    };
    localStorage.setItem(CUR, JSON.stringify(exam));
    renderExam(); showScreen("exam");
  });

  function getExam(){ try{return JSON.parse(localStorage.getItem(CUR));}catch(e){return null;} }

  /* ---------- 考試頁 ---------- */
  function renderExam(){
    const ex=getExam(); if(!ex) return;
    $("#examScope").textContent="範圍："+ex.scope.join("、");
    $("#examMeta").textContent=`共 ${ex.questions.length} 題・限時 ${Math.round(ex.durationSec/60)} 分`
      + (ex.coveredAll? "・已涵蓋所選範圍全部關鍵字" : `・本卷涵蓋部分關鍵字（範圍大於單卷容量，剩 ${ex.missedKw.length} 個待下一卷）`);
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
      let rem=Math.max(0, Math.round(ex.durationSec-elapsed));
      const m=Math.floor(rem/60), s=rem%60;
      const t=$("#timer"); t.textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
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
    md+=`- 題數：${ex.questions.length}　限時：${Math.round(ex.durationSec/60)} 分　實際用時：${fmtDur(used)}\n`;
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
  selectSubject((window.SUBJECT_ORDER||["ds"])[0]);
  // 若有未完成的考試，回復之
  const cur=getExam();
  if(cur && !cur.submittedAt){
    if(confirm("偵測到未完成的考試，要繼續嗎？（取消＝放棄）")){ renderExam(); showScreen("exam"); }
    else localStorage.removeItem(CUR);
  }
})();

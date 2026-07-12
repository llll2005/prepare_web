/* engine.js — 模擬卷出題引擎
 * 規範：
 *  1. 涵蓋所選範圍（單元）內所有「可出題」的關鍵字（至少一題）。
 *  2. 總題數 ≈ 歷屆同範圍每卷平均題數 × overshootRatio（略多 1/3）。
 *  3. 題型分佈 ≈ 歷屆分佈 × 題數。
 *  4. 在滿足上述前提下，依錯題題海權重（SRS）加權隨機選題。
 */
const ENGINE = (() => {
  // ── 出現機率旋鈕（可調）──
  const EXAM_KW_BOOST = 1.3; // 含考古題熱門關鍵字的題（含課本「類似題」）出現權重 ×1.3
  const EXAM_SELF_WEIGHT = 0.7; // 考古題本身權重折扣，避免同一批考古題太常重複出現（讓類似題更常出現）

  // 目前科目狀態（由 setSubject 切換）
  let UNITS, BANK, cfg, HOT_EXAM_KW = new Set();

  function srcOf(q){ return q.src || (q.year>0 ? "exam" : "textbook"); }

  function setSubject(id){
    const s = window.SUBJECTS[id];
    UNITS = s.units; cfg = UNITS.examConfig;
    BANK = s.banks.filter(Boolean).flatMap(b => b.questions || []);
    const cnt={};
    BANK.forEach(q=>{ if(srcOf(q)==="exam") q.keywords.forEach(k=>cnt[k]=(cnt[k]||0)+1); });
    HOT_EXAM_KW = new Set(Object.keys(cnt).filter(k=>cnt[k]>=2));
    ENGINE.UNITS=UNITS; ENGINE.BANK=BANK; ENGINE.cfg=cfg; // 對外曝露目前科目資料
  }
  function unitById(id){ return UNITS.units.find(u=>u.id===id); }
  // 權重 = 錯題題海權重 ×（含熱門考古關鍵字則 ×1.3）×（考古題本身 ×0.7）。
  function combWeight(q){
    const boost = q.keywords.some(k=>HOT_EXAM_KW.has(k)) ? EXAM_KW_BOOST : 1;
    const selfW = srcOf(q)==="exam" ? EXAM_SELF_WEIGHT : 1;
    return SRS.weight(q.id) * boost * selfW;
  }

  function weightedPick(candidates, exclude){
    const pool = candidates.filter(q=>!exclude.has(q.id));
    if (!pool.length) return null;
    const weights = pool.map(combWeight);
    let total = weights.reduce((a,b)=>a+b,0);
    let r = Math.random()*total;
    for (let i=0;i<pool.length;i++){ r-=weights[i]; if (r<=0) return pool[i]; }
    return pool[pool.length-1];
  }
  function poolFor(selectedUnitIds, opts){
    opts=opts||{};
    const sel=new Set(selectedUnitIds);
    const allow=new Set(opts.sources&&opts.sources.length?opts.sources:["exam","textbook"]);
    return BANK.filter(q=>{
      if(!q.units.some(u=>sel.has(u))) return false;
      if(!allow.has(srcOf(q))) return false;
      // 排除已乾淨答對的題（但仍在錯題復習中的不排除，以維持「連兩次答對才消除」）
      if(opts.excludeCorrect){ const st=SRS.get(q.id); if(st.last==="correct" && !st.mark) return false; }
      return true;
    });
  }

  // 預覽：給定選的單元，回傳目標題數/型別/關鍵字統計（不真的選題）
  function plan(selectedUnitIds, opts){
    opts=opts||{};
    const pool = poolFor(selectedUnitIds, opts);
    // 可出題關鍵字 = 所選單元關鍵字 ∩ 題庫實際涵蓋
    const coverable = new Set();
    pool.forEach(q=>q.keywords.forEach(k=>coverable.add(k)));
    const reqKw=[], gapKw=[];
    selectedUnitIds.forEach(uid=>{
      const u=unitById(uid); if(!u) return;
      u.keywords.forEach(k=> (coverable.has(k)?reqKw:gapKw).push(k));
    });
    const reqSet=new Set(reqKw);
    // 固定題數：= 歷屆單年題量 × overshoot，與所選範圍大小無關
    const fixedN = Math.round(cfg.historicalBaseline.singleYearQuestions * cfg.overshootRatio);
    let targetN = fixedN;
    if (opts.countOverride>0) targetN = opts.countOverride;     // 使用者自訂
    targetN = Math.min(targetN, pool.length);                  // 不能超過題庫可用題數
    // 題型目標
    const dist = cfg.historicalBaseline.typeDistribution;
    const typeTargets={};
    Object.keys(dist).forEach(t=> typeTargets[t]=Math.round(dist[t]*targetN));
    const examN = pool.filter(q=>srcOf(q)==="exam").length, tbN = pool.filter(q=>srcOf(q)==="textbook").length;
    // 在固定題數內能否涵蓋全部必需關鍵字？（粗估：題數 < 關鍵字數時必然蓋不全）
    const fullyCoverable = targetN >= reqSet.size ? true : null; // null=可能蓋不全，實際由 generate 判定
    return { poolSize:pool.length, examN, tbN, targetN, fixedN,
             singleYear: cfg.historicalBaseline.singleYearQuestions, overshoot: cfg.overshootRatio,
             reqKw:[...reqSet], gapKw:[...new Set(gapKw)], typeTargets, fullyCoverable };
  }

  function generate(selectedUnitIds, opts){
    opts=opts||{};
    const pool = poolFor(selectedUnitIds, opts);
    const p = plan(selectedUnitIds, opts);
    let chosen=[]; const chosenIds=new Set();

    // 1) 集合覆蓋：固定題數預算內盡量涵蓋必需關鍵字。
    //    以「新覆蓋關鍵字數 × 題海權重」加權隨機挑題（非貪婪），讓課本類似題也有機會雀屏中選，
    //    避免關鍵字標較多的考古題在覆蓋階段壟斷。
    const uncovered=new Set(p.reqKw);
    while(uncovered.size>0 && chosen.length<p.targetN){
      // 鎖定「目前最稀有、最難被覆蓋的一個未覆蓋關鍵字」，只在能覆蓋它的候選間加權隨機，
      // 權重純用題海權重（不因考古題標的關鍵字多而加成）→ 兼顧覆蓋效率與降低考古占比。
      let rare=null, rareCnt=Infinity;
      uncovered.forEach(k=>{ const c=pool.filter(q=>!chosenIds.has(q.id)&&q.keywords.includes(k)).length;
        if(c>0 && c<rareCnt){ rareCnt=c; rare=k; } });
      if(!rare) break;
      const cands=pool.filter(q=>!chosenIds.has(q.id) && q.keywords.includes(rare));
      const ws=cands.map(q=>combWeight(q));
      let tot=ws.reduce((a,b)=>a+b,0), r=Math.random()*tot, pick=cands[cands.length-1];
      for(let i=0;i<cands.length;i++){ r-=ws[i]; if(r<=0){ pick=cands[i]; break; } }
      chosen.push(pick); chosenIds.add(pick.id);
      pick.keywords.forEach(k=>uncovered.delete(k));
    }

    // 2) 補足題數到 targetN，盡量貼合題型分佈，並用 SRS 權重
    const typeCount={}; chosen.forEach(q=>typeCount[q.type]=(typeCount[q.type]||0)+1);
    while(chosen.length<p.targetN){
      // 找目前最缺的題型
      let wantType=null, maxDef=-Infinity;
      Object.keys(p.typeTargets).forEach(t=>{
        const def=p.typeTargets[t]-(typeCount[t]||0);
        if(def>maxDef){ maxDef=def; wantType=t; }
      });
      let cand=pool.filter(q=>!chosenIds.has(q.id) && q.type===wantType);
      if(!cand.length) cand=pool.filter(q=>!chosenIds.has(q.id));
      if(!cand.length) break;
      const pick=weightedPick(cand,chosenIds);
      if(!pick) break;
      chosen.push(pick); chosenIds.add(pick.id);
      typeCount[pick.type]=(typeCount[pick.type]||0)+1;
    }

    // 3) 題組完整性：若選到某題組的一部分，補齊同組其餘小題（題組不可分割）
    const chosenSet=new Set(chosen.map(q=>q.id));
    chosen.slice().forEach(q=>{
      if(q.group) BANK.forEach(s=>{ if(s.group===q.group && !chosenSet.has(s.id)){ chosen.push(s); chosenSet.add(s.id); } });
    });

    // 4) 以「題組」為單位洗牌；組內依 part 排序，使同組小題相鄰且順序正確
    const groups={};
    chosen.forEach(q=>{ const g=q.group||q.id; (groups[g]=groups[g]||[]).push(q); });
    const gids=Object.keys(groups);
    for(let i=gids.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [gids[i],gids[j]]=[gids[j],gids[i]]; }
    chosen=gids.flatMap(g=>groups[g].sort((a,b)=>(a.part||0)-(b.part||0)));

    return {
      questions: chosen,
      durationSec: cfg.durationMinutes*60,
      scope: selectedUnitIds.map(id=>unitById(id)?.name||id),
      plan: p,
      coveredAll: uncovered.size===0,
      missedKw: [...uncovered]
    };
  }

  return { setSubject, plan, generate, unitById, srcOf, UNITS:null, BANK:null, cfg:null };
})();

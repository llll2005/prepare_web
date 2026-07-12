/* srs.js — 錯題題海 / 間隔重複狀態
 * 規則（依使用者規範）：
 *  - 答錯：設定錯題標記(mark=true)，提高出現機率；連續答對計數歸零。
 *  - 答對：降低出現機率；若該題目前有標記，需「連續兩次（出現於含該題的考試並答對）」才消除標記。
 *  - 「無」（未作答/不計）：視為中性偏負 — 連對計數歸零，但不新增錯題標記。
 * 狀態存於 localStorage。
 */
const SRS = (() => {
  let PREFIX = "ds";
  function setSubject(id){ PREFIX = id; }
  function KEY(){ return PREFIX + "_srs_v1"; }
  function load(){ try{ return JSON.parse(localStorage.getItem(KEY())) || {}; }catch(e){ return {}; } }
  function save(s){ localStorage.setItem(KEY(), JSON.stringify(s)); }

  function get(qid){
    const s = load();
    return s[qid] || { mark:false, streak:0, seen:0, correct:0, wrong:0, last:null };
  }

  // 出題權重：標記中的題權重高、已熟練的低、沒寫過的略高
  function weight(qid){
    const st = get(qid);
    let w = 1;
    if (st.mark) w *= 3.0;                 // 錯題 → 大幅提高
    else if (st.seen === 0) w *= 1.3;      // 沒出現過 → 略提高
    else if (st.last === "correct") w *= 0.4; // 已答對且無標記 → 降低
    if (st.seen >= 3 && !st.mark && st.last === "correct") w *= 0.6; // 多次穩定答對再降
    return Math.max(0.12, w);
  }

  // 批改後更新一題狀態。result ∈ "correct" | "wrong" | "none"
  function applyResult(qid, result){
    const s = load();
    const st = s[qid] || { mark:false, streak:0, seen:0, correct:0, wrong:0, last:null };
    st.seen += 1;
    if (result === "wrong"){
      st.mark = true; st.streak = 0; st.wrong += 1; st.last = "wrong";
    } else if (result === "correct"){
      st.streak += 1; st.correct += 1; st.last = "correct";
      if (st.mark && st.streak >= 2){ st.mark = false; st.cleared = (st.cleared||0)+1; } // 連兩次答對 → 消除標記
    } else { // none
      st.streak = 0; st.last = "none";
    }
    s[qid] = st; save(s);
    return st;
  }

  function stats(allQuestions){
    const s = load();
    let marked=0, mastered=0, fresh=0;
    allQuestions.forEach(q=>{
      const st=s[q.id];
      if(!st || st.seen===0){ fresh++; }
      else if(st.mark){ marked++; }
      else if(st.last==="correct"){ mastered++; }
      else fresh++;
    });
    return { marked, mastered, fresh, total:allQuestions.length };
  }

  function exportState(){ return load(); }
  function importState(obj){ save(obj || {}); }
  function reset(){ localStorage.removeItem(KEY()); }

  return { setSubject, get, weight, applyResult, stats, exportState, importState, reset, load };
})();

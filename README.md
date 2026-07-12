# 台大資工所 模擬考系統（多科目）

零安裝純前端 App。把歷屆考古題 + 聖經本/課本習題整理成題庫，依規範隨機出模擬卷、計時應考、打包作答給 AI 批改、回填結果後自動更新「錯題題海」（間隔重複）。

**已支援科目**（右上下拉切換，各科進度/錯題題海獨立）：
- **資料結構與演算法**：考古 75 + CLRS 912 + Pai 452 ＝ 1439 題、26 單元。
- **數學（線代＋離散）**：考古 54 + Friedberg 811 + Rosen 1911 + Schaum 86 ＝ 2862 題、21 單元（含「群論與有限體」課外單元）。Friedberg 此 PDF 缺 Ch7，標準形改由 Schaum Ch10 補；群論/有限體由 Schaum 附錄 B/C 補。Discrete Open Intro（Levin）因與 Rosen 重疊且抽取含符號遺失而未納入。
- **計算機結構與作業系統**：考古 40 + Silberschatz 185 + H&P Quantitative 150 + COD(P&H) 399 ＝ 774 題、20 單元（架構 9 + OS 11）。COD 子題（X.Y.Z）以題組綁定同情境。課本題皆有 book+page 單頁視窗。

單元卡顯示「總題數（歷屆考古 N）」，方便判斷各單元考古熱度。

加新科目：在 `data/` 放 `units_<id>.js`／`questions_<id>*.js`／`images_<id>.js`，於 `data/subjects.js` 註冊，並在 `index.html` 載入即可。

## 圖檔 images/
`images/`（考卷原卷圖 + 課本頁面圖，約 285MB）**已納入 repo**，clone 下來即完整可用（考試頁可展開原卷／課本原頁）。內容為各科原始 PDF 以 `pdftoppm -r 130 -png` 渲染：考卷 `images/<subject>/<年>_p-<頁>.png`、課本 `images/<subject>_book/<book>_p<PDF頁>.png`（book 與頁碼對應每題的 `book`/`page` 欄位）。

## 怎麼開
- **最簡單**：直接用瀏覽器開 `index.html`（雙擊即可）。資料以 `<script>` 全域變數載入、圖片走相對路徑，無需伺服器。
- 若你的瀏覽器對 `file://` 較嚴格（圖片或 localStorage 異常），在 `app/` 目錄執行一行即可：
  ```
  python3 -m http.server 8000
  ```
  然後開 http://localhost:8000

## 五大功能對應
1. **出題（初始頁）**：勾選要考的單元（對應 CLRS／Horowitz 章節）→ 預覽題數/題型/關鍵字 → 按「開始考試」即計時。
2. **出題規範**（`js/engine.js`）：
   - 以**集合覆蓋**確保涵蓋所選範圍**所有關鍵字**（每個至少一題）。
   - 題數以「歷屆同範圍每卷 ×1.33」為下限，涵蓋需求更高時以涵蓋為準。
   - 題型分佈貼合歷屆比例（選擇/複選/填空/計算/證明/設計）。
   - 在上述前提下，依**錯題題海權重**加權隨機選題。
3. **考試頁**：顯示題幹 + 關鍵字 + 可展開的**原卷頁面圖**（該年完整試卷掃描），下方輸入欄作答；倒數計時、時間到自動送出；中途離開可續考。
4. **送出**：把「題目＋你的作答＋配分＋原卷圖路徑」打包成 **Markdown**（複製或下載），貼給 AI 批改，再進入批改頁。
5. **批改頁**：逐題點 ✓對／○無／✗錯 → 產生**成績報告**（總分、逐題、各單元正確率、錯題題海變化）給 AI 分析；同時更新題海：
   - 答對 → 降低出現機率；答錯 → 設標記、提高機率。
   - **標記需「連續兩次（出現於含該題的考試並答對）」才消除**。

另有「題海狀態」「歷次成績」分頁，以及右上「匯出／匯入進度」做備份（localStorage 會因清快取而消失，重要進度請匯出）。

## 題庫怎麼擴充
- 題庫真值在 `data/*.json`，改完跑一次轉檔產生 `.js`：
  ```
  python3 -c "import json;[open(f'data/{n}.js','w',encoding='utf-8').write(f'window.{v} = '+json.dumps(json.load(open(f'data/{n}.json',encoding='utf-8')),ensure_ascii=False)+';\n') for n,v in [('units_ds','UNITS_DS'),('questions_ds','QUESTIONS_DS'),('questions_ds_clrs','QUESTIONS_DS_CLRS'),('images_ds','IMAGES_DS')]]"
  ```
- 課本習題由 `pdftotext` 抽取後自動分類（章節→單元、動詞→題型、文字比對→關鍵字）。重抽其他課本可仿照此流程。
- 題目欄位：`id/year/qnum/points/type/units/keywords/title/stem/source/answer`。`year>0` 會自動掛該年原卷頁圖；`year:0` 為課本題（來源寫在 `source`）。
- 原卷頁圖在 `images/ds/<年>_p-<頁>.png`，由 `pdftoppm -r 150 -png` 產生。

## 出題權重（可調旋鈕，在 `js/engine.js` 最上方）
- `EXAM_KW_BOOST = 1.3`：含「考古題反覆出現的熱門關鍵字」之題（含課本**類似題**）出現權重 ×1.3 → 類似題較常出現。
- `EXAM_SELF_WEIGHT = 0.7`：考古題本身權重折扣，避免同一批考古題太常重複。
- 註：若某關鍵字只有考古題考過（如樹直徑/reroot），在「涵蓋所選範圍全部關鍵字」前提下，該考古題仍會被選；隨課本來源增加（如 Pai 三冊）會更可替代、考古占比再降。

## 目前狀態（試做版）
- 題庫共 **1454 題**、**26 單元**：
  - **考古題 75 題**（102–114 全年度），「單題 metadata + 整年原卷圖」。
  - **CLRS 4e 習題 912 題**（含聖經未列章節另開的 5 單元：矩陣運算/FFT/數論/平行/線上）。
  - **Pai《A Textbook of DS&A》467 題**：複習題（選擇）271 + 範例題（計算/設計/證明）181 + 補洞 15。
- **課本題單頁視窗**：每題記錄 `book + page`，考試頁可展開**該題在課本 PDF 的那一頁圖**（`images/ds_book/<book>_p<page>.png`，共 528 頁）——含圖與**精確數學式**，解決抽取文字的數學亂碼問題。
- ⚠ **課本題的題幹文字**為 `pdftotext` 抽取，數學符號可能有亂碼；但現在可直接看課本原頁圖，數學以原頁為準。
- 出題時可用「題目來源」勾選只考考古／只刷課本／兩者；考古題權重較高。可自訂本卷題數（想大量刷課本就調大）。
- ⚠ **考試時長**目前預設 100 分鐘（`data/units_ds.json` → `examConfig.durationMinutes`），台大實際時長確認後再改。
- 後續：可比照流程把 Pai《A Textbook of DS&A》三冊、及另三科（數學／計組OS／英文）的考古＋課本一併納入。

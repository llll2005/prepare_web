/* subjects.js — 科目登錄；須在所有 data/*.js 之後載入 */
window.SUBJECTS = {
  ds: {
    id: "ds",
    name: "資料結構與演算法",
    units: window.UNITS_DS,
    banks: [window.QUESTIONS_DS, window.QUESTIONS_DS_CLRS, window.QUESTIONS_DS_PAI],
    images: window.IMAGES_DS,
    examImgDir: "images/ds",
    bookImgDir: "images/ds_book",
    bookNames: { clrs:"CLRS 4e", pai1:"Pai 卷一", pai2:"Pai 卷二", pai3:"Pai 卷三" }
  },
  math: {
    id: "math",
    name: "數學（線性代數＋離散數學）",
    units: window.UNITS_MATH,
    banks: [window.QUESTIONS_MATH, window.QUESTIONS_MATH_FRIED, window.QUESTIONS_MATH_ROSEN, window.QUESTIONS_MATH_SCHAUM, window.QUESTIONS_MATH_LEVIN],
    images: window.IMAGES_MATH,
    examImgDir: "images/math",
    bookImgDir: "images/math_book",
    bookNames: { friedberg:"Friedberg LA 4e", rosen:"Rosen DM 8e", schaum:"Schaum LA", levin:"Discrete Open Intro" }
  },
  caos: {
    id: "caos",
    name: "計算機結構與作業系統",
    units: window.UNITS_CAOS,
    banks: [window.QUESTIONS_CAOS, window.QUESTIONS_CAOS_SILB, window.QUESTIONS_CAOS_HP, window.QUESTIONS_CAOS_COD],
    images: window.IMAGES_CAOS,
    examImgDir: "images/caos",
    bookImgDir: "images/caos_book",
    bookNames: { silb:"Silberschatz OS 10e", hp:"H&P Quantitative 6e", cod:"COD (P&H) 5e" }
  }
};
window.SUBJECT_ORDER = ["ds","math","caos"];

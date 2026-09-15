const fs = require("node:fs");
const path = require("node:path");
const {spawnSync} = require("node:child_process");
const sets = {
  "jp": {
    "get": [
      "get_nikkei225.js",
      "get_jpx.js",
      "get_nikkeisemicon.js",
      "get_nikkeivi.js",
      "get_yen.js",
      "get_bitcoin.js",
      "get_yomiuri333.js",
      "get_yahoofinance.js",
      "get_nikkeisijo.js",
      "get_nikkeimany.js",
      "get_nikkeietc.js"
    ],
    "make": [
      "make_jpx.js",
      "make_nikkei225.js",
      "make_nikkeivi.js",
      "make_nikkeisemicon.js",
      "make_yen.js",
      "make_bitcoin.js",
      "make_yomiuri333.js",
      "make_nikkeisijo.js",
      "make_nikkeimany.js",
      "make_sendoukabu.js",
      "make_nikkeijikoku.js",
      "make_nikkeietc.js"
    ]
  },
  "usa": {
    "get": [
      "get_usa.js",
      "get_minkabucrypto.js",
      "get_rakuten.js",
      "get_google.js"
    ],
    "make": [
      "make_usa.js",
      "make_minkabucrypto.js",
      "make_rakuten.js",
      "make_google.js"
    ]
  }
};
const maps = {
  "jp": [
    [
      "TOPIX (東証株価指数).csv",
      "000.csv"
    ],
    [
      "日経平均株価.csv",
      "001.csv"
    ],
    [
      "日経平均ボラティリティー・インデックス.csv",
      "002.csv"
    ],
    [
      "ドル円.csv",
      "070.csv"
    ],
    [
      "ビットコイン.csv",
      "075.csv"
    ],
    [
      "TOPIX グロース.csv",
      "003.csv"
    ],
    [
      "TOPIX バリュー.csv",
      "004.csv"
    ],
    [
      "東証REIT指数.csv",
      "005.csv"
    ],
    [
      "東証REITオフィス指数.csv",
      "006.csv"
    ],
    [
      "東証REIT住宅指数.csv",
      "007.csv"
    ],
    [
      "東証REIT商業・物流等指数.csv",
      "008.csv"
    ],
    [
      "東証グロース市場250指数.csv",
      "009.csv"
    ]
  ],
  "usa": [
    [
      "NYダウ.csv",
      "051.csv"
    ],
    [
      "S&P500.csv",
      "052.csv"
    ],
    [
      "ナスダック.csv",
      "053.csv"
    ],
    [
      "ラッセル2000.csv",
      "054.csv"
    ],
    [
      "SOX指数.csv",
      "055.csv"
    ],
    [
      "M7時価総額.csv",
      "056.csv"
    ],
    [
      "アップル.csv",
      "101.csv"
    ],
    [
      "マイクロソフト.csv",
      "102.csv"
    ],
    [
      "グーグル.csv",
      "103.csv"
    ],
    [
      "アマゾン.csv",
      "104.csv"
    ],
    [
      "エヌビディア.csv",
      "105.csv"
    ],
    [
      "メタ.csv",
      "106.csv"
    ],
    [
      "テスラ.csv",
      "107.csv"
    ],
    [
      "アーク.csv",
      "108.csv"
    ],
    [
      "マイクロン.csv",
      "109.csv"
    ],
    [
      "AMD.csv",
      "110.csv"
    ],
    [
      "インテル.csv",
      "111.csv"
    ],
    [
      "アーム.csv",
      "112.csv"
    ],
    [
      "ブロードコム.csv",
      "113.csv"
    ],
    [
      "クアルコム.csv",
      "114.csv"
    ],
    [
      "ASML(蘭).csv",
      "115.csv"
    ],
    [
      "TSMC(台).csv",
      "116.csv"
    ],
    [
      "サムスン(韓).csv",
      "117.csv"
    ],
    [
      "テンセント(中).csv",
      "118.csv"
    ],
    [
      "アリババ(中).csv",
      "119.csv"
    ],
    [
      "パランティア.csv",
      "120.csv"
    ],
    [
      "SAP(独).csv",
      "121.csv"
    ],
    [
      "VW(独).csv",
      "122.csv"
    ],
    [
      "BASF(独).csv",
      "123.csv"
    ],
    [
      "バークシャーH.csv",
      "124.csv"
    ],
    [
      "JPモルガン.csv",
      "125.csv"
    ],
    [
      "GS.csv",
      "126.csv"
    ],
    [
      "HSBC(英).csv",
      "127.csv"
    ],
    [
      "BNPパリバ(仏).csv",
      "128.csv"
    ],
    [
      "LVMH(仏).csv",
      "129.csv"
    ],
    [
      "ウォルマート.csv",
      "130.csv"
    ],
    [
      "マクドナルド.csv",
      "131.csv"
    ],
    [
      "オラクル.csv",
      "132.csv"
    ],
    [
      "SKハイニクス.csv",
      "133.csv"
    ],
    [
      "Xiaomi(中).csv",
      "134.csv"
    ],
    [
      "BYD(中).csv",
      "135.csv"
    ],
    [
      "SMIC(中).csv",
      "136.csv"
    ],
    [
      "NAURA(中).csv",
      "137.csv"
    ],
    [
      "香港ハンセン指数.csv",
      "082.csv"
    ],
    [
      "台湾加権.csv",
      "083.csv"
    ],
    [
      "韓国総合株価指数.csv",
      "084.csv"
    ],
    [
      "英FT100指数.csv",
      "085.csv"
    ],
    [
      "独DAX30指数.csv",
      "086.csv"
    ],
    [
      "仏CAC40指数.csv",
      "087.csv"
    ],
    [
      "VIX指数.csv",
      "057.csv"
    ],
    [
      "ユーロ50.csv",
      "088.csv"
    ],
    [
      "インドSENSEX.csv",
      "089.csv"
    ],
    [
      "S&P 500 Consumer Discretionary.csv",
      "057.csv"
    ],
    [
      "S&P 500 Consumer Staples.csv",
      "058.csv"
    ],
    [
      "S&P 500 Energy.csv",
      "059.csv"
    ],
    [
      "S&P 500 Financials.csv",
      "060.csv"
    ],
    [
      "S&P 500 Health Care.csv",
      "061.csv"
    ],
    [
      "S&P 500 Industrials.csv",
      "062.csv"
    ],
    [
      "S&P 500 Information Technology.csv",
      "063.csv"
    ],
    [
      "S&P 500 Materials.csv",
      "064.csv"
    ],
    [
      "S&P 500 Telecommunication Services.csv",
      "065.csv"
    ],
    [
      "S&P 500 Utilities.csv",
      "066.csv"
    ]
  ]
};
const kind = process.argv[2];
if (!sets[kind]) throw new Error("Use jp or usa");
process.chdir(__dirname);
for (const phase of ["get", "make"]) {
  const errors = [];
  for (const file of sets[kind][phase]) {
    console.log("Running", file);
    const result = spawnSync(process.execPath, [file], {stdio:"inherit"});
    if (result.error || result.status !== 0) errors.push(file);
  }
  if (errors.length) throw new Error(phase + " failed: " + errors.join(", "));
}
for (const [source, target] of maps[kind]) {
  const from = path.join(__dirname, "data/pricedata", source);
  if (!fs.existsSync(from)) throw new Error("Missing CSV: " + source);
  fs.copyFileSync(from, path.join(__dirname, "../data", target));
}
fs.writeFileSync(path.join(__dirname, "../data/version.txt"), String(Date.now()));

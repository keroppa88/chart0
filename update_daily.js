// dataフォルダ内の銘柄別CSVに、指定日(TARGET_DATE)のOHLC等を「追記 or 最終行上書き」で反映する。
// 前提：
// - CSVは必ずヘッダ行あり
// - 日付昇順
// - 最新日付は必ず最終行
// - TARGET_DATE が存在するなら必ず最終行になる
// 当日（JST）の年月日を取得する。
// JPX / J-Quants API に対して、株価コードを指定せず
// 当日の年月日（date=YYYY-MM-DD）のみを指定して株価データ取得を要求する。
// code を指定しないため、全上場銘柄の「当日日次株価データ」が一括で返却される。
//
// data フォルダ内に存在する「コード.csv（4桁）」を列挙し、
// 取得した全銘柄データの中から該当コードのデータのみを対応付けて反映する。
//
// CSV は日付昇順で、最新日付は常に最終行にある前提。
// csv の最終行のみをチェックし、
// - 当日の年月日が最終行に存在する場合：最終行を上書き
// - 当日の年月日が存在しない場合：最終行に追記
//
// ローカルのコードは 4 桁だが、API 側は普通株が 5 桁（末尾 0）で返るため、
// 「5桁末尾0 → 4桁」に正規化して対応付けを行う。
//
// 当初は data フォルダ内の CSV から銘柄コードを取得し、
// 銘柄ごとに API を個別リクエストしていたため
// 約 1000 銘柄で 20 分程度かかっていた。
// 現在の方式では API を一括で 1 回（＋pagination）呼ぶため、処理はほぼ瞬時。


const fs = require("fs");
const path = require("path");

const API_KEY = process.env.JQUANTS_API_KEY;
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = path.join(__dirname, "data");

// ★確認用：ここを任意に変更（本運用なら「今日(JST)」に戻す）
const TARGET_DATE = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

// 本運用に戻すならこれを使う（上のTARGET_DATEをコメントアウトして差し替え）
// const TARGET_DATE = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

function hasPrice(d) {
  const O = d.AdjO ?? d.O;
  const H = d.AdjH ?? d.H;
  const L = d.AdjL ?? d.L;
  const C = d.AdjC ?? d.C;
  return O != null && H != null && L != null && C != null;
}

function toCsvLine(d) {
  const O = d.AdjO ?? d.O;
  const H = d.AdjH ?? d.H;
  const L = d.AdjL ?? d.L;
  const C = d.AdjC ?? d.C;
  const Vo = d.AdjVo ?? d.Vo;
  const Va = d.Va ?? 0;
  const UL = d.UL ?? "0";
  const LL = d.LL ?? "0";
  return `${d.Date},${O},${H},${L},${C},${Vo},${Va},${UL},${LL}`;
}

// 最終行だけ見て upsert（高速）
function upsertRowFast(filePath, d) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.replace(/\s+$/g, "").split("\n");
  if (lines.length < 2) throw new Error("CSV is too short");

  const lastIdx = lines.length - 1;
  const lastLine = lines[lastIdx];
  const lastDate = lastLine.split(",", 1)[0];

  const newLine = toCsvLine(d);

  if (lastDate === d.Date) {
    // 上書き
    lines[lastIdx] = newLine;
    fs.writeFileSync(filePath, lines.join("\n") + "\n");
    return "updated";
  }

  // 追記（昇順保証なので最後に足すだけ）
  lines.push(newLine);
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
  return "appended";
}

async function fetchAllDailyByDate(date) {
  // date指定で「全上場銘柄」取得。pagination_keyを回し切る。
  const all = [];
  let paginationKey = null;

  while (true) {
    const params = new URLSearchParams({ date });
    if (paginationKey) params.set("pagination_key", paginationKey);

    const res = await fetch(`${API_URL}/equities/bars/daily?${params}`, {
      headers: { "x-api-key": API_KEY },
    });

    if (!res.ok) {
      // デバッグしやすいように本文もできるだけ出す
      let body = "";
      try {
        body = await res.text();
      } catch (_) {}
      throw new Error(`HTTP Error: ${res.status} ${body ? `| ${body.slice(0, 300)}` : ""}`);
    }

    const json = await res.json();
    const data = json.data ?? [];
    all.push(...data);

    const next = json.pagination_key;
    if (!next) break;
    if (next === paginationKey) break; // 念のための無限ループ防止
    paginationKey = next;
  }

  return all;
}

function buildCodeMap(all) {
  const map = new Map();

  for (const d of all) {
    if (!d?.Code) continue;
    const c = String(d.Code);

    // そのまま登録（5桁等）
    map.set(c, d);

    // 末尾0の5桁（普通株）なら、4桁でも引けるようにする
    // 例: "95010" -> "9501"
    if (c.length === 5 && c.endsWith("0")) {
      map.set(c.slice(0, 4), d);
    }
  }

  return map;
}

async function updateAllStocks() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv"));
  console.log(`${TARGET_DATE} のデータ更新を開始します（対象: ${files.length} 銘柄）...`);

  // 1) 全銘柄を一括取得
  const all = await fetchAllDailyByDate(TARGET_DATE);
  console.log(`API取得完了: ${all.length} 件`);

  // 2) Code -> record のMap（5桁/4桁吸収）
  const map = buildCodeMap(all);

  // 3) ローカルにある銘柄CSVだけ更新（無ければ捨てる）
  let appended = 0,
    updated = 0,
    skippedNoData = 0,
    skippedNoPrice = 0,
    errors = 0;

  for (const file of files) {
    const code = path.basename(file, ".csv");
    const d = map.get(code);

    if (!d) {
      skippedNoData++;
      continue;
    }
    if (!hasPrice(d)) {
      skippedNoPrice++;
      continue;
    }

    const filePath = path.join(DATA_DIR, file);
    try {
      const r = upsertRowFast(filePath, d);
      if (r === "appended") appended++;
      else updated++;
    } catch (e) {
      errors++;
      console.error(`❌ ${code}: ${e.message}`);
    }
  }

  console.log(
    `\n✅ 完了: 追記 ${appended}, 上書き ${updated}, 該当なし ${skippedNoData}, 無取引(null) ${skippedNoPrice}, エラー ${errors}`
  );
}

updateAllStocks().catch((e) => {
  console.error("❌ 全体エラー:", e);
  process.exitCode = 1;
});

// dataフォルダ内の銘柄別CSVに、当日分のOHLC等を「追記 or 最終行上書き」で反映する。
// 前提：
// - CSVは必ずヘッダ行あり
// - 日付昇順
// - 最新日付は必ず最終行
// - 当日分は「存在するなら必ず最終行」になる（= 過去に同日が途中に紛れない）

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.JQUANTS_API_KEY;
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = path.join(__dirname, "aadata");

// JSTのYYYY-MM-DD
const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

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

// 最終行だけ見て upsert（超高速）
function upsertTodayRowFast(filePath, d) {
  const content = fs.readFileSync(filePath, "utf-8");

  // 末尾改行を除去して配列化（空行は想定しないが念のため）
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

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

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

async function updateAllStocks() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv"));
  console.log(`${today} のデータ更新を開始します（対象: ${files.length} 銘柄）...`);

  // 1) 全銘柄を一括取得
  const all = await fetchAllDailyByDate(today);
  console.log(`API取得完了: ${all.length} 件`);

  // 2) Code -> record のMap
  const map = new Map();
  for (const d of all) {
    if (d?.Code) map.set(String(d.Code), d);
  }

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
      const r = upsertTodayRowFast(filePath, d);
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

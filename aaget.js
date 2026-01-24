// dataフォルダ内の銘柄別CSVに、指定日(TARGET_DATE)のOHLC等を「追記 or 最終行上書き」で反映する。
// 前提：
// - CSVは必ずヘッダ行あり
// - 日付昇順
// - 最新日付は必ず最終行
// - TARGET_DATE が存在するなら必ず最終行になる（= 過去に同日が途中に紛れない）

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.JQUANTS_API_KEY;
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = path.join(__dirname, "aadata");

// ★今回の確認用に固定
const TARGET_DATE = "2026-01-23";

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
function upsertRowFast(filePath, d) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.replace(/\s+$/g, "").split("\n");
  if (lines.length < 2) throw new Error("CSV is too short");

  const lastIdx = lines.length - 1;
  const lastLine = lines[lastIdx];
  const lastDate = lastLine.split(",", 1)[0];

  const newLine = toCsvLine(d);

  if (lastDate === d.Date) {
    lines[lastIdx] = newLine;
    fs.writeFileSync(filePath, lines.join("\n") + "\n");
    return "updated";
  }

  lines.push(newLine);
  fs.writeFileSync(filePath, lines.join("\n") + "\n");
  return "appended";
}

async function fetchAllDailyByDate(date) {
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
    if (next === paginationKey) break;
    paginationKey = next;
  }

  return all;
}

async function updateAllStocks() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv"));
  console.log(`${TARGET_DATE} のデータ更新を開始します（対象: ${files.length} 銘柄）...`);

  const all = await fetchAllDailyByDate(TARGET_DATE);
  console.log(`API取得完了: ${all.length} 件`);

  // 確認用：日付がズレたデータが混ざってないか軽くチェック
  const bad = all.find((d) => d?.Date && d.Date !== TARGET_DATE);
  if (bad) {
    console.warn(`⚠️ DateがTARGET_DATEと一致しないデータあり: Code=${bad.Code}, Date=${bad.Date}`);
  }

  const map = new Map();
  for (const d of all) {
    if (d?.Code) map.set(String(d.Code), d);
  }

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

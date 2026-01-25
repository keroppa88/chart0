// financedata フォルダ配下の銘柄別CSVに、
// 当日(date指定)の財務スナップショットを追記する。
///v2/fins/summary を date 指定・code 未指定で一括取得
// 銘柄未指定で全銘柄、当日分の発表のみを取得する。
//financedataフォルダのcsvに照合して最終行に追記する
//過去分は触らない（ベースCSV前提）

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.JQUANTS_API_KEY;
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = path.join(__dirname, "financedata");

// JST 当日
const TARGET_DATE = new Date(Date.now() + 9 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);

// 5桁末尾0 → 4桁
function normalizeCode(code) {
  const c = String(code);
  return (c.length === 5 && c.endsWith("0")) ? c.slice(0, 4) : c;
}

async function fetchFinanceByDate(date) {
  const all = [];
  let paginationKey = null;

  while (true) {
    const params = new URLSearchParams({ date });
    if (paginationKey) params.set("pagination_key", paginationKey);

    const res = await fetch(`${API_URL}/fins/summary?${params}`, {
      headers: { "x-api-key": API_KEY },
    });

    if (!res.ok) {
      let body = "";
      try { body = await res.text(); } catch (_) {}
      throw new Error(`HTTP ${res.status} ${body}`);
    }

    const json = await res.json();
    all.push(...(json.data ?? []));

    if (!json.pagination_key) break;
    paginationKey = json.pagination_key;
  }

  return all;
}

async function updateAllFinance() {
  console.log(`${TARGET_DATE} の財務スナップショット取得開始…`);

  const all = await fetchFinanceByDate(TARGET_DATE);
  console.log(`API取得完了: ${all.length} 件`);

  // Code -> 最新行
  const map = new Map();
  for (const d of all) {
    if (!d?.Code || !d?.DiscDate) continue;
    const code = normalizeCode(d.Code);
    map.set(code, d);
  }

  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".csv"));

  let appended = 0;
  let skipped = 0;

  for (const file of files) {
    const code = path.basename(file, ".csv");
    const d = map.get(code);
    if (!d) continue;

    const filePath = path.join(DATA_DIR, file);
    const content = fs.readFileSync(filePath, "utf-8");

    // 既に同じ開示日があれば何もしない
    if (content.includes(d.DiscDate)) {
      skipped++;
      continue;
    }

    const newLine =
      (content.endsWith("\n") ? "" : "\n") +
      `${d.DiscDate},${d.DiscTime ?? ""},${code},` +
      `${d.NP ?? ""},${d.EPS ?? ""},${d.BPS ?? ""},${d.FDivAnn ?? ""}\n`;

    fs.appendFileSync(filePath, newLine);
    appended++;
  }

  console.log(`✅ 完了: 追記 ${appended}, 既存 ${skipped}`);
}

updateAllFinance().catch((e) => {
  console.error("❌ 全体エラー:", e);
  process.exitCode = 1;
});

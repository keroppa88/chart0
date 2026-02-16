// financedata フォルダ配下の銘柄別CSVに、
// 当日(date指定)の財務スナップショットを追記する。
///v2/fins/summary を date 指定・code 未指定で一括取得
// 銘柄未指定で全銘柄、当日分の発表のみを取得する。
//financedataフォルダのcsvに照合して最終行に追記する
//過去分は触らない（ベースCSV前提）
//収集カラムはfinanceget.jsのALL_COLUMNSと同一（31列）

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.JQUANTS_API_KEY;
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = path.join(__dirname, "financedata");

// financeget.js と同一のカラム定義（31列）
const ALL_COLUMNS = [
  "Code", "CurFYEn", "DiscDate", "NxtFYEn",
  "Sales", "OP", "OdP", "NP", "EPS", "DEPS", "TA", "Eq", "EqAR", "BPS",
  "CFO", "CFI", "CFF", "CashEq",
  "DivAnn", "FDivAnn", "FPayoutRatioAnn",
  "FSales", "FOP", "FOdP", "FNP", "FEPS",
  "NxFSales", "NxFOP", "NxFOdP", "NxFNp", "NxFEPS"
];

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

  const files = new Set(
    fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".csv")).map(f => path.basename(f, ".csv"))
  );

  let appended = 0;
  let skipped = 0;
  let created = 0;

  for (const [code, d] of map) {
    const filePath = path.join(DATA_DIR, `${code}.csv`);

    // ALL_COLUMNS に従って全31列を出力
    const row = ALL_COLUMNS.map(col => {
      if (col === "Code") return code;
      const val = d[col];
      return val !== undefined && val !== null ? val : "";
    }).join(",");

    if (!files.has(code)) {
      // 新規銘柄: ヘッダー付きで新規作成
      const header = ALL_COLUMNS.join(",");
      fs.writeFileSync(filePath, header + "\n" + row + "\n");
      created++;
      continue;
    }

    const content = fs.readFileSync(filePath, "utf-8");

    // 既に同じ開示日があれば何もしない
    if (content.includes(d.DiscDate)) {
      skipped++;
      continue;
    }

    const newLine = (content.endsWith("\n") ? "" : "\n") + row + "\n";
    fs.appendFileSync(filePath, newLine);
    appended++;
  }

  console.log(`✅ 完了: 追記 ${appended}, 新規 ${created}, 既存 ${skipped}`);
}

updateAllFinance().catch((e) => {
  console.error("❌ 全体エラー:", e);
  process.exitCode = 1;
});

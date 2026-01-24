// financedata フォルダ配下に、銘柄別の財務CSVを全時系列で生成する。
// ・J-Quants /v2/fins/summary を code 指定なしで一括取得
// ・全銘柄・全期間を取得（pagination 回し切り）
// ・Code(5桁末尾0) → 4桁に正規化
// ・銘柄ごとに DiscDate 昇順で CSV を丸ごと書き直す
// ・差分比較・追記判定はしない（常に再生成）

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.JQUANTS_API_KEY;
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = path.join(__dirname, "financedata");

// 5桁末尾0 → 4桁正規化
function normalizeCode(code) {
  const c = String(code);
  return (c.length === 5 && c.endsWith("0")) ? c.slice(0, 4) : c;
}

// 全財務データ一括取得
async function fetchAllFinance() {
  const all = [];
  let paginationKey = null;

  while (true) {
    const params = new URLSearchParams();
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
  console.log("財務データ一括取得を開始します…");

  const all = await fetchAllFinance();
  console.log(`API取得完了: ${all.length} 件`);

  // Code -> 行配列
  const map = new Map();

  for (const d of all) {
    if (!d?.Code || !d?.DiscDate) continue;

    const code = normalizeCode(d.Code);
    if (!map.has(code)) map.set(code, []);
    map.get(code).push(d);
  }

  let written = 0;

  for (const [code, rows] of map) {
    // 開示日昇順
    rows.sort((a, b) => a.DiscDate.localeCompare(b.DiscDate));

    const header = "DiscDate,DiscTime,Code,NP,EPS,BPS,FDivAnn\n";
    const body = rows.map(d =>
      `${d.DiscDate},${d.DiscTime ?? ""},${code},` +
      `${d.NP ?? ""},${d.EPS ?? ""},${d.BPS ?? ""},${d.FDivAnn ?? ""}`
    ).join("\n");

    const csv = header + body + "\n";
    const filePath = path.join(DATA_DIR, `${code}.csv`);

    fs.writeFileSync(filePath, csv);
    written++;
  }

  console.log(`✅ CSV生成完了: ${written} 銘柄`);
}

updateAllFinance().catch((e) => {
  console.error("❌ 全体エラー:", e);
  process.exitCode = 1;
});

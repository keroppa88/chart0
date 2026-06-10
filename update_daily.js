// dataフォルダ内の銘柄別CSVに、直近 BACKFILL_DAYS 日分のOHLC等を日付ベースでマージする（自己修復型）。
// 前提：
// - CSVは必ずヘッダ行あり
// - 日付昇順
//
// JPX / J-Quants API に対して、株価コードを指定せず
// 日付（date=YYYY-MM-DD）のみを指定して株価データ取得を要求する。
// code を指定しないため、全上場銘柄の「当日日次株価データ」が一括で返却される。
// これを今日(JST)から過去 BACKFILL_DAYS 日分繰り返す（休日はAPIが0件を返すだけ）。
//
// data フォルダ内に存在する「コード.csv（4桁）」を列挙し、
// 取得した全銘柄データの中から該当コードのデータのみを対応付けて反映する。
//
// 反映は行位置ではなく日付キーのマージ：
// - APIに存在する日付がCSVにあれば置換、なければ挿入（→過去の欠損・誤データを自動修復）
// - APIに存在しない日付（休日等）の既存行はそのまま保持
// - 全行を日付昇順にソートして書き戻す
//
// 窓より古い欠損を補修したい場合は環境変数 BACKFILL_DAYS を大きくして手動実行する。
//
// ローカルのコードは 4 桁だが、API 側は普通株が 5 桁（末尾 0）で返るため、
// 「5桁末尾0 → 4桁」に正規化して対応付けを行う。

const fs = require("fs");
const path = require("path");

const API_KEY = process.env.JQUANTS_API_KEY;
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = path.join(__dirname, "data");

// 取得する日数（今日を含む過去 N 暦日）。欠損が広い場合は大きくして手動実行。
const BACKFILL_DAYS = Math.max(1, parseInt(process.env.BACKFILL_DAYS || "5", 10));

// JST の今日から i 日前の YYYY-MM-DD
function jstDateMinus(i) {
  return new Date(Date.now() + 9 * 60 * 60 * 1000 - i * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

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

// 日付キーでマージして書き戻す。
// rowsByDate: Map<date, record>（その銘柄の取得分）
// 戻り値: { inserted, replaced }
function mergeRows(filePath, rowsByDate) {
  const content = fs.readFileSync(filePath, "utf-8");
  const lines = content.replace(/\s+$/g, "").split("\n");
  if (lines.length < 1) throw new Error("CSV is empty");

  const header = lines[0];
  const byDate = new Map(); // date -> csv line
  for (let i = 1; i < lines.length; i++) {
    const date = lines[i].split(",", 1)[0];
    if (date) byDate.set(date, lines[i]);
  }

  let inserted = 0;
  let replaced = 0;
  for (const [date, d] of rowsByDate) {
    const newLine = toCsvLine(d);
    if (byDate.has(date)) {
      if (byDate.get(date) !== newLine) replaced++;
      byDate.set(date, newLine);
    } else {
      byDate.set(date, newLine);
      inserted++;
    }
  }

  if (inserted === 0 && replaced === 0) return { inserted, replaced };

  const sorted = [...byDate.keys()].sort();
  const out = [header, ...sorted.map((dt) => byDate.get(dt))];
  fs.writeFileSync(filePath, out.join("\n") + "\n");
  return { inserted, replaced };
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

// 5桁末尾0 → 4桁
function normalizeCode(code) {
  const c = String(code);
  return c.length === 5 && c.endsWith("0") ? c.slice(0, 4) : c;
}

async function updateAllStocks() {
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv"));
  console.log(`過去 ${BACKFILL_DAYS} 日分のデータ更新を開始します（対象: ${files.length} 銘柄）...`);

  // 1) 日付ごとに全銘柄を一括取得し、code -> (date -> record) に積む
  const byCode = new Map();
  let totalFetched = 0;

  for (let i = 0; i < BACKFILL_DAYS; i++) {
    const date = jstDateMinus(i);
    const all = await fetchAllDailyByDate(date);
    console.log(`${date}: API取得 ${all.length} 件`);
    totalFetched += all.length;

    for (const d of all) {
      if (!d?.Code || !d?.Date) continue;
      if (!hasPrice(d)) continue; // 無取引(null)は反映しない
      const code = normalizeCode(d.Code);
      let m = byCode.get(code);
      if (!m) {
        m = new Map();
        byCode.set(code, m);
      }
      m.set(d.Date, d);
    }
  }

  if (totalFetched === 0) {
    console.log("⚠️ 全日付で取得0件のため、CSVは変更しません（休日連続 or API異常）。");
    return;
  }

  // 2) ローカルにある銘柄CSVだけマージ（無ければ捨てる）
  let inserted = 0,
    replaced = 0,
    skippedNoData = 0,
    errors = 0;

  for (const file of files) {
    const code = path.basename(file, ".csv");
    const rowsByDate = byCode.get(code);

    if (!rowsByDate || rowsByDate.size === 0) {
      skippedNoData++;
      continue;
    }

    const filePath = path.join(DATA_DIR, file);
    try {
      const r = mergeRows(filePath, rowsByDate);
      inserted += r.inserted;
      replaced += r.replaced;
      if (r.inserted > 1) {
        // 通常実行で2行以上挿入＝過去に欠損があった証跡
        console.log(`🩹 ${code}: 欠損補充 ${r.inserted} 日分`);
      }
    } catch (e) {
      errors++;
      console.error(`❌ ${code}: ${e.message}`);
    }
  }

  console.log(
    `\n✅ 完了: 挿入 ${inserted} 行, 置換 ${replaced} 行, 該当なし ${skippedNoData} 銘柄, エラー ${errors}`
  );
}

updateAllStocks().catch((e) => {
  console.error("❌ 全体エラー:", e);
  process.exitCode = 1;
});

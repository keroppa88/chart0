// make_yen.js
// data/yen.csv から USD/JPY を抽出し、data/pricedata/ドル円.csv を例の形式で upsert する

const fs = require("fs");
const path = require("path");

// ===== paths =====
const base = path.join(process.cwd(), "data");
const src = path.join(base, "yen.csv");
const dstDir = path.join(base, "pricedata");
const dst = path.join(dstDir, "ドル円.csv");
fs.mkdirSync(dstDir, { recursive: true });

// ===== date (Asia/Tokyo) =====
function tokyoTodayISO() {
  const now = new Date();
  // UTCミリ秒 = now - ローカルTZオフセット
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  // JST = UTC + 9h
  const jst = new Date(utcMs + 9 * 60 * 60_000);
  const y = jst.getUTCFullYear();
  const m = String(jst.getUTCMonth() + 1).padStart(2, "0");
  const d = String(jst.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
const today = tokyoTodayISO();

// ===== helpers =====
function normLine(s) {
  s = s.trim();
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') s = s.slice(1, -1);
  // 全角スペース/タブ -> 半角スペース、連続空白を1つに
  s = s.replace(/\u3000/g, " ").replace(/\t/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

// CSVを「行の配列(文字列)」として読む（今回のファイルは1行=1セルなのでこれで十分）
function readLines(file) {
  const text = fs.readFileSync(file, "utf8");
  return text.split(/\r?\n/).map(normLine).filter(Boolean);
}

function parseCSV(file) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  return lines.map((line) => {
    // 超簡易CSV: ダブルクォート対応、カンマ区切り
    // 例: Date,Open,... / 2026-01-27,5842,...
    // ※今回のドル円.csvはこの程度で足りる前提
    const out = [];
    let cur = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
        continue;
      }
      if (ch === "," && !inQ) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur);
    return out.map((x) => x.trim());
  });
}

function writeCSV(file, rows) {
  const text = rows
    .map((row) =>
      row
        .map((cell) => {
          const s = String(cell ?? "");
          // カンマ/クォート/改行があればクォート
          if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        })
        .join(",")
    )
    .join("\n");
  // UTF-8 BOM 付きで保存（Windowsメモ帳対策）
  fs.writeFileSync(file, "\uFEFF" + text, "utf8");
}

// ===== extract USD/JPY =====
const lines = readLines(src);
const pair = "USD/JPY";

let open_ = null, high_ = null, low_ = null, close_ = null;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].startsWith(pair)) {
    if (i + 2 >= lines.length || i + 3 >= lines.length) {
      throw new Error("USD/JPY ブロックが途中で途切れています。");
    }

    // 2行下: "700 152.655" → 終値=2つ目
    const p2 = lines[i + 2].split(" ");
    if (p2.length < 2) throw new Error(`終値行が想定外: ${lines[i + 2]}`);
    close_ = p2[1];

    // 3行下: "(19:39) +0.465 13,475 152.350 153.080 152.250 130.00"
    const p3 = lines[i + 3].split(" ");
    if (p3.length < 6) throw new Error(`OHLC行が想定外: ${lines[i + 3]}`);
    open_ = p3[3];
    high_ = p3[4];
    low_ = p3[5];

    break;
  }
}

if (close_ == null) throw new Error("yen.csv 内に USD/JPY が見つかりませんでした。");

// ===== upsert into ドル円.csv (例の9列フォーマット) =====
const defaultHeader = [
  "Date",
  "Open",
  "High",
  "Low",
  "Close",
  "Volume",
  "TradingValue",
  "UpLimit",
  "UnderLimit",
];

let rows;
if (fs.existsSync(dst)) {
  rows = parseCSV(dst);
} else {
  rows = [defaultHeader];
}

let header = rows[0];
if (!header || header.length === 0) {
  header = defaultHeader;
  rows = [header];
}

// ヘッダが想定外でも Date/Open/High/Low/Close がある前提で位置を探す
function idx(name) {
  const k = header.indexOf(name);
  return k >= 0 ? k : null;
}
const iDate = idx("Date") ?? 0;
const iOpen = idx("Open");
const iHigh = idx("High");
const iLow = idx("Low");
const iClose = idx("Close");

// 最終行の日付と比較し、同じならスキップ、違うなら追記
const lastRow = rows.length > 1 ? rows[rows.length - 1] : null;
const lastDate = lastRow ? (lastRow[iDate] ?? "") : "";

if (lastDate === today) {
  console.log(`skip: ${dst} (already has ${today})`);
  process.exit(0);
}

// 末尾追加
const newRow = Array(header.length).fill("");
newRow[iDate] = today;
if (iOpen != null) newRow[iOpen] = open_;
if (iHigh != null) newRow[iHigh] = high_;
if (iLow != null) newRow[iLow] = low_;
if (iClose != null) newRow[iClose] = close_;

for (let j = 0; j < header.length; j++) {
  if (["Volume", "TradingValue", "UpLimit", "UnderLimit"].includes(header[j]) && !newRow[j]) {
    newRow[j] = "0";
  }
}
rows.push(newRow);

// 保存
writeCSV(dst, rows);

console.log(`saved: ${dst}`);
console.log(`${today}  O=${open_} H=${high_} L=${low_} C=${close_}`);

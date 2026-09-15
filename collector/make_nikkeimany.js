// ●日経 指数値一覧（nikkeimany.csv）から全指数の終値を抽出
// 「指数名」「指数値」「前日比」「データ日付(MM.DD)」の4行パターンを検出する

const fs = require('fs');
const path = require('path');

const INPUT = path.join('data', 'nikkeimany.csv');
const OUT_DIR = path.join('data', 'pricedata');
const HEADER = 'Date,Open,High,Low,Close,Volume,TradingValue,UpLimit,LowLimit';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function unquote(s) {
  return s.replace(/^﻿?"/, '').replace(/"$/, '').trim();
}

function isNumberOnlyLine(s) {
  const t = s.trim();
  return /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?$/.test(t) || /^-?\d+(?:\.\d+)?$/.test(t);
}

function toNumStr(s) {
  return s.replace(/,/g, '').trim();
}

function sanitizeFilename(name) {
  return name.replace(/[\\\/:*?"<>|]/g, '_').trim();
}

function getLastDate(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const stat = fs.fstatSync(fd);
    const readSize = Math.min(stat.size, 128);
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    const tail = buf.toString('utf8');
    const tlines = tail.split(/\r?\n/).filter(Boolean);
    const lastLine = tlines[tlines.length - 1];
    return lastLine ? lastLine.split(',')[0] : null;
  } finally {
    fs.closeSync(fd);
  }
}

function appendIfNotExists(outPath, dateISO, open, high, low, close) {
  const newLine = `${dateISO},${open},${high},${low},${close},,,,`;
  if (!fs.existsSync(outPath)) {
    fs.writeFileSync(outPath, `${HEADER}\n${newLine}\n`, 'utf8');
    return;
  }
  if (getLastDate(outPath) === dateISO) return;
  fs.appendFileSync(outPath, `${newLine}\n`, 'utf8');
}

// MM.DD（年なし）から日付を補完。未来日付になる場合は前年とみなす
function mmddToISO(mm, dd) {
  const now = new Date(Date.now() + 9 * 3600 * 1000); // JST
  let y = now.getUTCFullYear();
  const d = Date.UTC(y, Number(mm) - 1, Number(dd));
  if (d - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) > 30 * 86400000) y--;
  return `${y}-${mm}-${dd}`;
}

(function main() {
  const lines = fs.readFileSync(INPUT, 'utf8').split(/\r?\n/).filter(Boolean).map(unquote);

  // 指数名 / 指数値 / 前日比 / データ日付 の4行並びを全て検出
  const changeRe = /^[+\-±]?[\d,.]+\s+[+\-]?[\d,.]+%$|^0\.00 0\.00%$/;
  const dateRe = /^(\d{2})\.(\d{2})\(/;

  // 収集対象（ホワイトリスト）。これ以外の指数は記録しない。
  // ※日経半導体株指数・日経平均株価等は既存パイプラインが四本値付きで収集済み
  const keepNames = new Set([
    '日経平均内需株50指数',
    '日経平均外需株50指数',
    '日経平均カバードコール・インデックス',
    '日経平均カバードコールATMインデックス',
  ]);
  let count = 0;

  for (let i = 0; i < lines.length - 3; i++) {
    const name = lines[i].trim();
    const value = lines[i + 1].trim();
    const change = lines[i + 2].trim();
    const dateLine = lines[i + 3].trim();

    if (!keepNames.has(name)) continue;
    if (!isNumberOnlyLine(value)) continue;
    if (!changeRe.test(change)) continue;
    const m = dateLine.match(dateRe);
    if (!m) continue;

    const dateISO = mmddToISO(m[1], m[2]);
    const close = toNumStr(value);
    const outPath = path.join(OUT_DIR, `${sanitizeFilename(name)}.csv`);
    appendIfNotExists(outPath, dateISO, close, close, close, close);
    console.log('saved:', outPath, 'date:', dateISO);
    count++;
    i += 3;
  }

  if (count === 0) throw new Error('指数データを1件も抽出できません');
  console.log(`total: ${count}`);
})();

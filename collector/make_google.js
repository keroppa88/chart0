// ●Google スプレッドシート（google.csv）から指数の四本値を抽出
// 列: 更新日時, 取得元, コード, 銘柄, 始値, 高値, 安値, 終値
// 重複6種（香港ハンセン・インドSENSEX・CAC40・FTSE100・DAX・VIX）は
// 既存CSVファイル名に統合出力する。それ以外は銘柄名そのままで出力。

const fs = require('fs');
const path = require('path');

const INPUT = path.join('data', 'google.csv');
const OUT_DIR = path.join('data', 'pricedata');
const HEADER = 'Date,Open,High,Low,Close,Volume,TradingValue,UpLimit,LowLimit';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// 銘柄名 → 出力CSVファイル名（拡張子なし）。未掲載は銘柄名そのまま。
const nameMap = {
  '香港ハンセン': '香港ハンセン指数',
  'インドSENSEX': 'インドSENSEX',
  'CAC40': '仏CAC40指数',
  'FTSE100': '英FT100指数',
  'DAX': '独DAX30指数',
  'VIX': 'VIX指数',
};

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (q && line[i + 1] === '"') { cur += '"'; i++; }
      else q = !q;
    } else if (c === ',' && !q) {
      result.push(cur); cur = '';
    } else cur += c;
  }
  result.push(cur);
  return result.map(s => s.trim());
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

function num(s) {
  return (s || '').replace(/,/g, '').trim();
}

(function main() {
  const rawLines = fs.readFileSync(INPUT, 'utf8').split(/\r?\n/).filter(Boolean);
  const rows = rawLines.map(l => parseCSVLine(l.replace(/^﻿/, '')));

  // 日付（更新日時列にある行から。"2026/06/12 13:33:15"）
  let dateISO = null;
  for (const r of rows) {
    const m = (r[0] || '').match(/^(\d{4})\/(\d{2})\/(\d{2})/);
    if (m) { dateISO = `${m[1]}-${m[2]}-${m[3]}`; break; }
  }
  if (!dateISO) throw new Error('更新日時が見つかりません');

  let count = 0;
  for (const r of rows) {
    if (r.length < 8) continue;
    const name = r[3];
    if (!name || name === '銘柄') continue;

    const open = num(r[4]), high = num(r[5]), low = num(r[6]), close = num(r[7]);
    if ([open, high, low, close].some(v => !/^-?\d+(?:\.\d+)?$/.test(v))) continue;

    const outName = nameMap[name] || name;
    const outPath = path.join(OUT_DIR, `${sanitizeFilename(outName)}.csv`);
    appendIfNotExists(outPath, dateISO, open, high, low, close);
    console.log('saved:', outPath, 'date:', dateISO);
    count++;
  }

  if (count === 0) throw new Error('指数データを1件も抽出できません');
  console.log(`total: ${count}`);
})();

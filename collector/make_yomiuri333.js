// ●読売333（yomiuri333.csv）から終値を抽出
// 「読売株価指数」「2026.06.12」「50277.48円」の並びを検出する

const fs = require('fs');
const path = require('path');

const INPUT = path.join('data', 'yomiuri333.csv');
const OUT_DIR = path.join('data', 'pricedata');
const HEADER = 'Date,Open,High,Low,Close,Volume,TradingValue,UpLimit,LowLimit';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function unquote(s) {
  return s.replace(/^﻿?"/, '').replace(/"$/, '').trim();
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

(function main() {
  const lines = fs.readFileSync(INPUT, 'utf8').split(/\r?\n/).filter(Boolean).map(unquote);

  let dateISO = null;
  let close = null;

  for (let i = 0; i < lines.length - 2; i++) {
    if (lines[i].trim() !== '読売株価指数') continue;
    const md = lines[i + 1].trim().match(/^(\d{4})\.(\d{2})\.(\d{2})$/);
    const mv = lines[i + 2].trim().match(/^([\d,]+(?:\.\d+)?)円$/);
    if (!md || !mv) continue;
    dateISO = `${md[1]}-${md[2]}-${md[3]}`;
    close = mv[1].replace(/,/g, '');
    break;
  }

  if (!dateISO || !close) throw new Error('読売333の日付/終値を抽出できません');

  const outPath = path.join(OUT_DIR, '読売333.csv');
  appendIfNotExists(outPath, dateISO, close, close, close, close);
  console.log('saved:', outPath, 'date:', dateISO);
})();

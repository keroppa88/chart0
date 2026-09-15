// ●日経平均株価の始値・高値・安値を付けた時刻を抽出（nikkei225.csv から）
// 「始値\t65,176.23\t09:00」のような行から時刻部分を取り出し、日経時刻.csv に追記する

const fs = require('fs');
const path = require('path');

const INPUT = path.join('data', 'nikkei225.csv');
const OUT_DIR = path.join('data', 'pricedata');
const OUT_FILE = path.join(OUT_DIR, '日経時刻.csv');
const HEADER = 'Date,OpenTime,HighTime,LowTime';

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

(function main() {
  const lines = fs.readFileSync(INPUT, 'utf8').split(/\r?\n/).filter(Boolean).map(unquote);

  // 日付（make_nikkei225.js と同じ「2026.06.12(」形式の行から取得）
  let dateISO = null;
  const dateLineRe = /(20\d{2})\.(\d{2})\.(\d{2})\s*\(/;
  for (const line of lines) {
    const m = line.match(dateLineRe);
    if (m) {
      dateISO = `${m[1]}-${m[2]}-${m[3]}`;
      break;
    }
  }
  if (!dateISO) throw new Error('日付を特定できません');

  // 「始値\t65,176.23\t09:00」から時刻を取得
  function findTime(prefix) {
    const row = lines.find(s => s.startsWith(prefix + '\t') || s.startsWith(prefix + ' '));
    if (!row) return null;
    const m = row.match(/(\d{1,2}:\d{2})\s*$/);
    return m ? m[1] : null;
  }

  const openTime = findTime('始値');
  const highTime = findTime('高値');
  const lowTime = findTime('安値');

  if (!openTime || !highTime || !lowTime) {
    throw new Error(`時刻の抽出失敗 open=${openTime}, high=${highTime}, low=${lowTime}`);
  }

  const newLine = `${dateISO},${openTime},${highTime},${lowTime}`;

  if (!fs.existsSync(OUT_FILE)) {
    fs.writeFileSync(OUT_FILE, `${HEADER}\n${newLine}\n`, 'utf8');
  } else if (getLastDate(OUT_FILE) !== dateISO) {
    fs.appendFileSync(OUT_FILE, `${newLine}\n`, 'utf8');
  }

  console.log('saved:', OUT_FILE, 'date:', dateISO, `open=${openTime} high=${highTime} low=${lowTime}`);
})();

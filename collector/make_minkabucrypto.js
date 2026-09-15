// ●みんかぶ暗号資産 リアルタイムレート（minkabucrypto.csv）から各通貨の価格を抽出
// 「順位\t」「通貨名(シンボル)」「価格\t24H変動比\t時価総額」の3行パターンを検出する
// ページに日付表記がないため、取得実行日（JST）を日付として記録する

const fs = require('fs');
const path = require('path');

const INPUT = path.join('data', 'minkabucrypto.csv');
const OUT_DIR = path.join('data', 'pricedata');
const HEADER = 'Date,Open,High,Low,Close,Volume,TradingValue,UpLimit,LowLimit';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function unquote(s) {
  return s.replace(/^﻿?"/, '').replace(/"$/, '').trim();
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

(function main() {
  const lines = fs.readFileSync(INPUT, 'utf8').split(/\r?\n/).filter(Boolean).map(unquote);

  // 実行日（JST）
  const now = new Date(Date.now() + 9 * 3600 * 1000);
  const dateISO = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  const nameRe = /^(.+)\(([A-Z0-9]+)\)$/;
  // 収集対象（ホワイトリスト）。これ以外の通貨は記録しない。
  const keepSymbols = new Set(['BTC', 'ETH', 'XRP']);
  let count = 0;

  // 暗号資産市場の時価総額（兆円）
  // 「暗号資産市場の時価総額\t24時間売買代金（JPY）\tBTC比率」の次行「348.83 兆\t12.43 兆」
  for (let i = 0; i < lines.length - 1; i++) {
    if (!lines[i].startsWith('暗号資産市場の時価総額')) continue;
    const m = lines[i + 1].trim().match(/^([\d,]+(?:\.\d+)?)\s*兆/);
    if (m) {
      const v = m[1].replace(/,/g, '');
      const outPath = path.join(OUT_DIR, '暗号資産時価総額（兆円）.csv');
      appendIfNotExists(outPath, dateISO, v, v, v, v);
      console.log('saved:', outPath, 'date:', dateISO);
      count++;
    }
    break;
  }

  for (let i = 0; i < lines.length - 2; i++) {
    // 「1」（順位のみ。get時のタブは行末で消える場合がある）
    if (!/^\d+$/.test(lines[i].trim())) continue;

    const nm = lines[i + 1].trim().match(nameRe);
    if (!nm) continue;
    if (!keepSymbols.has(nm[2])) continue;

    // 「10,203,566\t+98,416(+0.97%)\t約 2,039,612億円」
    const dataCols = lines[i + 2].split('\t').map(c => c.trim());
    const price = dataCols[0];
    if (!/^-?[\d,]+(?:\.\d+)?$/.test(price)) continue;

    const name = `${nm[1]}(${nm[2]})`;
    const close = price.replace(/,/g, '');
    const outPath = path.join(OUT_DIR, `${sanitizeFilename(name)}.csv`);
    appendIfNotExists(outPath, dateISO, close, close, close, close);
    console.log('saved:', outPath, 'date:', dateISO);
    count++;
    i += 2;
  }

  if (count === 0) throw new Error('通貨データを1件も抽出できません');
  console.log(`total: ${count}`);
})();

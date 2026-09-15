// ●先導株比率
// yahoofinance.csv（売買代金上位ランキング・1円単位）と
// nikkeisijo.csv（プライム売買代金・百万円単位）を組み合わせて算出する。
//   先導株比率1～3位 = 上位3銘柄の売買代金合計 / プライム売買代金 (%)
//   先導株比率10位   = 上位10銘柄の売買代金合計 / プライム売買代金 (%)
//   （20位・30位・40位・50位も同様）
// 両ページの日付が一致しない場合はエラーで停止する。

const fs = require('fs');
const path = require('path');

const INPUT_YAHOO = path.join('data', 'yahoofinance.csv');
const INPUT_SIJO = path.join('data', 'nikkeisijo.csv');
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

// M/D（年なし）から日付を補完。未来日付になる場合は前年とみなす
function mdToISO(m, d) {
  const now = new Date(Date.now() + 9 * 3600 * 1000); // JST
  let y = now.getUTCFullYear();
  const t = Date.UTC(y, Number(m) - 1, Number(d));
  if (t - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) > 30 * 86400000) y--;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

(function main() {
  // ===== yahoofinance.csv: 日付とランキング売買代金（円） =====
  const yLines = fs.readFileSync(INPUT_YAHOO, 'utf8').split(/\r?\n/).filter(Boolean).map(unquote);

  let yahooDateISO = null;
  for (const line of yLines) {
    const m = line.match(/更新日時：(\d{4})\/(\d{2})\/(\d{2})/);
    if (m) {
      yahooDateISO = `${m[1]}-${m[2]}-${m[3]}`;
      break;
    }
  }
  if (!yahooDateISO) throw new Error('yahoofinance: 更新日時が見つかりません');

  const tradingValues = []; // 順位順の売買代金（円）
  for (let i = 0; i < yLines.length - 8; i++) {
    const rankMatch = yLines[i].match(/^(\d+)\t(.+)$/);
    if (!rankMatch) continue;
    const code = yLines[i + 1].trim();
    const board = yLines[i + 3].trim();
    const price = yLines[i + 4].trim();
    const tv = yLines[i + 8].trim();
    if (!/^[0-9A-Z]{4,5}$/.test(code)) continue;
    if (board !== '掲示板') continue;
    if (!isNumberOnlyLine(price) || !isNumberOnlyLine(tv)) continue;
    tradingValues[Number(rankMatch[1]) - 1] = Number(tv.replace(/,/g, ''));
    i += 8;
  }
  if (tradingValues.length < 10) throw new Error(`yahoofinance: ランキング抽出不足 (${tradingValues.length}件)`);

  // ===== nikkeisijo.csv: 日付とプライム売買代金（百万円→円） =====
  const sLines = fs.readFileSync(INPUT_SIJO, 'utf8').split(/\r?\n/).filter(Boolean).map(unquote);

  let sijoDateISO = null;
  for (let i = 0; i < sLines.length - 2; i++) {
    if (sLines[i].trim() !== '日経平均(円)') continue;
    const dm = sLines[i + 1].trim().match(/^(\d{1,2})\/(\d{1,2})(?:\s|$)/);
    if (dm) {
      sijoDateISO = mdToISO(dm[1], dm[2]);
      break;
    }
  }
  if (!sijoDateISO) throw new Error('nikkeisijo: 日付が見つかりません');

  let primeValueYen = null;
  for (const line of sLines) {
    if (!line.includes('\t')) continue;
    const cols = line.split('\t').map(c => c.trim());
    if (cols[0] === '売買代金' && cols[1] && cols[1].includes('百万円')) {
      const v = cols[1].replace(/[,百万円]/g, '');
      if (/^\d+$/.test(v)) primeValueYen = Number(v) * 1e6;
      break;
    }
  }
  if (!primeValueYen) throw new Error('nikkeisijo: プライム売買代金が見つかりません');

  // ===== 日付整合チェック =====
  if (yahooDateISO !== sijoDateISO) {
    throw new Error(`日付不一致: yahoofinance=${yahooDateISO}, nikkeisijo=${sijoDateISO}`);
  }
  const dateISO = yahooDateISO;

  // ===== 比率算出 =====
  const targets = [
    { name: '先導株比率1～3位', topN: 3 },
    { name: '先導株比率10位', topN: 10 },
    { name: '先導株比率20位', topN: 20 },
    { name: '先導株比率30位', topN: 30 },
    { name: '先導株比率40位', topN: 40 },
    { name: '先導株比率50位', topN: 50 },
  ];

  for (const t of targets) {
    if (tradingValues.length < t.topN) {
      console.log(`skip: ${t.name}（ランキングが${tradingValues.length}件しかありません）`);
      continue;
    }
    const sum = tradingValues.slice(0, t.topN).reduce((a, b) => a + b, 0);
    const ratio = (sum / primeValueYen * 100).toFixed(2);
    const outPath = path.join(OUT_DIR, `${sanitizeFilename(t.name)}.csv`);
    appendIfNotExists(outPath, dateISO, ratio, ratio, ratio, ratio);
    console.log('saved:', outPath, `ratio=${ratio}%`, 'date:', dateISO);
  }
})();

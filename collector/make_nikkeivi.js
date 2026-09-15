const fs = require('fs');
const path = require('path');

const INPUT = path.join('data', 'nikkeivi.csv');
const OUT_DIR = path.join('data', 'pricedata');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function unquote(s) {
  return s.replace(/^\uFEFF?"/, '').replace(/"$/, '').trim();
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

// 最終行の日付だけを取得（ファイル末尾のみ読む）
function getLastDate(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const stat = fs.fstatSync(fd);
    const readSize = Math.min(stat.size, 128);
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    const tail = buf.toString('utf8');
    const lines = tail.split(/\r?\n/).filter(Boolean);
    const lastLine = lines[lines.length - 1];
    return lastLine ? lastLine.split(',')[0] : null;
  } finally {
    fs.closeSync(fd);
  }
}
 
function appendIfNotExists(outPath, dateISO, open, high, low, close) {
  const header = 'Date,Open,High,Low,Close,Volume,TradingValue,UpLimit,LowLimit';
  const newLine = `${dateISO},${open},${high},${low},${close},,,,`;

  if (!fs.existsSync(outPath)) {
    fs.writeFileSync(outPath, `${header}\n${newLine}\n`, 'utf8');
    return;
  }

  // 最終行の日付だけ読んで重複チェック
  const lastDate = getLastDate(outPath);
  if (lastDate === dateISO) return;

  // 重複なし → 末尾に追記のみ
  fs.appendFileSync(outPath, `${newLine}\n`, 'utf8');
}

(function main() {
  ensureDir(OUT_DIR);

  const rawLines = fs.readFileSync(INPUT, 'utf8').split(/\r?\n/).filter(Boolean);
  const lines = rawLines.map(unquote);

  // ===== 銘柄名・終値・日付を構造で検出 =====
  let targetName = null;
  let close = null;
  let dateISO = null;

  const dateLineRe = /(20\d{2})\.(\d{2})\.(\d{2})\s*\(/;

  for (let i = 0; i < lines.length - 2; i++) {
    const nameCandidate = lines[i].trim();
    const closeCandidate = lines[i + 1]?.trim();
    const infoCandidate = lines[i + 2]?.trim();

    if (!nameCandidate) continue;
    if (isNumberOnlyLine(nameCandidate)) continue;
    if (!isNumberOnlyLine(closeCandidate)) continue;

    const m = infoCandidate.match(dateLineRe);
    if (!m) continue;

    targetName = nameCandidate;
    close = toNumStr(closeCandidate);
    dateISO = `${m[1]}-${m[2]}-${m[3]}`;
    break;
  }

  if (!targetName || !close || !dateISO) {
    throw new Error('銘柄名 / 終値 / 日付 を特定できません');
  }

  // ===== 始値・高値・安値 =====
  function findFirstValue(prefix) {
    const row = lines.find(s => s.startsWith(prefix + '\t') || s.startsWith(prefix + ' '));
    if (!row) return null;

    const parts = row.split(/\t+/);
    if (parts.length >= 2 && isNumberOnlyLine(parts[1])) {
      return toNumStr(parts[1]);
    }

    const m = row.match(/-?\d{1,3}(?:,\d{3})*(?:\.\d+)?|-?\d+(?:\.\d+)?/);
    return m ? toNumStr(m[0]) : null;
  }

  const open = findFirstValue('始値');
  const high = findFirstValue('高値');
  const low  = findFirstValue('安値');

  if (!open || !high || !low) {
    throw new Error(`始値/高値/安値の抽出失敗 open=${open}, high=${high}, low=${low}`);
  }

  const outPath = path.join(OUT_DIR, `${sanitizeFilename(targetName)}.csv`);
  appendIfNotExists(outPath, dateISO, open, high, low, close);

  console.log('saved:', outPath, 'date:', dateISO);
})();

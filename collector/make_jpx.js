const fs = require('fs');
const path = require('path');

const INPUT = path.join('data', 'jpx.csv');
const OUT_DIR = path.join('data', 'pricedata');
const HEADER = 'Date,Open,High,Low,Close,Volume,TradingValue,UpLimit,LowLimit';

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
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

const lines = fs.readFileSync(INPUT, 'utf8').split(/\r?\n/);

// jpx.csv から「データ更新日時」行を探して日付を抽出
let dataDate = null;
for (const line of lines) {
  const row = line.replace(/^"|"$/g, '');
  // 「データ更新日時	2026/01/29 16:55」のような行を探す
  const match = row.match(/^データ更新日時\s+(\d{4})\/(\d{2})\/(\d{2})/);
  if (match) {
    dataDate = `${match[1]}-${match[2]}-${match[3]}`;
    break;
  }
}

if (!dataDate) {
  console.error('データ更新日時が見つかりません');
  process.exit(1);
}

// 収集しない指数（指示により出力対象から除外）
const excludeNames = new Set([
  'TOPIXレバレッジ（2倍）指数',
  'TOPIXインバース(-1倍)指数',
  'TOPIXダブルインバース(-2倍)指数',
  '東証REITレバレッジ（2倍）指数',
  '東証REITインバース（-1倍）指数',
  '東証REITダブルインバース（-2倍）指数',
  'JPXプライム150指数',
  'JPXスタートアップ急成長100指数',
]);

let readData = false;

for (const line of lines) {
  const row = line.replace(/^"|"$/g, '');
  if (!row) continue;

  // データ開始ヘッダ
  if (row.startsWith('指数名\t現在値\t前日比\t始値\t高値\t安値')) {
    readData = true;
    continue;
  }

  if (!readData) continue;

  // セクション終了
  if (row === '先頭に戻る') {
    readData = false;
    continue;
  }

  const cols = row.split('\t');
  if (cols.length < 7) continue;

  const name = cols[0].trim();
  if (excludeNames.has(name)) continue;
  const close = cols[1].replace(/,/g, '');
  const open  = cols[4].replace(/,/g, '');
  const high  = cols[5].replace(/,/g, '');
  const low   = cols[6].replace(/,/g, '');

  if ([open, high, low, close].some(v => v === '--' || v === '')) continue;

  const safeName = name.replace(/[\\\/:*?"<>|]/g, '_');
  const outPath = path.join(OUT_DIR, `${safeName}.csv`);

  const newLine =
`${dataDate},${open},${high},${low},${close},,,,`;

  // ファイルが無い → 新規作成
  if (!fs.existsSync(outPath)) {
    fs.writeFileSync(outPath, `${HEADER}\n${newLine}\n`, 'utf8');
    continue;
  }

  // 最終行の日付だけ読んで重複チェック
  const lastDate = getLastDate(outPath);
  if (lastDate === dataDate) continue;

  // 重複なし → 末尾に追記のみ
  fs.appendFileSync(outPath, `${newLine}\n`, 'utf8');
}

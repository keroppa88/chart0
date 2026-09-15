const fs = require('fs');
const path = require('path');

const INPUT = path.join('data', 'usa.csv');
const OUT_DIR = path.join('data', 'pricedata');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

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

function appendIfNotExists(outPath, dateISO, open, high, low, close, volume) {
  const header = 'Date,Open,High,Low,Close,Volume,TradingValue,UpLimit,LowLimit';
  const newLine = `${dateISO},${open},${high},${low},${close},${volume || ''},,,`;

  if (!fs.existsSync(outPath)) {
    fs.writeFileSync(outPath, `${header}\n${newLine}\n`, 'utf8');
    return;
  }

  const lastDate = getLastDate(outPath);
  if (lastDate === dateISO) return;

  fs.appendFileSync(outPath, `${newLine}\n`, 'utf8');
}

function sanitizeFilename(name) {
  return name.replace(/[\\\/:*?"<>|]/g, '_').trim();
}

(function main() {
  ensureDir(OUT_DIR);

  const rawLines = fs.readFileSync(INPUT, 'utf8').split(/\r?\n/).filter(Boolean);
  const rows = rawLines.map(parseCSVLine);

  // 日付取得 (行3の更新日時: "2026/01/29 16:00:00")
  let defaultDateISO = null;
  for (const row of rows) {
    if (row[0] && /^\d{4}\/\d{2}\/\d{2}/.test(row[0])) {
      const m = row[0].match(/^(\d{4})\/(\d{2})\/(\d{2})/);
      if (m) {
        defaultDateISO = `${m[1]}-${m[2]}-${m[3]}`;
        break;
      }
    }
  }
  if (!defaultDateISO) throw new Error('日付を取得できません');

  // 指数データ（古い形式: 列2=コード, 列4=終値, 列5=始値, 列6=高値, 列7=安値）
  const indices = [
    { file: 'NYダウ.csv', code: 'INDEXDJX:.DJI', name: 'NYダウ' },
    { file: 'S&P500.csv', code: 'INDEXSP:.INX', name: 'S&P500' },
    { file: 'ナスダック.csv', code: 'INDEXNASDAQ:.IXIC', name: 'ナスダック' },
    { file: 'ラッセル2000.csv', code: 'INDEXRUSSELL:RUT', name: 'ラッセル2000' },
    { file: 'SOX指数.csv', code: 'INDEXNASDAQ:SOX', name: 'SOX指数' },
  ];

  for (const idx of indices) {
    const row = rows.find(r => r[2] === idx.code);
    if (!row) {
      console.log(`${idx.name} (${idx.code}) が見つかりません`);
      continue;
    }
    // 列4=終値, 列5=始値, 列6=高値, 列7=安値
    const close = row[4];
    const open = row[5];
    const high = row[6];
    const low = row[7];

    if (!close || !open || !high || !low) {
      console.log(`${idx.name}: データ不足 close=${close}, open=${open}, high=${high}, low=${low}`);
      continue;
    }

    const outPath = path.join(OUT_DIR, idx.file);
    appendIfNotExists(outPath, defaultDateISO, open, high, low, close);
    console.log('saved:', outPath, 'date:', defaultDateISO);
  }

  // 個別銘柄データ（新形式: 列0=コード, 列1=銘柄, 列2=始値, 列3=高値, 列4=安値, 列5=終値, 列7=取引日）
  const stocks = [
    { file: 'アップル.csv', code: 'NASDAQ:AAPL', name: 'アップル' },
    { file: 'マイクロソフト.csv', code: 'NASDAQ:MSFT', name: 'マイクロソフト' },
    { file: 'グーグル.csv', code: 'NASDAQ:GOOG', name: 'グーグル' },
    { file: 'アマゾン.csv', code: 'NASDAQ:AMZN', name: 'アマゾン' },
    { file: 'エヌビディア.csv', code: 'NASDAQ:NVDA', name: 'エヌビディア' },
    { file: 'メタ.csv', code: 'NASDAQ:META', name: 'メタ' },
    { file: 'テスラ.csv', code: 'NASDAQ:TSLA', name: 'テスラ' },
    { file: 'アーク.csv', code: 'BATS:ARKK', name: 'アーク' },
    { file: 'マイクロン.csv', code: 'NASDAQ:MU', name: 'マイクロン' },
    { file: 'AMD.csv', code: 'NASDAQ:AMD', name: 'AMD' },
    { file: 'インテル.csv', code: 'NASDAQ:INTC', name: 'インテル' },
    { file: 'アーム.csv', code: 'NASDAQ:ARM', name: 'アーム' },
    { file: 'ブロードコム.csv', code: 'NASDAQ:AVGO', name: 'ブロードコム' },
    { file: 'クアルコム.csv', code: 'NASDAQ:QCOM', name: 'クアルコム' },
    { file: 'ASML(蘭).csv', code: 'AMS:ASML', name: 'ASML(蘭)' },
    { file: 'TSMC(台).csv', code: 'TPE:2330', name: 'TSMC(台)' },
    { file: 'サムスン(韓).csv', code: 'KRX:005930', name: 'サムスン(韓)' },
    { file: 'テンセント(中).csv', code: 'HKG:0700', name: 'テンセント(中)' },
    { file: 'アリババ(中).csv', code: 'BCBA:BABA', name: 'アリババ(中)' },
    { file: 'パランティア.csv', code: 'NASDAQ:PLTR', name: 'パランティア' },
    { file: 'SAP(独).csv', code: 'ETR:SAP', name: 'SAP(独)' },
    { file: 'VW(独).csv', code: 'ETR:VOW3', name: 'VW(独)' },
    { file: 'BASF(独).csv', code: 'ETR:BAS', name: 'BASF(独)' },
    { file: 'バークシャーH.csv', code: 'NYSE:BRK.B', name: 'バークシャーH' },
    { file: 'JPモルガン.csv', code: 'NYSE:JPM', name: 'JPモルガン' },
    { file: 'GS.csv', code: 'NYSE:GS', name: 'GS' },
    { file: 'HSBC(英).csv', code: 'LON:HSBA', name: 'HSBC(英)' },
    { file: 'BNPパリバ(仏).csv', code: 'EPA:BNP', name: 'BNPパリバ(仏)' },
    { file: 'LVMH(仏).csv', code: 'EPA:MC', name: 'LVMH(仏)' },
    { file: 'ウォルマート.csv', code: 'NASDAQ:WMT', name: 'ウォルマート' },
    { file: 'マクドナルド.csv', code: 'NYSE:MCD', name: 'マクドナルド' },
    { file: 'オラクル.csv', code: 'NYSE:ORCL', name: 'オラクル' },
    { file: 'SKハイニクス.csv', code: 'KRX:000660', name: 'SKハイニクス' },
    { file: 'Xiaomi(中).csv', code: 'HKG:1810', name: 'Xiaomi(中)' },
    { file: 'BYD(中).csv', code: 'SHE:002594', name: 'BYD(中)' },
    { file: 'SMIC(中).csv', code: 'HKG:0981', name: 'SMIC(中)' },
    { file: 'NAURA(中).csv', code: 'SHE:002371', name: 'NAURA(中)' },
  ];

  for (const stock of stocks) {
    // 新形式データを検索（列0=コード）
    const row = rows.find(r => r[0] === stock.code);
    if (!row) {
      console.log(`${stock.name} (${stock.code}) が見つかりません`);
      continue;
    }

    // 列2=始値, 列3=高値, 列4=安値, 列5=終値, 列6=出来高
    const open = row[2];
    const high = row[3];
    const low = row[4];
    const close = row[5];
    const volume = row[6];

    if (!close || !open || !high || !low) {
      console.log(`${stock.name}: データ不足 open=${open}, high=${high}, low=${low}, close=${close}`);
      continue;
    }

    // 日付は更新日時（defaultDateISO）に統一する（休日対応）
    const dateISO = defaultDateISO;

    const outPath = path.join(OUT_DIR, stock.file);
    appendIfNotExists(outPath, dateISO, open, high, low, close, volume);
    console.log('saved:', outPath, 'date:', dateISO);
  }

  // M7時価総額
  let marketCapValue = null;
  for (const row of rows) {
    if (row[5] === '時価総額') {
      marketCapValue = row[6];
      break;
    }
  }

  if (marketCapValue) {
    const outPath = path.join(OUT_DIR, 'M7時価総額.csv');
    appendIfNotExists(outPath, defaultDateISO, marketCapValue, marketCapValue, marketCapValue, marketCapValue);
    console.log('saved:', outPath, 'date:', defaultDateISO);
  } else {
    console.log('M7時価総額の値が見つかりません');
  }
})();

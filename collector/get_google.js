// ●Google スプレッドシート（公開pubhtml・指数の四本値）
// npm i playwright
// get_usa.js と同じ方式（iframe対応＋td セルを行ごとにCSV化）で取得する

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ●サイトアドレス
const urls = [
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS7eH7iB8R0rTlZvLUFT7gWiVbQDm5DiwzHqOcvE-ocLaya7mYdRAcNGhBwf6QAGCtIz1u0Jk9692D3/pubhtml?gid=0&single=true'
];

// スプレッドシートからデータを取得する関数
async function fetchSpreadsheetData(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(3000); // 描画完了待ち

  // iframeがあればその中を取得、なければメインページから取得
  let frame = page;
  const iframeElement = await page.$('iframe');
  if (iframeElement) {
    const contentFrame = await iframeElement.contentFrame();
    if (contentFrame) frame = contentFrame;
  }

  // 表のセルデータを取得してCSV形式に変換
  const text = await frame.evaluate(() => {
    const selectors = ['table', '#sheets-viewport table', '.sheet-table', 'table.waffle'];
    let table = null;
    for (const sel of selectors) {
      table = document.querySelector(sel);
      if (table) break;
    }
    if (!table) return '';

    const rows = table.querySelectorAll('tr');
    const csvRows = [];

    for (const row of rows) {
      const cells = row.querySelectorAll('td'); // thは行番号なので除外
      const rowData = [];
      for (const cell of cells) {
        let cellText = cell.innerText.trim();
        cellText = cellText.replace(/"/g, '""');
        rowData.push(`"${cellText}"`);
      }
      if (rowData.length > 0) {
        csvRows.push(rowData.join(','));
      }
    }
    return csvRows.join('\n');
  });

  return text;
}

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const allData = [];
  for (let i = 0; i < urls.length; i++) {
    console.log(`Fetching source ${i + 1}: ${urls[i]}`);
    const data = await fetchSpreadsheetData(page, urls[i]);
    if (data) allData.push(data);
  }

  const mergedText = allData.join('\n');

  // ●保存先ディレクトリ & ファイル
  const dataDir = path.join(__dirname, 'data');
  const filename = path.join(dataDir, 'google.csv');

  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  // CSV保存（BOM付きUTF-8）
  const csvContent = '\uFEFF' + mergedText;
  fs.writeFileSync(filename, csvContent, 'utf8');
  console.log('saved:', filename);

  await browser.close();
})();

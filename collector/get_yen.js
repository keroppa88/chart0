// ●くりっく365
// npm i playwright
//月：午前7時10分、火～金曜日：午前7時55分。～価格取得時の価格

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

//●サイトアドレス
(async () => {
  const url = 'https://www.click365.jp/market.html';

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
// ページを開く（軽めの待機設定）
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  
// 数秒だけ待つ（描画・JS実行待機）← 必要に応じて秒数調整
  await page.waitForTimeout(3000);
  
// ページ全体の表示テキストを取得
  const text = await page.innerText('body');

  // 保存先ディレクトリ & ファイル
  const dataDir = path.join(__dirname, 'data');
  const filename = path.join(dataDir, 'yen.csv');

  // dataフォルダが無ければ作成
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir);
  }

  // CSV生成　改行ごとに1行として書き込む
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  let csvContent = '\uFEFF'; // BOM
  for (const line of lines) {
    csvContent += `"${line.replace(/"/g, '""')}"\n`;
  }

  fs.writeFileSync(filename, csvContent, 'utf8');
  console.log('saved:', filename);

  await browser.close();
})();

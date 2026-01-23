// financedataフォルダ内にあるCSVを把握して、それらの最新財務情報を取得して追記する。

 const https = require('https');
 const fs = require('fs');
 const path = require('path');

 const API_KEY = process.env.JQUANTS_API_KEY;
 const API_URL = "https://api.jquants.com/v2";
 const DATA_DIR = path.join(__dirname, 'financedata');

 const today = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];

 async function updateAllFinance() {
     // 1. financedataフォルダ内の全CSVファイルを把握
-    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('_finance.csv'));
+    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
     console.log(`${today} の財務情報更新を開始します（対象: ${files.length} 銘柄）...`);
     
     // 2. 各ファイルに対してループ
     for (const file of files) {
-        // 3. ファイル名から銘柄コードを抽出（例: "7203.csv" → "7203"）
+        // 3. ファイル名から銘柄コードを抽出（例: "7203.csv" → "7203"）
         const code = path.basename(file, '.csv');
         
         // 4. その銘柄コードでAPI要求
         await appendFinanceData(code);
         await new Promise(resolve => setTimeout(resolve, 1000));
     }
     
     console.log("\n✅ すべての銘柄の財務情報追記処理が完了しました。");
 }

 async function appendFinanceData(code) {
     // 5. 銘柄コードを使ってAPIリクエスト
     let allData = [];
     let paginationKey = "";
     
     try {
         do {
             const params = new URLSearchParams({ code });
             if (paginationKey) params.set("pagination_key", paginationKey);

             const response = await new Promise((resolve, reject) => {
                 const options = {
                     hostname: 'api.jquants.com',
                     path: `/v2/fins/summary?${params.toString()}`,
                     method: 'GET',
                     headers: {
                         'x-api-key': API_KEY
                     }
                 };

                 https.get(options, (res) => {
                     let data = '';
                     res.on('data', (chunk) => { data += chunk; });
                     res.on('end', () => {
                         if (res.statusCode === 200) {
                             resolve(JSON.parse(data));
                         } else {
                             reject(new Error(`HTTP Error: ${res.statusCode}`));
                         }
                     });
                 }).on('error', reject);
             });

             allData = allData.concat(response.data || []);
             paginationKey = response.pagination_key || "";

         } while (paginationKey);

         if (allData.length > 0) {
             // 最新データ（最後の1件）のみ取得
             const latestData = allData[allData.length - 1];
-            const filePath = path.join(DATA_DIR, `${code}_finance.csv`);
+            const filePath = path.join(DATA_DIR, `${code}.csv`);
             
             const currentContent = fs.readFileSync(filePath, 'utf-8');
             
             // 5桁で末尾が0の場合は削除
             let localCode = latestData.Code || "";
             if (localCode.length === 5 && localCode.endsWith('0')) {
                 localCode = localCode.slice(0, 4);
             }
             
             // 既に存在するか確認（開示日でチェック）
             if (!currentContent.includes(latestData.DiscDate)) {
                 const needsNewline = !currentContent.endsWith('\n');
                 const newLine = (needsNewline ? '\n' : '') + 
                     `${latestData.DiscDate},${latestData.DiscTime},${localCode},${latestData.NP || ''},${latestData.EPS || ''},${latestData.BPS || ''},${latestData.FDivAnn || ''}\n`;
                 
                 fs.appendFileSync(filePath, newLine);
                 console.log(`✅ ${code}: 財務情報追記完了 (${latestData.DiscDate})`);
             } else {
                 console.log(`⚠️ ${code}: ${latestData.DiscDate} は既に存在します`);
             }
         } else {
             console.log(`➖ ${code}: 新規財務データはありません`);
         }
     } catch (e) {
         console.error(`❌ ${code} エラー:`, e.message);
     }
 }

 updateAllFinance();

// dataフォルダ内にあるCSVを把握して、それらの最新株価を取得して追記する。

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.JQUANTS_API_KEY;
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = path.join(__dirname, 'data');

const today = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];

async function updateAllStocks() {
// 1. dataフォルダ内の全CSVファイルを把握
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
    console.log(`${today} のデータ更新を開始します（対象: ${files.length} 銘柄）...`);
// 2. 各ファイルに対してループ
    for (const file of files) {
// 3. ファイル名から銘柄コードを抽出（例: "7203.csv" → "7203"）
        const code = path.basename(file, '.csv');
// 4. その銘柄コードでAPI要求
        await appendDailyData(code);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log("\n✅ すべての銘柄の追記処理が完了しました。");
}

async function appendDailyData(code) {
 // 5. 銘柄コードを使ってAPIリクエスト
    const params = new URLSearchParams({ code, date: today });
    
    try {
        const res = await fetch(`${API_URL}/equities/bars/daily?${params}`, {
            headers: { "x-api-key": API_KEY }
        });
        
        if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
        
        const json = await res.json();
        
        if (json.data && json.data.length > 0) {
            const d = json.data[0];
            const filePath = path.join(DATA_DIR, `${code}.csv`);
            
            const currentContent = fs.readFileSync(filePath, 'utf-8');
            if (!currentContent.includes(d.Date)) {
                const needsNewline = !currentContent.endsWith('\n');
                const newLine = (needsNewline ? '\n' : '') + `${d.Date},${d.AdjO ?? d.O},${d.AdjH ?? d.H},${d.AdjL ?? d.L},${d.AdjC ?? d.C},${d.AdjVo ?? d.Vo}\n`;
// 6. 取得したデータをCSVに追記  
                fs.appendFileSync(filePath, newLine);
                console.log(`✅ ${code}: 追記完了`);
            } else {
                console.log(`⚠️ ${code}: ${d.Date} は既に存在します`);
            }
        } else {
            console.log(`➖ ${code}: 本日のデータはありません（休場日など）`);
        }
    } catch (e) {
        console.error(`❌ ${code} エラー:`, e.message);
    }
}

updateAllStocks();

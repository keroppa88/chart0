const fs = require('fs');
const path = require('path');

const API_KEY = process.env.JQUANTS_API_KEY;
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = path.join(__dirname, 'data');

const today = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];

async function updateAllStocks() {
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
    console.log(`${today} のデータ更新を開始します（対象: ${files.length} 銘柄）...`);
    
    for (const file of files) {
        const code = path.basename(file, '.csv');
        await appendDailyData(code);
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    console.log("\n✅ すべての銘柄の追記処理が完了しました。");
}

async function appendDailyData(code) {
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
            
            const newLine = `${d.Date},${d.AdjO ?? d.O},${d.AdjH ?? d.H},${d.AdjL ?? d.L},${d.AdjC ?? d.C},${d.AdjVo ?? d.Vo}\n`;
            
            const currentContent = fs.readFileSync(filePath, 'utf-8');
            if (!currentContent.includes(d.Date)) {
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

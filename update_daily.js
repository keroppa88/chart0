const fs = require('fs');
const path = require('path');

// 設定項目
const API_KEY = "oUB089Am_3qKFu97x7Qh6AvCkIRA3HfsKbG4iTLQCVM";
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = path.join(__dirname, 'data');

// 実行時の日本時間（YYYY-MM-DD）を取得
const today = new Date(Date.now() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];

async function updateAllStocks() {
    // dataフォルダ内の全CSVファイルから銘柄コードを取得
    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
    console.log(`${today} のデータ更新を開始します（対象: ${files.length} 銘柄）...`);

    for (const file of files) {
        const code = path.basename(file, '.csv');
        await appendDailyData(code);
        // API負荷軽減（1秒待機）
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

            // 追記する1行を作成（Date,Open,High,Low,Close,Volume）
            const newLine = `${d.Date},${d.AdjO ?? d.O},${d.AdjH ?? d.H},${d.AdjL ?? d.L},${d.AdjC ?? d.C},${d.AdjVo ?? d.Vo}\n`;

            // 重複チェック後に追記
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
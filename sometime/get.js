const fs = require('fs');
const path = require('path');

// 設定項目
const API_KEY = ""; // 
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = __dirname; // スクリプトと同じ場所に出力
const TARGET_STOCKS = ["1929","9984","6502"];

// 保存先フォルダの作成
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

/**
 * 調整後株価（AdjO, AdjH, AdjL, AdjC, AdjVo）を使用してCSVに変換する
 */
function convertToCsv(data) {
    const header = "Date,Open,High,Low,Close,Volume\n";
    const rows = data.map(d => {
        const date = d.Date || "";
        // 調整後カラム（Adj～）を優先的に取得
        const open = d.AdjO ?? d.O ?? "0";
        const high = d.AdjH ?? d.H ?? "0";
        const low = d.AdjL ?? d.L ?? "0";
        const close = d.AdjC ?? d.C ?? "0";
        const volume = d.AdjVo ?? d.Vo ?? "0";
        
        return `${date},${open},${high},${low},${close},${volume}`;
    }).join("\n");
    return header + rows;
}

/**
 * 銘柄ごとのデータを取得してCSV保存する
 */
async function fetchAndSave(code) {
    let allData = [];
    let paginationKey = "";
    
    try {
        do {
            const params = new URLSearchParams({
                code: code,
                from: "2024-07-20",
            });
            if (paginationKey) params.set("pagination_key", paginationKey);
            
            const res = await fetch(`${API_URL}/equities/bars/daily?${params}`, {
                headers: { "x-api-key": API_KEY }
            });
            
            if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
            
            const body = await res.json();
            allData = allData.concat(body.data || []);
            paginationKey = body.pagination_key || "";
        } while (paginationKey);
        
        if (allData.length > 0) {
            const csvContent = convertToCsv(allData);
            fs.writeFileSync(path.join(DATA_DIR, `${code}.csv`), csvContent);
            console.log(`✅成功: ${code}.csv (${allData.length}件)`);
        }
    } catch (e) {
        console.error(`❌エラー ${code}:`, e.message);
    }
}

/**
 * メイン実行処理
 */
async function main() {
    console.log("データ取得を

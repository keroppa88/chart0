const fs = require('fs');
const path = require('path');

// 設定項目
const API_KEY = "oUB089Am_3qKFu97x7Qh6AvCkIRA3HfsKbG4iTLQCVM"; // ダッシュボードから発行したキーを入力
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = path.join(__dirname, 'public/data');
const TARGET_STOCKS = ["1332","1605","1721","1801","1802","1803","1808","1812","1925","1928","1963","2002","2269",
"2282","2413","2432","2501","2502","2503","2768","2801","2802","2871","2914","3086","3092",
"3099","3289","3382","3401","3402","3405","3407","3436","3659","3697","3861","4004","4005",
"4021","4042","4043","4061","4062","4063","4151","4183","4188","4208","4307","4324","4385",
"4452","4502","4503","4506","4507","4519","4523","4543","4568","4578","4661","4689","4704",
"4751","4755","4901","4902","4911","5019","5020","5101","5108","5201","5214","5233","5301",
"5332","5333","5401","5406","5411","5631","5706","5711","5713","5714","5801","5802","5803",
"5831","6098","6103","6113","6146","6178","6273","6301","6302","6305","6326","6361","6367",
"6471","6472","6473","6479","6501","6503","6504","6506","6526","6532","6645","6674","6701",
"6702","6723","6724","6752","6753","6758","6762","6770","6841","6857","6861","6902","6920",
"6952","6954","6963","6971","6976","6981","6988","7004","7011","7012","7013","7186","7201",
"7202","7203","7205","7211","7261","7267","7269","7270","7272","7453","7731","7733","7735",
"7741","7751","7752","7832","7911","7912","7951","7974","8001","8002","8015","8031","8035",
"8053","8058","8233","8252","8253","8267","8304","8306","8308","8309","8316","8331","8354",
"8411","8591","8601","8604","8630","8697","8725","8750","8766","8795","8801","8802","8804",
"8830","9001","9005","9007","9008","9009","9020","9021","9022","9064","9101","9104","9107",
"9147","9201","9202","9432","9433","9434","9501","9502","9503","9531","9532","9602","9735",
"9766","9843","9983","9984"];

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
                from: "2021-01-20",
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
    console.log("データ取得を開始します...");
    for (const code of TARGET_STOCKS) {
        await fetchAndSave(code);
        // レートリミット（Lightプラン: 60req/分）を考慮して1秒待機
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log("すべての処理が完了しました。");
}

main();
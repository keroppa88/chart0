// 指定した銘柄コードのみ全履歴を取得して data/コード.csv に保存する。
// 使い方: CODES="7485,1234" node sometime/get_codes.js
// （allchartlistに登録済みなのにCSVが無い銘柄の補修用。ロジックは get.js と同一）

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.JQUANTS_API_KEY;
const API_URL = "https://api.jquants.com/v2";
const DATA_DIR = path.join(__dirname, '..', 'data');

const TARGET_STOCKS = (process.env.CODES || "")
    .split(/[,\s]+/)
    .map(s => s.trim())
    .filter(Boolean);

if (TARGET_STOCKS.length === 0) {
    console.error("CODES 環境変数に銘柄コードを指定してください（例: CODES=7485）");
    process.exit(1);
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// 取得開始日: 実行日から過去5年（J-Quants Lightプランの提供範囲。
// 提供範囲より古くてもAPIはある分だけ返すので厳密でなくてよい）
const FROM_DATE = new Date(Date.now() + 9 * 60 * 60 * 1000 - 5 * 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

function convertToCsv(data) {
    const header = "Date,Open,High,Low,Close,Volume,TradingValue,UpLimit,UnderLimit\n";
    const rows = data.map(d => {
        const date = d.Date || "";
        const open = d.AdjO || "0";
        const high = d.AdjH || "0";
        const low = d.AdjL || "0";
        const close = d.AdjC || "0";
        const volume = d.AdjVo || "0";
        const tradingValue = d.Va || "0";
        const upLimit = d.UL || "0";
        const underLimit = d.LL || "0";

        return `${date},${open},${high},${low},${close},${volume},${tradingValue},${upLimit},${underLimit}`;
    }).join("\n");
    return header + rows;
}

async function fetchAll(apiCode) {
    let allData = [];
    let paginationKey = "";
    do {
        const params = new URLSearchParams({
            code: apiCode,
            from: FROM_DATE,
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
    return allData;
}

async function fetchAndSave(code) {
    // API側は普通株が5桁(末尾0)、ローカルのCSVは4桁。
    // どちらで入力されてもAPIには5桁、ファイル名は4桁を使う。
    const apiCode = code.length === 4 ? `${code}0` : code;
    const fileCode = code.length === 5 && code.endsWith("0") ? code.slice(0, 4) : code;
    try {
        let allData = await fetchAll(apiCode);

        // 5桁でヒットしない銘柄(指数等)のために入力コードそのままでも再試行
        if (allData.length === 0 && apiCode !== code) {
            console.log(`  ${apiCode}: 0件のため ${code} で再試行`);
            allData = await fetchAll(code);
        }

        if (allData.length > 0) {
            const csvContent = convertToCsv(allData);
            fs.writeFileSync(path.join(DATA_DIR, `${fileCode}.csv`), csvContent);
            console.log(`✅成功: ${fileCode}.csv (${allData.length}件)`);
        } else {
            console.warn(`⚠データ0件: ${code}`);
        }
    } catch (e) {
        console.error(`❌エラー ${code}:`, e.message);
        process.exitCode = 1;
    }
}

async function main() {
    console.log(`データ取得を開始します: ${TARGET_STOCKS.join(", ")}`);
    for (const code of TARGET_STOCKS) {
        await fetchAndSave(code);
        // レートリミット（Lightプラン: 60req/分）を考慮して1秒待機
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    console.log("すべての処理が完了しました。");
}

main();

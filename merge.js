const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data'); 
const OUTPUT_FILE = path.join(__dirname, 'combined_long.csv');

const dayOfWeek = ["日", "月", "火", "水", "木", "金", "土"];

function merge() {
    if (!fs.existsSync(DATA_DIR)) {
        console.error("エラー: dataフォルダが見つかりません。");
        return;
    }

    const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.csv'));
    
    // ヘッダー行から「日種類」を削除し、4カラムに設定
    let output = "\ufeff日付,曜日,商品名,数値\n";

    files.forEach(file => {
        const code = path.basename(file, '.csv');
        const content = fs.readFileSync(path.join(DATA_DIR, file), 'utf-8');
        const lines = content.trim().split('\n').slice(1);

        lines.forEach(line => {
            const [date, open, high, low, close, volume] = line.split(',');
            if (!date) return;

            const d = new Date(date);
            const weekday = dayOfWeek[d.getDay()];

            // 「平日」列を省いて書き出し
            output += `${date},${weekday},${code}始値,${open}\n`;
            output += `${date},${weekday},${code}高値,${high}\n`;
            output += `${date},${weekday},${code}安値,${low}\n`;
            output += `${date},${weekday},${code}終値,${close}\n`;
            output += `${date},${weekday},${code}出来高,${volume}\n`;
        });
        console.log(`統合中: ${code}`);
    });

    fs.writeFileSync(OUTPUT_FILE, output);
    console.log(`\n✅ 完了: ${OUTPUT_FILE} を作成しました（4カラム形式）。`);
}

merge();
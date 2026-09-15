// ●日経 国内株式指標（nikkeisijo.csv）から市況ボードの値を抽出
// 「指標名」「M/D 時刻等」「現在値」の3行パターンを検出する
// （日経平均(円)、ドル(円)、NYダウ(ドル)、FTSE100、上海総合、長期金利 など）

const fs = require('fs');
const path = require('path');

const INPUT = path.join('data', 'nikkeisijo.csv');
const OUT_DIR = path.join('data', 'pricedata');
const HEADER = 'Date,Open,High,Low,Close,Volume,TradingValue,UpLimit,LowLimit';

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

function unquote(s) {
  return s.replace(/^﻿?"/, '').replace(/"$/, '').trim();
}

function sanitizeFilename(name) {
  return name.replace(/[\\\/:*?"<>|]/g, '_').trim();
}

function getLastDate(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const stat = fs.fstatSync(fd);
    const readSize = Math.min(stat.size, 128);
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, stat.size - readSize);
    const tail = buf.toString('utf8');
    const tlines = tail.split(/\r?\n/).filter(Boolean);
    const lastLine = tlines[tlines.length - 1];
    return lastLine ? lastLine.split(',')[0] : null;
  } finally {
    fs.closeSync(fd);
  }
}

function appendIfNotExists(outPath, dateISO, open, high, low, close) {
  const newLine = `${dateISO},${open},${high},${low},${close},,,,`;
  if (!fs.existsSync(outPath)) {
    fs.writeFileSync(outPath, `${HEADER}\n${newLine}\n`, 'utf8');
    return;
  }
  if (getLastDate(outPath) === dateISO) return;
  fs.appendFileSync(outPath, `${newLine}\n`, 'utf8');
}

// M/D（年なし）から日付を補完。未来日付になる場合は前年とみなす
function mdToISO(m, d) {
  const now = new Date(Date.now() + 9 * 3600 * 1000); // JST
  let y = now.getUTCFullYear();
  const t = Date.UTC(y, Number(m) - 1, Number(d));
  if (t - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) > 30 * 86400000) y--;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

(function main() {
  const lines = fs.readFileSync(INPUT, 'utf8').split(/\r?\n/).filter(Boolean).map(unquote);

  const dateLineRe = /^(\d{1,2})\/(\d{1,2})(?:\s|$)/;
  // 「160.04-05」のような気配値にも対応し、先頭の数値のみ取る
  const valueRe = /^-?[\d,]+(?:\.\d+)?/;

  let count = 0;
  let boardDateISO = null; // 日経平均の日付。テーブル抽出の日付として使う

  // 市況ボードの銘柄は他ソースと重複するため記録しない（日付の特定にのみ使う）
  for (let i = 0; i < lines.length - 2; i++) {
    if (lines[i].trim() !== '日経平均(円)') continue;
    const dm = lines[i + 1].trim().match(dateLineRe);
    if (dm && valueRe.test(lines[i + 2].trim())) {
      boardDateISO = mdToISO(dm[1], dm[2]);
      break;
    }
  }

  // ===== 国内の株式指標・東証 テーブル =====
  if (boardDateISO) {
    const tDate = boardDateISO;
    const results = {}; // 出力名 -> 値（文字列）

    function num(s) {
      const t = (s || '').replace(/[,億円百万倍％%株]/g, '').trim();
      return /^-?\d+(?:\.\d+)?$/.test(t) ? Number(t) : null;
    }

    let section = null;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.includes('\t')) {
        if (/^(純資産倍率|株価収益率|株式益回り|平均配当利回り|売買高・売買代金・騰落銘柄数)/.test(line)) {
          section = RegExp.$1;
        }
        continue;
      }
      const cols = line.split('\t').map(c => c.trim());
      const name = cols[0];

      // 時価総額（普通株式ベース）: プライム/スタンダード/グロース（億円→兆円）
      if (/^[(（]普通株式ベース[)）]$/.test(name) && cols[1] && cols[1].includes('億円')
          && !('プライム時価総額（兆円）' in results)) {
        const p = num(cols[1]), s = num(cols[2]), g = num(cols[3]);
        if (p != null && s != null && g != null) {
          results['プライム時価総額（兆円）'] = (p / 10000).toFixed(4);
          results['スタンダード時価総額（兆円）'] = (s / 10000).toFixed(4);
          results['グロース時価総額（兆円）'] = (g / 10000).toFixed(4);
          results['東証普通株時価総額（兆円）'] = ((p + s + g) / 10000).toFixed(4);
          results['プライム時価総額比率/全市場'] = (p / (p + s + g) * 100).toFixed(2);
        }
        continue;
      }

      if (section === '純資産倍率') {
        const map = { '日経平均': '日経PBR', 'プライム全銘柄': 'プライムPBR', 'スタンダード全銘柄': 'スタンダードPBR', 'グロース全銘柄': 'グロースPBR' };
        if (map[name] && num(cols[1]) != null) results[map[name]] = String(num(cols[1]));
      } else if (section === '株価収益率') {
        const map = { '日経平均': '日経平均PER予想', 'プライム全銘柄': 'プライムPER予想', 'スタンダード全銘柄': 'スタンダードPER予想', 'グロース全銘柄': 'グロースPER予想' };
        if (map[name] && num(cols[2]) != null) results[map[name]] = String(num(cols[2]));
      } else if (section === '株式益回り') {
        if (name === 'プライム全銘柄') {
          if (num(cols[1]) != null) results['プライム株式益利回り前期基準'] = String(num(cols[1]));
          if (num(cols[2]) != null) results['プライム株式益利回り予想'] = String(num(cols[2]));
        }
      } else if (section === '平均配当利回り') {
        if (name === 'プライム全銘柄') {
          if (num(cols[1]) != null) results['プライム配当前期'] = String(num(cols[1]));
          if (num(cols[2]) != null) results['プライム配当予想'] = String(num(cols[2]));
        }
      } else if (section === '売買高・売買代金・騰落銘柄数') {
        // 列順: プライム / スタンダード / グロース
        const markets = ['プライム', 'スタンダード', 'グロース'];
        if (name === '売買代金') {
          markets.forEach((mkt, k) => {
            const v = num(cols[k + 1]);
            if (v != null) results[`${mkt}売買代金（兆円）`] = (v / 1e6).toFixed(6);
          });
        } else if (['値上がり銘柄数', '値下がり銘柄数', '商い成立銘柄数'].includes(name)) {
          markets.forEach((mkt, k) => {
            const v = num(cols[k + 1]);
            if (v != null) results[`${mkt}${name}`] = String(v);
          });
        } else if (name === '年初来高値更新銘柄数' || name === '年初来安値更新銘柄数') {
          const short = name.replace('更新銘柄数', '銘柄数');
          markets.forEach((mkt, k) => {
            const v = num(cols[k + 1]);
            if (v != null) results[`${mkt}${short}`] = String(v);
          });
        }
      }
    }

    // 値上がり率 = 値上がり銘柄数 / 商い成立銘柄数（%）
    for (const mkt of ['プライム', 'スタンダード', 'グロース']) {
      const up = Number(results[`${mkt}値上がり銘柄数`]);
      const total = Number(results[`${mkt}商い成立銘柄数`]);
      if (up > 0 && total > 0) results[`${mkt}値上がり率`] = (up / total * 100).toFixed(2);
    }

    for (const [name, value] of Object.entries(results)) {
      const outPath = path.join(OUT_DIR, `${sanitizeFilename(name)}.csv`);
      appendIfNotExists(outPath, tDate, value, value, value, value);
      console.log('saved:', outPath, 'date:', tDate);
      count++;
    }
  }

  if (count === 0) throw new Error('指標データを1件も抽出できません');
  console.log(`total: ${count}`);
})();

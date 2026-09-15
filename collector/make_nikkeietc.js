// ●日経平均ヒストリカルデータ・日次サマリー（nikkeietc.csv）から各指標を抽出
// 時価総額・売買代金（対市場占有率含む）、PBR/PER/配当利回り、騰落銘柄数、
// セクター別ウェート・騰落寄与度を、ページ表記のままの数値（加工なし）で記録する

const fs = require('fs');
const path = require('path');

const INPUT = path.join('data', 'nikkeietc.csv');
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

function appendIfNotExists(outPath, dateISO, value) {
  const newLine = `${dateISO},${value},${value},${value},${value},,,,`;
  if (!fs.existsSync(outPath)) {
    fs.writeFileSync(outPath, `${HEADER}\n${newLine}\n`, 'utf8');
    return;
  }
  if (getLastDate(outPath) === dateISO) return;
  fs.appendFileSync(outPath, `${newLine}\n`, 'utf8');
}

// 「1,017.40 兆円」「17.69倍」「1.56%」「154銘柄」「-3.68円」→ 数値部分のみ（カンマ除去）
function num(s) {
  const m = (s || '').match(/-?[\d,]+(?:\.\d+)?/);
  return m ? m[0].replace(/,/g, '') : null;
}

(function main() {
  const lines = fs.readFileSync(INPUT, 'utf8').split(/\r?\n/).filter(Boolean).map(unquote);

  // 日付（「2026年6月12日(金)」）
  let dateISO = null;
  for (const line of lines) {
    const m = line.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日\(/);
    if (m) {
      dateISO = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`;
      break;
    }
  }
  if (!dateISO) throw new Error('日付を特定できません');

  const results = {}; // 出力名 -> 値

  // 「ラベル行の次の行」を値として取る系
  function after(label, offset = 1) {
    const i = lines.findIndex(s => s === label);
    return i >= 0 ? lines[i + offset] : null;
  }

  // 配当利回り / PER / PBR （ヘッダ行 → 単純平均|加重平均 → 値 → 指数ベース → 値）
  function ratioSection(header, avgLabel, nameAvg, nameIdx) {
    const i = lines.findIndex(s => s === header);
    if (i < 0) return;
    if (lines[i + 1] === avgLabel) {
      const v = num(lines[i + 2]);
      if (v != null) results[nameAvg] = v;
    }
    if (lines[i + 3] === '指数ベース') {
      const v = num(lines[i + 4]);
      if (v != null) results[nameIdx] = v;
    }
  }

  ratioSection('配当利回り', '単純平均', '日経平均配当利回り（単純平均）', '日経平均配当利回り（指数）');
  ratioSection('株価収益率(PER)', '加重平均', '日経平均PER（加重平均）', '日経平均PER（指数）');
  ratioSection('株価純資産倍率(PBR)', '加重平均', '日経平均PBR（加重平均）', '日経平均PBR（指数）');

  // 時価総額合計 / 売買代金合計（値 →「(対市場占有率 xx.xx%)」）
  function capSection(header, nameValue, nameShare) {
    const i = lines.findIndex(s => s === header);
    if (i < 0) return;
    const v = num(lines[i + 1]);
    if (v != null) results[nameValue] = v;
    const m = (lines[i + 2] || '').match(/対市場占有率\s*(-?[\d,.]+)%/);
    if (m) results[nameShare] = m[1].replace(/,/g, '');
  }

  capSection('時価総額合計', '日経平均時価総額', '日経平均時価総額・対市場占有率');
  capSection('売買代金合計', '日経平均売買代金', '日経平均売買代金・対市場占有率');

  // 騰落銘柄数（「上昇：」「154銘柄」/「下落：」「71銘柄」）
  const up = num(after('上昇：'));
  const down = num(after('下落：'));
  if (up != null) results['日経平均上昇銘柄数'] = up;
  if (down != null) results['日経平均下落銘柄数'] = down;

  // セクター別ウェート / セクター別騰落寄与度
  // ヘッダ行のあとに「セクター名」「値」のペアが並ぶ（軸目盛りの数値行は無視）
  const sectors = ['技術', '金融', '消費', '素材', '資本財・その他', '運輸・公共'];
  function sectorSection(header, nameFn) {
    const i = lines.findIndex(s => s === header);
    if (i < 0) return;
    for (let j = i + 1; j < Math.min(i + 40, lines.length - 1); j++) {
      const sIdx = sectors.indexOf(lines[j]);
      if (sIdx < 0) continue;
      const v = num(lines[j + 1]);
      if (v != null) results[nameFn(sectors[sIdx])] = v;
      j++;
      if (sIdx === sectors.length - 1) break;
    }
  }

  sectorSection('セクター別ウェート', s =>
    s === '資本財・その他' || s === '運輸・公共' ? `日経${s}ウェート` : `日経${s}セクターウェート`);
  sectorSection('セクター別騰落寄与度', s =>
    s === '資本財・その他' || s === '運輸・公共' ? `日経${s}騰落寄与度` : `日経${s}セクター騰落寄与度`);

  let count = 0;
  for (const [name, value] of Object.entries(results)) {
    const outPath = path.join(OUT_DIR, `${sanitizeFilename(name)}.csv`);
    appendIfNotExists(outPath, dateISO, value);
    console.log('saved:', outPath, `value=${value}`, 'date:', dateISO);
    count++;
  }

  if (count === 0) throw new Error('指標を1件も抽出できません');
  console.log(`total: ${count}`);
})();

// appendExcelToJson.js
// Purpose: Append new Excel data to existing football_data.json
// Keeps ALL keys consistent with server.js

import XLSX from 'xlsx';
import fs from 'fs';

const EXISTING_JSON = 'football_data.json';  // ✅ Your existing JSON file
const NEW_EXCEL = process.argv[2] || 'footballPrediction_new.xlsx';  // ✅ New Excel file
const OUTPUT_JSON = 'football_data.json';  // ✅ Output (same as input = append)

// ✅ Helper: Convert value to number or null
function toNum(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = typeof val === 'string' ? parseFloat(val) : Number(val);
  return isNaN(n) ? null : n;
}

// ✅ Helper: Build match_id (consistent format)
function buildMatchId(homeTeam, awayTeam, date, index) {
  const h = homeTeam?.replace(/\s+/g, '_') || 'Unknown';
  const a = awayTeam?.replace(/\s+/g, '_') || 'Unknown';
  const d = date || new Date().toISOString();
  return `${h}_${a}_${d}_${index}`;
}

// ✅ Helper: Convert Excel row to JSON object (EXACT same keys as existing)
function excelRowToJson(dataRow, headerRow, index) {
  // ✅ Find column index by keyword
  const findCol = (keywords) => {
    for (let i = 0; i < headerRow.length; i++) {
      const header = String(headerRow[i] || '').toLowerCase().trim();
      if (keywords.some(k => header.includes(k.toLowerCase()))) {
        return i;
      }
    }
    return -1;
  };
  
  // ✅ Extract values with fallback
  const homeTeam = String(dataRow[findCol(['home team', 'home'])] || dataRow[0] || '');
  const awayTeam = String(dataRow[findCol(['away team', 'away'])] || dataRow[1] || '');
  
  if (!homeTeam || !awayTeam) return null;  // Skip invalid rows
  
  // ✅ Build document with EXACT same keys as your existing JSON
  return {
    // 🔑 REQUIRED KEYS (server.js uses these - DO NOT CHANGE)
    match_id: buildMatchId(homeTeam, awayTeam, dataRow[findCol(['match date', 'date'])], index),
    teams: `${homeTeam} vs ${awayTeam}`,
    date: dataRow[findCol(['match date', 'date'])] || new Date().toISOString(),
    
    // 🔑 ODDS (server.js uses these)
    homeOverallOdds: toNum(dataRow[findCol(['home overall odds'])]),
    drawOverallOdds: toNum(dataRow[findCol(['draw overall odds', 'draw odds'])]),
    awayOverallOdds: toNum(dataRow[findCol(['away overall odds'])]),
    
    // 🔑 ADJUSTED (server.js uses these)
    homeAdjustedDecimal: toNum(dataRow[findCol(['home adjusted decimal', 'home adjusted'])]),
    drawAdjustedDecimal: toNum(dataRow[findCol(['draw adjusted decimal', 'draw adjusted'])]),
    awayAdjustedDecimal: toNum(dataRow[findCol(['away adjusted decimal', 'away adjusted'])]),
    
    // 🔑 MARKET (COH/COD/COA - server.js uses these)
    coh: toNum(dataRow[findCol(['coh', 'home market odds', 'home co'])]),
    cod: toNum(dataRow[findCol(['cod', 'draw market odds', 'draw co'])]),
    coa: toNum(dataRow[findCol(['coa', 'away market odds', 'away co'])]),
    
    // 🔑 PROBABILITY (server.js uses these)
    homeWinProbability: toNum(dataRow[findCol(['home win probability', 'home win prob'])]),
    drawProbability: toNum(dataRow[findCol(['draw probability', 'draw prob'])]),
    awayWinProbability: toNum(dataRow[findCol(['away win probability', 'away win prob'])]),
    
    // 🔑 LAST 6 PROBABILITY (server.js uses these)
    homeLast6Probability: toNum(dataRow[findCol(['home last6 probability', 'home last 6 prob'])]),
    drawLast6Probability: toNum(dataRow[findCol(['draw last6 probability', 'draw last 6 prob'])]),
    awayLast6Probability: toNum(dataRow[findCol(['away last6 probability', 'away last 6 prob'])]),
    
    // 🔑 RATES (server.js uses these)
    homeWinRate: toNum(dataRow[findCol(['home win rate', 'home rate'])]),
    drawRate: toNum(dataRow[findCol(['draw rate'])]),
    awayWinRate: toNum(dataRow[findCol(['away win rate', 'away rate'])]),
    scoringRate: toNum(dataRow[findCol(['scoring rate', 'score rate'])]),
    
    // 🔑 LAST 6 STATS (server.js uses these)
    homeLast6Points: toNum(dataRow[findCol(['home last6 points', 'home last 6 points', 'home pts'])]),
    homeLast6GoalsGD: toNum(dataRow[findCol(['home last6 goals (gd)', 'home last6 gd', 'home gd'])]),
    awayLast6Points: toNum(dataRow[findCol(['away last6 points', 'away last 6 points', 'away pts'])]),
    awayLast6GoalsGD: toNum(dataRow[findCol(['away last6 goals (gd)', 'away last6 gd', 'away gd'])]),
    
    // 🔑 RANKING (server.js uses these)
    homeRanking: toNum(dataRow[findCol(['home ranking', 'home rank', 'home position'])]),
    awayRanking: toNum(dataRow[findCol(['away ranking', 'away rank', 'away position'])]),
    
    // 🔑 RESULT (server.js uses these)
    fthgActual: toNum(dataRow[findCol(['fthg', 'fthg actual', 'home score'])]),
    ftagActual: toNum(dataRow[findCol(['ftag', 'ftag actual', 'away score'])]),
    
    // 🔑 CONTEXT (server.js uses these)
    context: dataRow[findCol(['context', 'league', 'competition'])] || 'Five Major League',
    week: toNum(dataRow[findCol(['week'])]),
    
    // 🔑 TEAMS (server.js uses these)
    homeTeam: homeTeam,
    awayTeam: awayTeam,
    
    // 🔑 METADATA
    imported_at: new Date().toISOString(),
    created_at: new Date().toISOString()
  };
}

async function appendExcelToJson() {
  try {
    console.log('🔄 ========== APPEND EXCEL TO JSON ==========');
    
    // ✅ STEP 1: Load existing JSON (if exists)
    let existingData = [];
    if (fs.existsSync(EXISTING_JSON)) {
      console.log(`📖 Loading existing: ${EXISTING_JSON}`);
      const raw = fs.readFileSync(EXISTING_JSON, 'utf-8');
      existingData = JSON.parse(raw);
      console.log(`✅ Loaded ${existingData.length} existing records`);
    } else {
      console.log(`⚠️ ${EXISTING_JSON} not found - will create new`);
    }
    
    // ✅ STEP 2: Read NEW Excel file
    console.log(`📁 Reading new Excel: ${NEW_EXCEL}`);
    if (!fs.existsSync(NEW_EXCEL)) {
      throw new Error(`File not found: ${NEW_EXCEL}`);
    }
    
    const workbook = XLSX.readFile(NEW_EXCEL);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: "" });
    
    // ✅ Find header row
    let hIdx = -1;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      if (rows[i].some(c => typeof c === 'string' && c.toLowerCase().includes("home"))) {
        hIdx = i;
        break;
      }
    }
    if (hIdx === -1) hIdx = 0;
    
    const headerRow = rows[hIdx] || [];
    console.log(`📊 Found header at row ${hIdx}, ${headerRow.length} columns`);
    
    // ✅ STEP 3: Convert NEW Excel rows to JSON
    let newDocuments = [];
    const existingIds = new Set(existingData.map(d => d.match_id));
    let skipped = 0;
    
    for (let rowIdx = hIdx + 1; rowIdx < rows.length; rowIdx++) {
      const dataRow = rows[rowIdx] || [];
      if (dataRow.length === 0) continue;
      
      const doc = excelRowToJson(dataRow, headerRow, rowIdx);
      if (!doc) {
        skipped++;
        continue;
      }
      
      // ✅ Skip if match_id already exists (avoid duplicates)
      if (existingIds.has(doc.match_id)) {
        console.log(`⚠️ Skip duplicate: ${doc.match_id}`);
        skipped++;
        continue;
      }
      
      newDocuments.push(doc);
    }
    
    console.log(`📊 Converted ${newDocuments.length} new records (skipped ${skipped})`);
    
    // ✅ STEP 4: Append new to existing
    const combinedData = [...existingData, ...newDocuments];
    console.log(`📊 Total records after append: ${combinedData.length}`);
    
    // ✅ STEP 5: Save to JSON
    fs.writeFileSync(OUTPUT_JSON, JSON.stringify(combinedData, null, 2), 'utf-8');
    console.log(`✅ Saved to: ${OUTPUT_JSON}`);
    
    // ✅ STEP 6: Preview
    if (newDocuments.length > 0) {
      console.log('\n🔍 Preview first new record:');
      console.log(JSON.stringify(newDocuments[0], null, 2));
    }
    
    console.log('\n👉 Next: Run `node importToMongo.js` to import to MongoDB');
    console.log('🔄 ========== DONE ==========');
    
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('\n💡 Tips:');
    console.error('   - Check if Excel file is closed');
    console.error('   - Check if JSON file has valid format');
    console.error('   - Run with: node appendExcelToJson.js <new-file.xlsx>');
  }
}

appendExcelToJson();
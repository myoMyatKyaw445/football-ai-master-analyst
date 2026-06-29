// convertExcelToJson.js
import XLSX from 'xlsx';
import fs from 'fs';

async function convert() {
  try {
    console.log('📖 Reading Excel file...');
    
    // Read Excel
    const workbook = XLSX.readFile('footballPrediction.xlsx');
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    console.log(`📊 Found ${data.length} rows`);
    
    // Format to match importToMongo.js structure + keep ALL columns
    const formattedData = data.map((row, index) => {
      // ✅ Build match_id
      const matchId = row['Match Date'] && row['Home Team'] && row['Away Team'] 
        ? `${row['Home Team'].replace(/\s+/g, '_')}_${row['Away Team'].replace(/\s+/g, '_')}_${row['Match Date']}`
        : `match_${index}`;
      
      // ✅ Build teams string
      const teams = `${row['Home Team'] || ''} vs ${row['Away Team'] || ''}`;
      
      // ✅ Build result string from FTHG/FTAG if available
      const fthg = row['FTHG (Actual)'];
      const ftag = row['FTAG (Actual)'];
      const result = (fthg !== undefined && ftag !== undefined) 
        ? `${fthg}-${ftag}` 
        : (row['FTR'] || row['Result'] || '');
      
      return {
        // ✅ Required fields for importToMongo.js
        match_id: matchId,
        teams: teams,
        date: row['Match Date'] || '',
        odds: {
          home: parseFloat(row['COH'] || row['Home Overall Odds'] || 0) || 0,
          draw: parseFloat(row['COD'] || row['Draw Overall Odds'] || 0) || 0,
          away: parseFloat(row['COA'] || row['Away Overall Odds'] || 0) || 0
        },
        result: result,
        context: row['League'] || row['Competition'] || 'Unknown',
        
        // ✅ ALL Excel columns preserved
        homeTeam: row['Home Team'] || '',
        awayTeam: row['Away Team'] || '',
        homeWinProbability: parseFloat(row['Home Win Probability (%)'] || 0),
        drawProbability: parseFloat(row['Draw Probability (%)'] || 0),
        awayWinProbability: parseFloat(row['Away Win Probability (%)'] || 0),
        homeOverallOdds: parseFloat(row['Home Overall Odds'] || 0),
        drawOverallOdds: parseFloat(row['Draw Overall Odds'] || 0),
        awayOverallOdds: parseFloat(row['Away Overall Odds'] || 0),
        homeLast6Probability: parseFloat(row['Home Last6 Probability (%)'] || 0),
        drawLast6Probability: parseFloat(row['Draw Last6 Probability (%)'] || 0),
        awayLast6Probability: parseFloat(row['Away Last6 Probability (%)'] || 0),
        homeWinRate: parseFloat(row['Home Win Rate'] || 0),
        drawRate: parseFloat(row['Draw Rate'] || 0),
        awayWinRate: parseFloat(row['Away Win Rate'] || 0),
        homeLast6Points: row['Home Last6 Points'] !== undefined ? parseInt(row['Home Last6 Points']) : null,
        homeLast6GoalsGD: row['Home Last6 Goals (GD)'] !== undefined ? parseInt(row['Home Last6 Goals (GD)']) : null,
        awayLast6Points: row['Away Last6 Points'] !== undefined ? parseInt(row['Away Last6 Points']) : null,
        awayLast6GoalsGD: row['Away Last6 Goals (GD)'] !== undefined ? parseInt(row['Away Last6 Goals (GD)']) : null,
        homeRanking: row['Home Ranking'] !== undefined ? parseInt(row['Home Ranking']) : null,
        awayRanking: row['Away Ranking'] !== undefined ? parseInt(row['Away Ranking']) : null,
        scoringRate: row['Scoring Rate'] !== undefined ? parseInt(row['Scoring Rate']) : null,
        homeAdjustedDecimal: parseFloat(row['Home Adjusted Decimal'] || 0),
        drawAdjustedDecimal: parseFloat(row['Draw Adjusted Decimal'] || 0),
        awayAdjustedDecimal: parseFloat(row['Away Adjusted Decimal'] || 0),
        coh: parseFloat(row['COH'] || 0),
        cod: parseFloat(row['COD'] || 0),
        coa: parseFloat(row['COA'] || 0),
        fthgActual: row['FTHG (Actual)'] !== undefined ? parseInt(row['FTHG (Actual)']) : null,
        ftagActual: row['FTAG (Actual)'] !== undefined ? parseInt(row['FTAG (Actual)']) : null,
        week: row['Week'] !== undefined ? parseInt(row['Week']) : null,
        
        // ✅ Timestamp
        imported_at: new Date().toISOString()
      };
    });
    
    // Save to JSON
    fs.writeFileSync('football_data.json', JSON.stringify(formattedData, null, 2), 'utf-8');
    
    console.log(`✅ Success! Converted ${formattedData.length} records`);
    console.log('📁 Saved to: football_data.json');
    console.log('\n👉 Now run: node importToMongo.js');
    
    // ✅ Preview first record
    console.log('\n🔍 Preview first record:');
    console.log(JSON.stringify(formattedData[0], null, 2));
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error('\n💡 Tips:');
    console.error('   - Make sure footballPrediction.xlsx is in the same folder');
    console.error('   - Check if the file is open in Excel (close it first)');
  }
}

convert();
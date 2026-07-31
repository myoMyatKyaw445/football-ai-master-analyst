// server.js - Vercel Optimized Version
// Features: File Upload, Team Search, Number Search, Auto-Detect Lower Odds, 
//           Sort by Distance + Deduplication + Priority CO Sorting, Progressive Pagination, 
//           Google Login, Chat History, AI Predictions, Enhanced Market Odds Analysis,
//           Odds Range Analysis (CO vs Target Range), User Tracking, MASTER ANALYSIS
//           ✅ OPTIMIZED FOR VERCEL SERVERLESS & STREAMING

import express from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import multer from 'multer';
import XLSX from 'xlsx';
import 'dotenv/config';
// ... (အပေါ်က Import များပြီးနောက်)

import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

// ES Module အတွက် __dirname ရယူခြင်း
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ✅ Read index.html once at startup
const indexPath = join(process.cwd(), 'index.html');
let indexHtmlContent = '';

try {
  indexHtmlContent = readFileSync(indexPath, 'utf-8');
  console.log('✅ index.html loaded successfully');
} catch (err) {
  console.error('❌ Could not load index.html:', err.message);
  console.error('💡 Make sure index.html is in the root folder of your repository');
}

// ... (ကျန်ရှိသော Code များ)
// ✅ Import Google Login Module (separate file)
import { setupGoogleLogin } from './googleLogin.js';

const app = express();

// ✅ Vercel CORS Configuration
app.use(cors({
  origin: true, // Allow all origins for Vercel preview deployments
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));

// ✅ Initialize Google Login
setupGoogleLogin(app);

const upload = multer({ storage: multer.memoryStorage() });

// ✅ MongoDB Connection Setup
const client = new MongoClient(process.env.MONGO_URI, {
  serverSelectionTimeoutMS: 30000,
  socketTimeoutMS: 90000,
  connectTimeoutMS: 30000,
  retryWrites: true,
  retryReads: true,
  heartbeatFrequencyMS: 10000,
  maxPoolSize: 10,
  minPoolSize: 5
});

let db;
let dbConnectPromise = null;

async function initDB() {
  if (db) return db;
  if (dbConnectPromise) return dbConnectPromise;

  dbConnectPromise = client.connect()
    .then(() => {
      db = client.db('football_ai');
      console.log('✅ MongoDB Connected');
      return db;
    })
    .catch((err) => {
      console.error('❌ MongoDB Connection Error:', err.message);
      dbConnectPromise = null;
      throw err;
    });

  return dbConnectPromise;
}

// ✅ Helper Functions
function toNum(val) {
  if (val === null || val === undefined) return null;
  const n = typeof val === 'string' ? parseFloat(val) : Number(val);
  return isNaN(n) ? null : n;
}

// ✅ Enhanced Streaming for Vercel
async function streamText(text, res, delay = 30) {
  for (let i = 0; i < text.length; i++) {
    res.write(text[i]);
    
    // ✅ Force flush for Vercel compatibility
    if (typeof res.flush === 'function') res.flush();
    if (res.socket && !res.socket.destroyed) {
      res.socket.uncork?.();
    }
    
    // ✅ Add delay to prevent buffering
    await new Promise(resolve => setTimeout(resolve, delay));
    
    // ✅ Force empty write every 50 chars to trigger nginx flush
    if (i % 50 === 0 && i > 0) {
      res.write('');
    }
  }
}

function getTeamKeywords(teamName) {
  if (!teamName) return [];
  const clean = teamName.toLowerCase().trim();
  const parts = clean.split(/\s+/);
  const skipWords = ['fc', 'vs', 'the', 'of', 'and', 'a', 'an', 'us', 'la'];
  return parts.filter(p => p.length > 2 && !skipWords.includes(p));
}

function isNumberSearch(msg) {
  const nums = msg.match(/\d+\.?\d*/g);
  return nums && nums.length > 0;
}

function isListMatchesRequest(msg) {
  const lowerMsg = msg.toLowerCase().trim();
  const keywords = [
    'မေးလို့ရတဲ့ပွဲ', 'ပွဲတွေဖော်ပြ', 'ပွဲအကုန်', 'available match',
    'list match', 'show match', 'all match', 'ဘယ်ပွဲ', 'what match',
    'which team', 'ဘယ်အသင်း', 'ပွဲစာရင်း', 'match list', 'ရှိတဲ့ပွဲ'
  ];
  return keywords.some(k => lowerMsg.includes(k));
}

// ✅ AI Prediction Engine
function generatePrediction(uploadedMatch, historicalMatches, activeSide) {
  try {
    const matchesWithResults = historicalMatches.filter(h => 
      h.m.fthgActual !== null && h.m.ftagActual !== null && 
      h.m.fthgActual !== undefined && h.m.ftagActual !== undefined
    );
    
    if (matchesWithResults.length === 0) {
      return {
        recommendation: "⚠️ သမိုင်းကြောင်း ဒေတာ မတွေ့ရသဖြင့် ခန့်မှန်းချက် ပေးနိုင်မည် မဟုတ်ပါ။",
        confidence: 0,
        reasoning: []
      };
    }
    
    let homeWins = 0, awayWins = 0, draws = 0;
    let homeGoals = 0, awayGoals = 0;
    let totalMatches = matchesWithResults.length;
    
    matchesWithResults.forEach(h => {
      const homeScore = h.m.fthgActual;
      const awayScore = h.m.ftagActual;
      homeGoals += homeScore;
      awayGoals += awayScore;
      if (homeScore > awayScore) homeWins++;
      else if (awayScore > homeScore) awayWins++;
      else draws++;
    });
    
    const homeWinRate = ((homeWins / totalMatches) * 100).toFixed(1);
    const awayWinRate = ((awayWins / totalMatches) * 100).toFixed(1);
    const drawRate = ((draws / totalMatches) * 100).toFixed(1);
    const avgHomeGoals = (homeGoals / totalMatches).toFixed(2);
    const avgAwayGoals = (awayGoals / totalMatches).toFixed(2);
    
    let recommendation, confidence, reasoning = [];
    
    if (activeSide === 'home') {
      if (homeWinRate >= 60) {
        recommendation = "🏆 Home Win (အိမ်ရှင် အနိုင်)";
        confidence = Math.min(95, parseFloat(homeWinRate) + 15);
        reasoning.push(`• သမိုင်းကြောင်း ပွဲ ${totalMatches} ပွဲတွင် အိမ်ရှင် ${homeWins} ပွဲ နိုင်ခဲ့သည် (${homeWinRate}%)`);
      } else if (homeWinRate >= 45) {
        recommendation = "⚖️ Home Win or Draw (အိမ်ရှင် အနိုင် သို့မဟုတ် သရေ)";
        confidence = Math.min(85, parseFloat(homeWinRate) + parseFloat(drawRate) + 10);
        reasoning.push(`• အိမ်ရှင် နိုင်ခြင်း (${homeWinRate}%) + သရေ (${drawRate}%) = ${parseFloat(homeWinRate)+parseFloat(drawRate)}%`);
      } else if (drawRate >= 40) {
        recommendation = "🤝 Draw (သရေ)";
        confidence = Math.min(80, parseFloat(drawRate) + 20);
        reasoning.push(`• သရေ ဖြစ်နှုန်း မြင့်မားသည် (${drawRate}%)`);
      } else {
        recommendation = "⚠️ Uncertain (ခန့်မှန်းရခက်)";
        confidence = 50;
        reasoning.push(`• ရလဒ်များ ကွဲပြားနေသည် - Home:${homeWinRate}% Draw:${drawRate}% Away:${awayWinRate}%`);
      }
      if (parseFloat(avgHomeGoals) > parseFloat(avgAwayGoals) + 0.5) {
        reasoning.push(`• ပျမ်းမျှ ဂိုး: အိမ်ရှင် ${avgHomeGoals} vs အဝေး ${avgAwayGoals} (အိမ်ရှင် ဂိုးပိုများ)`);
      }
    } else {
      if (awayWinRate >= 60) {
        recommendation = "🏆 Away Win (အဝေးသင်း အနိုင်)";
        confidence = Math.min(95, parseFloat(awayWinRate) + 15);
        reasoning.push(`• သမိုင်းကြောင်း ပွဲ ${totalMatches} ပွဲတွင် အဝေးသင်း ${awayWins} ပွဲ နိုင်ခဲ့သည် (${awayWinRate}%)`);
      } else if (awayWinRate >= 45) {
        recommendation = "⚖️ Away Win or Draw (အဝေးသင်း အနိုင် သို့မဟုတ် သရေ)";
        confidence = Math.min(85, parseFloat(awayWinRate) + parseFloat(drawRate) + 10);
        reasoning.push(`• အဝေးသင်း နိုင်ခြင်း (${awayWinRate}%) + သရေ (${drawRate}%) = ${parseFloat(awayWinRate)+parseFloat(drawRate)}%`);
      } else if (drawRate >= 40) {
        recommendation = "🤝 Draw (သရေ)";
        confidence = Math.min(80, parseFloat(drawRate) + 20);
        reasoning.push(`• သရေ ဖြစ်နှုန်း မြင့်မားသည် (${drawRate}%)`);
      } else {
        recommendation = "⚠️ Uncertain (ခန့်မှန်းရခက်)";
        confidence = 50;
        reasoning.push(`• ရလဒ်များ ကွဲပြားနေသည် - Home:${homeWinRate}% Draw:${drawRate}% Away:${awayWinRate}%`);
      }
      if (parseFloat(avgAwayGoals) > parseFloat(avgHomeGoals) + 0.5) {
        reasoning.push(`• ပျမ်းမျှ ဂိုး: အိမ်ရှင် ${avgHomeGoals} vs အဝေး ${avgAwayGoals} (အဝေး ဂိုးပိုများ)`);
      }
    }
    
    if (totalMatches < 10) {
      reasoning.push(`⚠️ နမူနာ ပမာဏ နည်းပါးသည် (${totalMatches} ပွဲ) - ခန့်မှန်းချက် တိကျမှု နည်းနိုင်သည်`);
      confidence = Math.max(30, confidence - 20);
    } else if (totalMatches >= 30) {
      reasoning.push(`✅ နမူနာ ပမာဏ ကြီးမားသည် (${totalMatches} ပွဲ) - ခန့်မှန်းချက် ပိုမို ယုံကြည်စိတ်ချရ`);
      confidence = Math.min(95, confidence + 5);
    }
    
    return {
      recommendation,
      confidence: confidence.toFixed(1),
      reasoning,
      stats: { totalMatches, homeWins, awayWins, draws, homeWinRate, awayWinRate, drawRate, avgHomeGoals, avgAwayGoals }
    };
    
  } catch (err) {
    console.error('❌ Prediction error:', err.message);
    return { recommendation: "⚠️ ခန့်မှန်းချက် ထုတ်ယူရာတွင် အမှားဖြစ်ပွားခဲ့သည်။", confidence: 0, reasoning: [`Error: ${err.message}`] };
  }
}

// ✅ ENHANCED: Market Odds Analysis with Result-Based Pattern Matching
function generateMarketOddsAnalysis(uploadedMatch, historicalMatches, activeSide) {
  try {
    const matchesWithMarketData = historicalMatches.filter(h => 
      h.m.fthgActual !== null && h.m.ftagActual !== null &&
      h.m.coh !== null && h.m.coh !== undefined &&
      h.m.coa !== null && h.m.coa !== undefined &&
      ((activeSide === 'home' && h.m.homeOverallOdds !== null) || 
       (activeSide === 'away' && h.m.awayOverallOdds !== null))
    );
    
    if (matchesWithMarketData.length < 5) {
      return {
        recommendation: "⚠️ Market odds ဒေတာ မလုံလောက်ပါ (လိုအပ်ချက်: အနည်းဆုံး ၅ ပွဲ)",
        confidence: 0,
        reasoning: [],
        marketStats: null,
        resultPatterns: null
      };
    }
    
    let analysis = {
      totalMatches: matchesWithMarketData.length,
      weaker: { count: 0, homeWins: 0, awayWins: 0, draws: 0, results: [] },
      stronger: { count: 0, homeWins: 0, awayWins: 0, draws: 0, results: [] },
      equal: { count: 0, homeWins: 0, awayWins: 0, draws: 0, results: [] }
    };
    
    matchesWithMarketData.forEach(h => {
      const homeScore = h.m.fthgActual;
      const awayScore = h.m.ftagActual;
      const goalDiff = homeScore - awayScore;
      
      let result;
      if (homeScore > awayScore) result = 'home';
      else if (awayScore > homeScore) result = 'away';
      else result = 'draw';
      
      if (activeSide === 'home') {
        const targetOdds = h.m.homeOverallOdds !== null ? h.m.homeOverallOdds : h.m.homeAdjustedDecimal;
        const marketOdds = h.m.coh;
        if (targetOdds === null || marketOdds === null) return;
        
        const diff = marketOdds - targetOdds;
        const threshold = 0.05;
        
        const matchInfo = {
          teams: h.m.teams,
          targetOdds,
          marketOdds,
          diff: diff.toFixed(3),
          result: `${homeScore}-${awayScore}`,
          goalDiff,
          date: h.m.date
        };
        
        if (diff > threshold) {
          analysis.stronger.count++;
          if (result === 'home') analysis.stronger.homeWins++;
          else if (result === 'away') analysis.stronger.awayWins++;
          else analysis.stronger.draws++;
          analysis.stronger.results.push(matchInfo);
        } else if (diff < -threshold) {
          analysis.weaker.count++;
          if (result === 'home') analysis.weaker.homeWins++;
          else if (result === 'away') analysis.weaker.awayWins++;
          else analysis.weaker.draws++;
          analysis.weaker.results.push(matchInfo);
        } else {
          analysis.equal.count++;
          if (result === 'home') analysis.equal.homeWins++;
          else if (result === 'away') analysis.equal.awayWins++;
          else analysis.equal.draws++;
          analysis.equal.results.push(matchInfo);
        }
      } else {
        const targetOdds = h.m.awayOverallOdds !== null ? h.m.awayOverallOdds : h.m.awayAdjustedDecimal;
        const marketOdds = h.m.coa;
        if (targetOdds === null || marketOdds === null) return;
        
        const diff = marketOdds - targetOdds;
        const threshold = 0.05;
        
        const matchInfo = {
          teams: h.m.teams,
          targetOdds,
          marketOdds,
          diff: diff.toFixed(3),
          result: `${homeScore}-${awayScore}`,
          goalDiff,
          date: h.m.date
        };
        
        if (diff > threshold) {
          analysis.stronger.count++;
          if (result === 'home') analysis.stronger.homeWins++;
          else if (result === 'away') analysis.stronger.awayWins++;
          else analysis.stronger.draws++;
          analysis.stronger.results.push(matchInfo);
        } else if (diff < -threshold) {
          analysis.weaker.count++;
          if (result === 'home') analysis.weaker.homeWins++;
          else if (result === 'away') analysis.weaker.awayWins++;
          else analysis.weaker.draws++;
          analysis.weaker.results.push(matchInfo);
        } else {
          analysis.equal.count++;
          if (result === 'home') analysis.equal.homeWins++;
          else if (result === 'away') analysis.equal.awayWins++;
          else analysis.equal.draws++;
          analysis.equal.results.push(matchInfo);
        }
      }
    });
    
    const calcRate = (obj, side) => {
      if (obj.count === 0) return 0;
      return side === 'home' ? ((obj.homeWins / obj.count) * 100).toFixed(1) :
             side === 'away' ? ((obj.awayWins / obj.count) * 100).toFixed(1) :
             ((obj.draws / obj.count) * 100).toFixed(1);
    };
    
    let currentAnalysis = { type: 'unknown', diff: 0, targetOdds: null, marketOdds: null };
    
    if (activeSide === 'home') {
      const targetOdds = uploadedMatch.homeOverallOdds !== null ? uploadedMatch.homeOverallOdds : uploadedMatch.homeAdjustedDecimal;
      const marketOdds = uploadedMatch.coh;
      if (targetOdds !== null && marketOdds !== null) {
        currentAnalysis.targetOdds = targetOdds;
        currentAnalysis.marketOdds = marketOdds;
        currentAnalysis.diff = marketOdds - targetOdds;
        if (currentAnalysis.diff > 0.05) currentAnalysis.type = 'stronger';
        else if (currentAnalysis.diff < -0.05) currentAnalysis.type = 'weaker';
        else currentAnalysis.type = 'equal';
      }
    } else {
      const targetOdds = uploadedMatch.awayOverallOdds !== null ? uploadedMatch.awayOverallOdds : uploadedMatch.awayAdjustedDecimal;
      const marketOdds = uploadedMatch.coa;
      if (targetOdds !== null && marketOdds !== null) {
        currentAnalysis.targetOdds = targetOdds;
        currentAnalysis.marketOdds = marketOdds;
        currentAnalysis.diff = marketOdds - targetOdds;
        if (currentAnalysis.diff > 0.05) currentAnalysis.type = 'stronger';
        else if (currentAnalysis.diff < -0.05) currentAnalysis.type = 'weaker';
        else currentAnalysis.type = 'equal';
      }
    }
    
    let resultPatterns = null;
    const sideLabel = activeSide === 'home' ? 'Home' : 'Away';
    const oppositeSide = activeSide === 'home' ? 'Away' : 'Home';
    
    if (currentAnalysis.type !== 'unknown') {
      const patternData = analysis[currentAnalysis.type];
      
      if (patternData.count >= 3 && patternData.results.length > 0) {
        const avgGoalDiff = patternData.results.reduce((sum, r) => sum + r.goalDiff, 0) / patternData.results.length;
        const homeWinBy2Plus = patternData.results.filter(r => {
          const [h, a] = r.result.split('-').map(Number);
          return h > a && (h - a) >= 2;
        }).length;
        const awayWinBy2Plus = patternData.results.filter(r => {
          const [h, a] = r.result.split('-').map(Number);
          return a > h && (a - h) >= 2;
        }).length;
        const drawCount = patternData.results.filter(r => {
          const [h, a] = r.result.split('-').map(Number);
          return h === a;
        }).length;
        
        resultPatterns = {
          totalMatches: patternData.count,
          avgGoalDiff: avgGoalDiff.toFixed(2),
          homeWinBy2Plus,
          awayWinBy2Plus,
          drawCount,
          recentResults: patternData.results.slice(0, 5).map(r => `${r.teams}: ${r.result}`)
        };
      }
    }
    
    let recommendation, confidence, reasoning = [];
    
    if (currentAnalysis.type === 'stronger') {
      const patternData = analysis.stronger;
      const winRate = calcRate(patternData, activeSide);
      const drawRate = calcRate(patternData, 'draw');
      
      if (resultPatterns) {
        if (activeSide === 'away') {
          if (resultPatterns.awayWinBy2Plus < resultPatterns.drawCount + resultPatterns.homeWinBy2Plus) {
            recommendation = `⚖️ ${oppositeSide} Win or Draw (ကြေးပျော့ပေမယ့် ဂိုးပြတ်မနိုင်ခဲ့ဖူး)`;
            confidence = Math.min(85, 100 - parseFloat(winRate) + 15);
            reasoning.push(`• CO${activeSide === 'home' ? 'H' : 'A'} > ${activeSide === 'home' ? 'HO' : 'AO'} ဖြစ်သော ပွဲ ${patternData.count} ပွဲတွင်`);
            reasoning.push(`  ${sideLabel} ဂိုးပြတ်နိုင်ခဲ့သည်: ${resultPatterns.awayWinBy2Plus} ပွဲ သာ`);
            reasoning.push(`  သရေ/အိမ်ရှင်နိုင်: ${resultPatterns.drawCount + resultPatterns.homeWinBy2Plus} ပွဲ`);
            reasoning.push(`  ပျမ်းမျှ ဂိုးကွာခြားချက်: ${resultPatterns.avgGoalDiff} (${sideLabel} အတွက်)`);
            if (resultPatterns.recentResults.length > 0) {
              reasoning.push(`  နမူနာ ရလဒ်များ: ${resultPatterns.recentResults.slice(0, 3).join(' | ')}`);
            }
          } else {
            recommendation = `🏆 ${sideLabel} Win (ကြေးပျော့ - ဂိုးပြတ်နိုင်ခဲ့ဖူး)`;
            confidence = Math.min(90, parseFloat(winRate) + 10);
            reasoning.push(`• CO${activeSide === 'home' ? 'H' : 'A'} > ${activeSide === 'home' ? 'HO' : 'AO'} ဖြစ်သော ပွဲ ${patternData.count} ပွဲတွင်`);
            reasoning.push(`  ${sideLabel} ဂိုးပြတ်နိုင်ခဲ့သည်: ${resultPatterns.awayWinBy2Plus} ပွဲ`);
          }
        } else {
          if (resultPatterns.homeWinBy2Plus < resultPatterns.drawCount + resultPatterns.awayWinBy2Plus) {
            recommendation = `⚖️ ${oppositeSide} Win or Draw (ကြေးပျော့ပေမယ့် ဂိုးပြတ်မနိုင်ခဲ့ဖူး)`;
            confidence = Math.min(85, 100 - parseFloat(winRate) + 15);
            reasoning.push(`• COH > HO ဖြစ်သော ပွဲ ${patternData.count} ပွဲတွင်`);
            reasoning.push(`  အိမ်ရှင် ဂိုးပြတ်နိုင်ခဲ့သည်: ${resultPatterns.homeWinBy2Plus} ပွဲ သာ`);
            reasoning.push(`  သရေ/အဝေးနိုင်: ${resultPatterns.drawCount + resultPatterns.awayWinBy2Plus} ပွဲ`);
          } else {
            recommendation = `🏆 ${sideLabel} Win (ကြေးပျော့ - ဂိုးပြတ်နိုင်ခဲ့ဖူး)`;
            confidence = Math.min(90, parseFloat(winRate) + 10);
            reasoning.push(`• COH > HO ဖြစ်သော ပွဲ ${patternData.count} ပွဲတွင်`);
            reasoning.push(`  အိမ်ရှင် ဂိုးပြတ်နိုင်ခဲ့သည်: ${resultPatterns.homeWinBy2Plus} ပွဲ`);
          }
        }
      } else {
        if (parseFloat(winRate) >= 55) {
          recommendation = `🏆 ${sideLabel} Win (ကြေးပျော့ - ဈေးကွက် undervalues)`;
          confidence = Math.min(90, parseFloat(winRate) + 10);
          reasoning.push(`• CO${activeSide === 'home' ? 'H' : 'A'} (${currentAnalysis.marketOdds}) > ${activeSide === 'home' ? 'HO' : 'AO'} (${currentAnalysis.targetOdds}) ဖြစ်သော ပွဲ ${patternData.count} ပွဲတွင်`);
          reasoning.push(`  ${sideLabel} ${patternData[activeSide === 'home' ? 'homeWins' : 'awayWins']} ပွဲ နိုင်ခဲ့သည် (${winRate}%)`);
        } else if (parseFloat(drawRate) >= 40) {
          recommendation = `🤝 Draw (ကြေးပျော့ - သရေ ဖြစ်နှုန်း မြင့်)`;
          confidence = Math.min(80, parseFloat(drawRate) + 15);
          reasoning.push(`• ကြေးပျော့သော ပွဲများတွင် သရေ ဖြစ်နှုန်း မြင့်မားသည် (${drawRate}%)`);
        } else {
          recommendation = `⚠️ ကြေးပျော့သော်လည်း ရလဒ်များ ကွဲပြား`;
          confidence = 50;
          reasoning.push(`• ကြေးပျော့သော်လည်း ရလဒ်များ ကွဲပြားနေသည်`);
          reasoning.push(`  ${sideLabel}:${winRate}% Draw:${drawRate}% ${activeSide === 'home' ? 'Away' : 'Home'}:${calcRate(patternData, activeSide === 'home' ? 'away' : 'home')}%`);
        }
      }
      
    } else if (currentAnalysis.type === 'weaker') {
      const patternData = analysis.weaker;
      const winRate = calcRate(patternData, activeSide);
      const drawRate = calcRate(patternData, 'draw');
      
      if (resultPatterns) {
        if (activeSide === 'away') {
          if (resultPatterns.awayWinBy2Plus < resultPatterns.drawCount + resultPatterns.homeWinBy2Plus) {
            recommendation = `⚖️ ${oppositeSide} Win or Draw (ကြေးပြင်းပေမယ့် ဂိုးပြတ်မနိုင်ခဲ့ဖူး)`;
            confidence = Math.min(85, 100 - parseFloat(winRate) + 15);
            reasoning.push(`• CO${activeSide === 'home' ? 'H' : 'A'} < ${activeSide === 'home' ? 'HO' : 'AO'} ဖြစ်သော ပွဲ ${patternData.count} ပွဲတွင်`);
            reasoning.push(`  ${sideLabel} ဂိုးပြတ်နိုင်ခဲ့သည်: ${resultPatterns.awayWinBy2Plus} ပွဲ သာ`);
            reasoning.push(`  သရေ/အိမ်ရှင်နိုင်: ${resultPatterns.drawCount + resultPatterns.homeWinBy2Plus} ပွဲ`);
          } else {
            recommendation = `🏆 ${sideLabel} Win (ကြေးပြင်း - ဂိုးပြတ်နိုင်ခဲ့ဖူး)`;
            confidence = Math.min(90, parseFloat(winRate) + 10);
            reasoning.push(`• CO${activeSide === 'home' ? 'H' : 'A'} < ${activeSide === 'home' ? 'HO' : 'AO'} ဖြစ်သော ပွဲ ${patternData.count} ပွဲတွင်`);
            reasoning.push(`  ${sideLabel} ဂိုးပြတ်နိုင်ခဲ့သည်: ${resultPatterns.awayWinBy2Plus} ပွဲ`);
          }
        } else {
          if (resultPatterns.homeWinBy2Plus < resultPatterns.drawCount + resultPatterns.awayWinBy2Plus) {
            recommendation = `⚖️ ${oppositeSide} Win or Draw (ကြေးပြင်းပေမယ့် ဂိုးပြတ်မနိုင်ခဲ့ဖူး)`;
            confidence = Math.min(85, 100 - parseFloat(winRate) + 15);
            reasoning.push(`• COH < HO ဖြစ်သော ပွဲ ${patternData.count} ပွဲတွင်`);
            reasoning.push(`  အိမ်ရှင် ဂိုးပြတ်နိုင်ခဲ့သည်: ${resultPatterns.homeWinBy2Plus} ပွဲ သာ`);
          } else {
            recommendation = `🏆 ${sideLabel} Win (ကြေးပြင်း - ဂိုးပြတ်နိုင်ခဲ့ဖူး)`;
            confidence = Math.min(90, parseFloat(winRate) + 10);
            reasoning.push(`• COH < HO ဖြစ်သော ပွဲ ${patternData.count} ပွဲတွင်`);
            reasoning.push(`  အိမ်ရှင် ဂိုးပြတ်နိုင်ခဲ့သည်: ${resultPatterns.homeWinBy2Plus} ပွဲ`);
          }
        }
      } else {
        if (parseFloat(winRate) >= 55) {
          recommendation = `🏆 ${sideLabel} Win (ကြေးပြင်း - ဈေးကွက် overvalues)`;
          confidence = Math.min(90, parseFloat(winRate) + 10);
          reasoning.push(`• CO${activeSide === 'home' ? 'H' : 'A'} (${currentAnalysis.marketOdds}) < ${activeSide === 'home' ? 'HO' : 'AO'} (${currentAnalysis.targetOdds}) ဖြစ်သော ပွဲ ${patternData.count} ပွဲတွင်`);
          reasoning.push(`  ${sideLabel} ${patternData[activeSide === 'home' ? 'homeWins' : 'awayWins']} ပွဲ နိုင်ခဲ့သည် (${winRate}%)`);
        } else if (parseFloat(drawRate) >= 40) {
          recommendation = `🤝 Draw (ကြေးပြင်း - သရေ ဖြစ်နှုန်း မြင့်)`;
          confidence = Math.min(80, parseFloat(drawRate) + 15);
          reasoning.push(`• ကြေးပြင်းသော ပွဲများတွင် သရေ ဖြစ်နှုန်း မြင့်မားသည် (${drawRate}%)`);
        } else {
          recommendation = `⚠️ ကြေးပြင်းသော်လည်း ရလဒ်များ ကွဲပြား`;
          confidence = 50;
          reasoning.push(`• ကြေးပြင်းသော်လည်း ရလဒ်များ ကွဲပြားနေသည်`);
        }
      }
      
    } else {
      recommendation = `⚖️ ကြေးတူညီ - အခြား factors များကို ထည့်သွင်းစဉ်းစားပါ`;
      confidence = 60;
      reasoning.push(`• CO${activeSide === 'home' ? 'H' : 'A'} နဲ့ ${activeSide === 'home' ? 'HO' : 'AO'} တန်ဖိုး နီးစပ်နေသည်`);
      reasoning.push(`• အခြား factors (Last6, Ranking, etc.) ကို ထည့်သွင်းစဉ်းစားပါ`);
    }
    
    if (analysis.stronger.count + analysis.weaker.count < 10) {
      reasoning.push(`⚠️ နမူနာ ပမာဏ နည်းပါးသည် - ခန့်မှန်းချက် တိကျမှု နည်းနိုင်သည်`);
      confidence = Math.max(30, confidence - 15);
    }
    
    return {
      recommendation,
      confidence: confidence.toFixed(1),
      reasoning,
      marketStats: { ...analysis, currentMatch: { ...currentAnalysis, side: activeSide } },
      resultPatterns
    };
    
  } catch (err) {
    console.error('❌ Market odds analysis error:', err.message);
    return {
      recommendation: "⚠️ Market analysis ထုတ်ယူရာတွင် အမှားဖြစ်ပွားခဲ့သည်။",
      confidence: 0,
      reasoning: [`Error: ${err.message}`],
      marketStats: null,
      resultPatterns: null
    };
  }
}

// ✅ NEW: Odds Range Analysis - Compare COH/COA with HO-HA / AO-AA range
function generateOddsRangeAnalysis(uploadedMatch, historicalMatches, activeSide) {
  try {
    const matchesWithMarketData = historicalMatches.filter(h => 
      h.m.fthgActual !== null && h.m.ftagActual !== null &&
      h.m.coh !== null && h.m.coh !== undefined &&
      h.m.coa !== null && h.m.coa !== undefined &&
      ((activeSide === 'home' && h.m.homeOverallOdds !== null && h.m.homeAdjustedDecimal !== null) || 
       (activeSide === 'away' && h.m.awayOverallOdds !== null && h.m.awayAdjustedDecimal !== null))
    );
    
    if (matchesWithMarketData.length < 3) {
      return {
        summary: "⚠️ ဒေတာ မလုံလောက်ပါ (လိုအပ်ချက်: အနည်းဆုံး ၃ ပွဲ)",
        condition: null,
        matchingMatches: [],
        stats: null
      };
    }
    
    let currentCondition, targetLow, targetHigh, marketOdds, targetLabel;
    
    if (activeSide === 'home') {
      const ho = uploadedMatch.homeOverallOdds;
      const ha = uploadedMatch.homeAdjustedDecimal;
      const coh = uploadedMatch.coh;
      
      if (ho === null || ha === null || coh === null) {
        return { summary: "⚠️ Odds data မပြည့်စုံပါ", condition: null, matchingMatches: [], stats: null };
      }
      
      targetLow = Math.min(ho, ha);
      targetHigh = Math.max(ho, ha);
      marketOdds = coh;
      targetLabel = 'HO/HA';
      
      if (marketOdds >= targetLow && marketOdds <= targetHigh) {
        currentCondition = 'within';
      } else if (marketOdds > targetHigh) {
        currentCondition = 'above';
      } else {
        currentCondition = 'below';
      }
    } else {
      const ao = uploadedMatch.awayOverallOdds;
      const aa = uploadedMatch.awayAdjustedDecimal;
      const coa = uploadedMatch.coa;
      
      if (ao === null || aa === null || coa === null) {
        return { summary: "⚠️ Odds data မပြည့်စုံပါ", condition: null, matchingMatches: [], stats: null };
      }
      
      targetLow = Math.min(ao, aa);
      targetHigh = Math.max(ao, aa);
      marketOdds = coa;
      targetLabel = 'AO/AA';
      
      if (marketOdds >= targetLow && marketOdds <= targetHigh) {
        currentCondition = 'within';
      } else if (marketOdds > targetHigh) {
        currentCondition = 'above';
      } else {
        currentCondition = 'below';
      }
    }
    
    const matchingMatches = matchesWithMarketData.filter(h => {
      let hTargetLow, hTargetHigh, hMarketOdds;
      
      if (activeSide === 'home') {
        const ho = h.m.homeOverallOdds;
        const ha = h.m.homeAdjustedDecimal;
        const coh = h.m.coh;
        if (ho === null || ha === null || coh === null) return false;
        
        hTargetLow = Math.min(ho, ha);
        hTargetHigh = Math.max(ho, ha);
        hMarketOdds = coh;
      } else {
        const ao = h.m.awayOverallOdds;
        const aa = h.m.awayAdjustedDecimal;
        const coa = h.m.coa;
        if (ao === null || aa === null || coa === null) return false;
        
        hTargetLow = Math.min(ao, aa);
        hTargetHigh = Math.max(ao, aa);
        hMarketOdds = coa;
      }
      
      if (currentCondition === 'within') {
        return hMarketOdds >= hTargetLow && hMarketOdds <= hTargetHigh;
      } else if (currentCondition === 'above') {
        return hMarketOdds > hTargetHigh;
      } else {
        return hMarketOdds < hTargetLow;
      }
    });
    
    let homeWins = 0, awayWins = 0, draws = 0;
    let resultsList = [];
    
    matchingMatches.forEach(h => {
      const homeScore = h.m.fthgActual;
      const awayScore = h.m.ftagActual;
      
      if (homeScore > awayScore) homeWins++;
      else if (awayScore > homeScore) awayWins++;
      else draws++;
      
      resultsList.push({
        teams: h.m.teams,
        date: h.m.date,
        result: `${homeScore}-${awayScore}`,
        odds: {
          targetLow: activeSide === 'home' ? Math.min(h.m.homeOverallOdds, h.m.homeAdjustedDecimal) : Math.min(h.m.awayOverallOdds, h.m.awayAdjustedDecimal),
          targetHigh: activeSide === 'home' ? Math.max(h.m.homeOverallOdds, h.m.homeAdjustedDecimal) : Math.max(h.m.awayOverallOdds, h.m.awayAdjustedDecimal),
          market: activeSide === 'home' ? h.m.coh : h.m.coa
        }
      });
    });
    
    let conditionLabel;
    if (currentCondition === 'within') {
      conditionLabel = `CO${activeSide === 'home' ? 'H' : 'A'} (${marketOdds}) သည် ${targetLabel} Range [${targetLow}–${targetHigh}] အတွင်း ရှိသည်`;
    } else if (currentCondition === 'above') {
      conditionLabel = `CO${activeSide === 'home' ? 'H' : 'A'} (${marketOdds}) > ${targetLabel} Max (${targetHigh}) → ကြေးပျော့`;
    } else {
      conditionLabel = `CO${activeSide === 'home' ? 'H' : 'A'} (${marketOdds}) < ${targetLabel} Min (${targetLow}) → ကြေးပြင်း`;
    }
    
    const total = matchingMatches.length;
    const summary = `
📊 Odds Range Analysis Summary:
• Current: ${conditionLabel}
• Historical matches with SAME pattern: ${total} ပွဲ
• Results: 🏠 Home: ${homeWins} (${total > 0 ? ((homeWins/total)*100).toFixed(1) : 0}%) | ✈️ Away: ${awayWins} (${total > 0 ? ((awayWins/total)*100).toFixed(1) : 0}%) | 🤝 Draw: ${draws} (${total > 0 ? ((draws/total)*100).toFixed(1) : 0}%)
    `.trim();
    
    return {
      summary,
      condition: currentCondition,
      matchingMatches: resultsList.slice(0, 10),
      stats: {
        total,
        homeWins,
        awayWins,
        draws,
        homeWinRate: total > 0 ? ((homeWins/total)*100).toFixed(1) : '0',
        awayWinRate: total > 0 ? ((awayWins/total)*100).toFixed(1) : '0',
        drawRate: total > 0 ? ((draws/total)*100).toFixed(1) : '0'
      }
    };
    
  } catch (err) {
    console.error('❌ Odds range analysis error:', err.message);
    return {
      summary: "⚠️ Analysis ထုတ်ယူရာတွင် အမှားဖြစ်ပွားခဲ့သည်။",
      condition: null,
      matchingMatches: [],
      stats: null
    };
  }
}

// ✅ MASTER ANALYSIS: Target Side + CO Selection + CO Condition (3 Filters)
function generateMasterAnalysis(uploadedMatch, historicalMatches, activeSide) {
  try {
    const matchesWithFullData = historicalMatches.filter(h => 
      h.m.fthgActual !== null && h.m.ftagActual !== null &&
      h.m.coh !== null && h.m.coa !== null &&
      h.m.homeOverallOdds !== null && h.m.homeAdjustedDecimal !== null &&
      h.m.awayOverallOdds !== null && h.m.awayAdjustedDecimal !== null
    );
    
    if (matchesWithFullData.length < 3) {
      return {
        summary: "⚠️ Master Analysis အတွက် ဒေတာ မလုံလောက်ပါ (လိုအပ်ချက်: အနည်းဆုံး ၃ ပွဲ)",
        matchingMatches: [],
        stats: null,
        confidence: 0
      };
    }
    
    const currentHomeMin = Math.min(uploadedMatch.homeOverallOdds, uploadedMatch.homeAdjustedDecimal);
    const currentAwayMin = Math.min(uploadedMatch.awayOverallOdds, uploadedMatch.awayAdjustedDecimal);
    const targetSide = currentHomeMin <= currentAwayMin ? 'home' : 'away';
    const targetLabel = targetSide === 'home' ? 'HO/HA' : 'AO/AA';
    
    const currentTargetMin = targetSide === 'home' ? currentHomeMin : currentAwayMin;
    const currentTargetMax = targetSide === 'home' 
      ? Math.max(uploadedMatch.homeOverallOdds, uploadedMatch.homeAdjustedDecimal)
      : Math.max(uploadedMatch.awayOverallOdds, uploadedMatch.awayAdjustedDecimal);
    
    const selectedCO = uploadedMatch.coh <= uploadedMatch.coa ? 'COH' : 'COA';
    const marketOdds = selectedCO === 'COH' ? uploadedMatch.coh : uploadedMatch.coa;
    
    const THRESHOLD = 0.05;
    let coCondition;
    if (marketOdds >= currentTargetMin - 0.001 && marketOdds <= currentTargetMax + 0.001) {
      coCondition = 'within';
    } else if (marketOdds > currentTargetMax + THRESHOLD) {
      coCondition = 'above';
    } else if (marketOdds < currentTargetMin - THRESHOLD) {
      coCondition = 'below';
    } else {
      coCondition = 'within';
    }
    
    const matchingMatches = matchesWithFullData.filter(h => {
      const hHomeMin = Math.min(h.m.homeOverallOdds, h.m.homeAdjustedDecimal);
      const hAwayMin = Math.min(h.m.awayOverallOdds, h.m.awayAdjustedDecimal);
      const hTargetSide = hHomeMin <= hAwayMin ? 'home' : 'away';
      if (hTargetSide !== targetSide) return false;
      
      const hCOH = h.m.coh;
      const hCOA = h.m.coa;
      if (hCOH === null || hCOA === null) return false;
      const hSelectedCO = hCOH <= hCOA ? 'COH' : 'COA';
      if (hSelectedCO !== selectedCO) return false;
      
      const hMarketOdds = selectedCO === 'COH' ? hCOH : hCOA;
      const hTargetMin = targetSide === 'home' ? hHomeMin : hAwayMin;
      const hTargetMax = targetSide === 'home' 
        ? Math.max(h.m.homeOverallOdds, h.m.homeAdjustedDecimal)
        : Math.max(h.m.awayOverallOdds, h.m.awayAdjustedDecimal);
      
      let hCondition;
      if (hMarketOdds >= hTargetMin - 0.001 && hMarketOdds <= hTargetMax + 0.001) {
        hCondition = 'within';
      } else if (hMarketOdds > hTargetMax + THRESHOLD) {
        hCondition = 'above';
      } else if (hMarketOdds < hTargetMin - THRESHOLD) {
        hCondition = 'below';
      } else {
        hCondition = 'within';
      }
      
      if (hCondition !== coCondition) return false;
      
      return true;
    });
    
    if (matchingMatches.length === 0) {
      const condLabel = coCondition === 'within' ? 'ကြားထဲ' : coCondition === 'above' ? 'ကြေးပျော့' : 'ကြေးပြင်း';
      return {
        summary: `⚠️ ${targetLabel} + ${selectedCO} (${condLabel}) အခြေအနေနဲ့ ကိုက်ညီတဲ့ historical match မတွေ့ရပါ။`,
        matchingMatches: [],
        stats: null,
        confidence: 0
      };
    }
    
    let homeWins = 0, awayWins = 0, draws = 0;
    let homeWinBy1 = 0, homeWinBy2Plus = 0, awayWinBy1 = 0, awayWinBy2Plus = 0;
    let homeGoals = 0, awayGoals = 0;
    let resultsList = [];
    
    matchingMatches.forEach(h => {
      const homeScore = h.m.fthgActual;
      const awayScore = h.m.ftagActual;
      const goalDiff = homeScore - awayScore;
      
      homeGoals += homeScore;
      awayGoals += awayScore;
      
      let result, winMargin;
      if (homeScore > awayScore) {
        homeWins++;
        winMargin = homeScore - awayScore;
        if (winMargin === 1) homeWinBy1++;
        else if (winMargin >= 2) homeWinBy2Plus++;
        result = 'home';
      } else if (awayScore > homeScore) {
        awayWins++;
        winMargin = awayScore - homeScore;
        if (winMargin === 1) awayWinBy1++;
        else if (winMargin >= 2) awayWinBy2Plus++;
        result = 'away';
      } else {
        draws++;
        result = 'draw';
      }
      
      const hMarketOdds = selectedCO === 'COH' ? h.m.coh : h.m.coa;
      const hTargetMax = targetSide === 'home'
        ? Math.max(h.m.homeOverallOdds, h.m.homeAdjustedDecimal)
        : Math.max(h.m.awayOverallOdds, h.m.awayAdjustedDecimal);
      
      resultsList.push({
        teams: h.m.teams,
        date: h.m.date,
        result: `${homeScore}-${awayScore}`,
        goalDiff,
        odds: {
          selectedCO: hMarketOdds,
          selectedCODiff: (hMarketOdds - hTargetMax).toFixed(2)
        }
      });
    });
    
    const total = matchingMatches.length;
    const homeWinRate = ((homeWins / total) * 100).toFixed(1);
    const awayWinRate = ((awayWins / total) * 100).toFixed(1);
    const drawRate = ((draws / total) * 100).toFixed(1);
    const avgHomeGoals = (homeGoals / total).toFixed(2);
    const avgAwayGoals = (awayGoals / total).toFixed(2);
    const avgGoalDiff = ((homeGoals - awayGoals) / total).toFixed(2);
    
    let confidence = 50;
    if (total >= 20) confidence += 25;
    else if (total >= 10) confidence += 15;
    else if (total >= 5) confidence += 5;
    
    const maxRate = Math.max(parseFloat(homeWinRate), parseFloat(awayWinRate), parseFloat(drawRate));
    if (maxRate >= 70) confidence += 20;
    else if (maxRate >= 55) confidence += 10;
    confidence = Math.min(95, confidence);
    
    let recommendation;
    const condLabel = coCondition === 'within' ? 'ကြေးတူညီ' : coCondition === 'above' ? 'ကြေးပျော့' : 'ကြေးပြင်း';
    
    if (parseFloat(homeWinRate) >= 60) {
      recommendation = `🏆 အိမ်ရှင် အနိုင် (${homeWinRate}%) - ${condLabel} တွင် အိမ်ရှင် နိုင်နှုန်း မြင့်`;
    } else if (parseFloat(awayWinRate) >= 60) {
      recommendation = `🏆 အဝေး အနိုင် (${awayWinRate}%) - ${condLabel} တွင် အဝေး နိုင်နှုန်း မြင့်`;
    } else if (parseFloat(drawRate) >= 45) {
      recommendation = `🤝 သရေ (${drawRate}%) - ${condLabel} တွင် သရေ ဖြစ်နှုန်း မြင့်`;
    } else if (homeWinBy2Plus > awayWinBy2Plus + draws) {
      recommendation = `⚠️ အိမ်ရှင် ဂိုးပြတ်နိုင်ဖို့ ခက် - ဂိုး ၂ ဂိုးပြတ် နိုင်ခဲ့ပွဲ နည်း`;
    } else {
      recommendation = `⚖️ ရလဒ်များ ကွဲပြား - အခြား factors များကို ထည့်သွင်းစဉ်းစားပါ`;
    }
    
    const summary = `
🎯 MASTER ANALYSIS - ${targetLabel} + ${selectedCO} (${coCondition === 'within' ? 'ကြားထဲ' : coCondition === 'above' ? 'ကြေးပျော့' : 'ကြေးပြင်း'})
═══════════════════════════════════════
• Target Side: ${targetLabel} (နည်းသောကြေး)
• Selected CO: ${selectedCO} (နည်းသောကြေး) [${marketOdds}]
• CO Condition: ${coCondition === 'within' ? 'ကြားထဲမှာ' : coCondition === 'above' ? 'ကြေးပျော့' : 'ကြေးပြင်း'}
• ကိုက်ညီသော ပွဲအရေအတွက်: ${total} ပွဲ

📊 ရလဒ် ဖြန့်ဝေမှု:
• 🏠 အိမ်ရှင် နိုင်: ${homeWins} ပွဲ (${homeWinRate}%)
• ✈️ အဝေး နိုင်: ${awayWins} ပွဲ (${awayWinRate}%)
• 🤝 သရေ: ${draws} ပွဲ (${drawRate}%)

⚽ ဂိုး အသေးစိတ်:
• ပျမ်းမျှ ဂိုး: အိမ်ရှင် ${avgHomeGoals} vs အဝေး ${avgAwayGoals}
• ပျမ်းမျှ ဂိုးကွာခြားချက်: ${avgGoalDiff} (${parseFloat(avgGoalDiff) > 0 ? 'အိမ်ရှင်' : 'အဝေး'} အတွက်)

🎯 ဂိုးပြတ်နိုင်မှု:
• အိမ်ရှင် ၁ ဂိုးပြတ် နိုင်: ${homeWinBy1} ပွဲ
• အိမ်ရှင် ၂+ ဂိုးပြတ် နိုင်: ${homeWinBy2Plus} ပွဲ
• အဝေး ၁ ဂိုးပြတ် နိုင်: ${awayWinBy1} ပွဲ
• အဝေး ၂+ ဂိုးပြတ် နိုင်: ${awayWinBy2Plus} ပွဲ

🔍 နမူနာ ရလဒ်များ (နောက်ဆုံး ၅ ပွဲ):
${resultsList.slice(0, 5).map((r, i) => `   ${i+1}. ${r.teams}: ${r.result} | ${selectedCO} diff: ${r.odds.selectedCODiff}`).join('\n')}

🎯 AI Recommendation: ${recommendation}
📊 Confidence: ${confidence.toFixed(1)}%
    `.trim();
    
    return {
      summary,
      targetSide,
      selectedCO,
      coCondition,
      matchingMatches: resultsList,
      stats: {
        total,
        homeWins, awayWins, draws,
        homeWinRate, awayWinRate, drawRate,
        avgHomeGoals, avgAwayGoals, avgGoalDiff,
        homeWinBy1, homeWinBy2Plus, awayWinBy1, awayWinBy2Plus
      },
      confidence: confidence.toFixed(1),
      recommendation
    };
    
  } catch (err) {
    console.error('❌ Master analysis error:', err.message);
    return {
      summary: "⚠️ Master Analysis ထုတ်ယူရာတွင် အမှားဖြစ်ပွားခဲ့သည်။",
      targetSide: null,
      selectedCO: null,
      coCondition: null,
      matchingMatches: [],
      stats: null,
      confidence: 0,
      recommendation: "Error: " + err.message
    };
  }
}

// ✅ Stream basic prediction
async function streamPrediction(prediction, res, delay = 15) {
  let output = `\n`;
  output += `═══════════════════════════════════════\n`;
  output += `🧠 AI PREDICTION ANALYSIS\n`;
  output += `═══════════════════════════════════════\n\n`;
  output += `🎯 Recommendation: ${prediction.recommendation}\n`;
  output += `📊 Confidence: ${prediction.confidence}%\n\n`;
  output += `📋 Reasoning:\n`;
  prediction.reasoning.forEach(r => { output += `   ${r}\n`; });
  if (prediction.stats) {
    output += `\n📈 Historical Stats (based on ${prediction.stats.totalMatches} similar matches):\n`;
    output += `   🏠 Home Wins: ${prediction.stats.homeWins} (${prediction.stats.homeWinRate}%)\n`;
    output += `   ✈️ Away Wins: ${prediction.stats.awayWins} (${prediction.stats.awayWinRate}%)\n`;
    output += `   🤝 Draws: ${prediction.stats.draws} (${prediction.stats.drawRate}%)\n`;
    output += `   ⚽ Avg Goals: Home ${prediction.stats.avgHomeGoals} vs Away ${prediction.stats.avgAwayGoals}\n`;
  }
  output += `\n⚠️ Disclaimer: ဤခန့်မှန်းချက်သည် သမိုင်းကြောင်း ဒေတာအပေါ် အခြေခံထားခြင်း ဖြစ်ပြီး\n`;
  output += `   အာမခံချက် မရှိပါ။ ကစားပွဲရလဒ်သည် ကွဲပြားနိုင်ပါသည်။\n`;
  output += `═══════════════════════════════════════\n`;
  await streamText(output, res, delay);
}

// ✅ Enhanced Stream with Result Patterns
async function streamMarketOddsAnalysis(analysis, res, delay = 15) {
  let output = `\n`;
  output += `═══════════════════════════════════════\n`;
  output += `📊 MARKET ODDS ANALYSIS (ကြေးပျော့/ကြေးပြင်း + Result Pattern)\n`;
  output += `═══════════════════════════════════════\n\n`;
  
  if (analysis.marketStats) {
    const ms = analysis.marketStats;
    const side = ms.currentMatch.side === 'home' ? 'Home' : 'Away';
    const typeLabel = ms.currentMatch.type === 'stronger' ? 'ကြေးပျော့ (Market > Target)' : 
                      ms.currentMatch.type === 'weaker' ? 'ကြေးပြင်း (Market < Target)' : 'ကြေးတူညီ';
    
    output += `🎯 Current Match Analysis:\n`;
    output += `   Target Odds (${side === 'Home' ? 'HO/HA' : 'AO/AA'}): ${ms.currentMatch.targetOdds}\n`;
    output += `   Market Odds (CO${side === 'Home' ? 'H' : 'A'}): ${ms.currentMatch.marketOdds}\n`;
    output += `   Comparison: ${typeLabel} (diff: ${ms.currentMatch.diff.toFixed(3)})\n\n`;
    
    output += `📈 Historical Patterns:\n`;
    output += `   ┌─ ကြေးပျော့သော ပွဲများ (Market > Target, ${ms.stronger.count} ပွဲ):\n`;
    output += `   │  🏠 Home Wins: ${ms.stronger.homeWins} (${((ms.stronger.homeWins/ms.stronger.count)*100).toFixed(1)}%)\n`;
    output += `   │  ✈️ Away Wins: ${ms.stronger.awayWins} (${((ms.stronger.awayWins/ms.stronger.count)*100).toFixed(1)}%)\n`;
    output += `   │  🤝 Draws: ${ms.stronger.draws} (${((ms.stronger.draws/ms.stronger.count)*100).toFixed(1)}%)\n`;
    output += `   ├─ ကြေးပြင်းသော ပွဲများ (Market < Target, ${ms.weaker.count} ပွဲ):\n`;
    output += `   │  🏠 Home Wins: ${ms.weaker.homeWins} (${((ms.weaker.homeWins/ms.weaker.count)*100).toFixed(1)}%)\n`;
    output += `   │  ✈️ Away Wins: ${ms.weaker.awayWins} (${((ms.weaker.awayWins/ms.weaker.count)*100).toFixed(1)}%)\n`;
    output += `   │  🤝 Draws: ${ms.weaker.draws} (${((ms.weaker.draws/ms.weaker.count)*100).toFixed(1)}%)\n`;
    output += `   └─ ကြေးတူညီသော ပွဲများ (${ms.equal.count} ပွဲ):\n`;
    output += `      🏠 Home: ${ms.equal.homeWins} | ✈️ Away: ${ms.equal.awayWins} | 🤝 Draw: ${ms.equal.draws}\n\n`;
  }
  
  if (analysis.resultPatterns) {
    const rp = analysis.resultPatterns;
    const side = analysis.marketStats?.currentMatch?.side === 'home' ? 'Home' : 'Away';
    
    output += `🔍 Result Pattern Analysis (Same Market Pattern):\n`;
    output += `   • ပွဲအရေအတွက်: ${rp.totalMatches} ပွဲ\n`;
    output += `   • ပျမ်းမျှ ဂိုးကွာခြားချက်: ${rp.avgGoalDiff}\n`;
    output += `   • ${side} ဂိုးပြတ်နိုင်ခဲ့ပွဲ (2+ goals): ${side === 'Home' ? rp.homeWinBy2Plus : rp.awayWinBy2Plus} ပွဲ\n`;
    output += `   • သရေဖြစ်ခဲ့ပွဲ: ${rp.drawCount} ပွဲ\n`;
    if (rp.recentResults && rp.recentResults.length > 0) {
      output += `   • နမူနာ ရလဒ်များ:\n`;
      rp.recentResults.forEach(r => {
        output += `     - ${r}\n`;
      });
    }
    output += `\n`;
  }
  
  output += `🎯 Recommendation: ${analysis.recommendation}\n`;
  output += `📊 Confidence: ${analysis.confidence}%\n\n`;
  output += `📋 Reasoning:\n`;
  analysis.reasoning.forEach(r => { output += `   ${r}\n`; });
  output += `\n⚠️ Disclaimer: ဤခန့်မှန်းချက်သည် Market Odds vs Target Odds နှင့် Historical Result Patterns အပေါ် အခြေခံထားခြင်း ဖြစ်ပြီး\n`;
  output += `   အာမခံချက် မရှိပါ။ ကစားပွဲရလဒ်သည် ကွဲပြားနိုင်ပါသည်။\n`;
  output += `═══════════════════════════════════════\n`;
  
  await streamText(output, res, delay);
}

// ✅ Stream Odds Range Analysis
async function streamOddsRangeAnalysis(analysis, res, delay = 12) {
  let output = `\n`;
  output += `═══════════════════════════════════════\n`;
  output += `📐 ODDS RANGE ANALYSIS (CO vs Target Range)\n`;
  output += `═══════════════════════════════════════\n\n`;
  
  output += `${analysis.summary}\n\n`;
  
  if (analysis.matchingMatches && analysis.matchingMatches.length > 0) {
    output += `📋 Historical Matches with Same Pattern:\n`;
    output += `─────────────────────────────\n`;
    
    analysis.matchingMatches.forEach((m, i) => {
      output += `${i + 1}. ${m.teams}\n`;
      output += `   📅 ${m.date || '-'} | ✅ RESULT: ${m.result}\n`;
      output += `   📊 Target Range: [${m.odds.targetLow.toFixed(2)}–${m.odds.targetHigh.toFixed(2)}] | Market: ${m.odds.market.toFixed(2)}\n`;
      output += `─────────────────────────────\n`;
    });
    
    if (analysis.stats) {
      output += `\n📈 Pattern Statistics:\n`;
      output += `   • Total matches: ${analysis.stats.total}\n`;
      output += `   • 🏠 Home Wins: ${analysis.stats.homeWins} (${analysis.stats.homeWinRate}%)\n`;
      output += `   • ✈️ Away Wins: ${analysis.stats.awayWins} (${analysis.stats.awayWinRate}%)\n`;
      output += `   • 🤝 Draws: ${analysis.stats.draws} (${analysis.stats.drawRate}%)\n`;
    }
  } else if (analysis.condition) {
    output += `⚠️ ဤအခြေအနေနဲ့ ကိုက်ညီတဲ့ historical match မတွေ့ရပါ။\n`;
  }
  
  output += `\n💡 ဤ analysis သည် CO vs Target Range ဆက်နွယ်မှုအပေါ် အခြေခံထားခြင်း ဖြစ်ပြီး\n`;
  output += `   အာမခံချက် မရှိပါ။ ကစားပွဲရလဒ်သည် ကွဲပြားနိုင်ပါသည်။\n`;
  output += `═══════════════════════════════════════\n`;
  
  await streamText(output, res, delay);
}

// ✅ Stream Master Analysis - NEW FEATURE
async function streamMasterAnalysis(analysis, res, delay = 12) {
  let output = `\n`;
  output += `═══════════════════════════════════════\n`;
  output += `🎯 MASTER ANALYSIS - အသေးစိတ် CO Condition\n`;
  output += `═══════════════════════════════════════\n\n`;
  
  output += `${analysis.summary}\n\n`;
  
  if (analysis.matchingMatches && analysis.matchingMatches.length > 0) {
    output += `📋 အပြည့်အစုံ ရလဒ်များ (ပွဲ ${analysis.matchingMatches.length} ပွဲ):\n`;
    output += `─────────────────────────────\n`;
    
    analysis.matchingMatches.forEach((m, i) => {
      const winType = m.goalDiff > 0 ? '🏠' : m.goalDiff < 0 ? '✈️' : '🤝';
      const margin = Math.abs(m.goalDiff) >= 2 ? ' (2+ ဂိုးပြတ်)' : m.goalDiff !== 0 ? ' (1 ဂိုးပြတ်)' : '';
      
      output += `${i + 1}. ${m.teams}\n`;
      output += `   📅 ${m.date || '-'} | ${winType} RESULT: ${m.result}${margin}\n`;
      output += `   📊 ${analysis.selectedCO}: ${m.odds.selectedCO.toFixed(2)} | Diff: ${m.odds.selectedCODiff}\n`;
      output += `─────────────────────────────\n`;
    });
  }
  
  if (analysis.stats) {
    output += `\n📈 အနှစ်ချုပ် Statistics:\n`;
    output += `• စုစုပေါင်း ပွဲ: ${analysis.stats.total}\n`;
    output += `• 🏠 အိမ်ရှင် နိုင်: ${analysis.stats.homeWins} (${analysis.stats.homeWinRate}%)\n`;
    output += `• ✈️ အဝေး နိုင်: ${analysis.stats.awayWins} (${analysis.stats.awayWinRate}%)\n`;
    output += `• 🤝 သရေ: ${analysis.stats.draws} (${analysis.stats.drawRate}%)\n`;
    output += `• ⚽ အိမ်ရှင် ၁ ဂိုးပြတ်: ${analysis.stats.homeWinBy1} | ၂+ ဂိုးပြတ်: ${analysis.stats.homeWinBy2Plus}\n`;
    output += `• ⚽ အဝေး ၁ ဂိုးပြတ်: ${analysis.stats.awayWinBy1} | ၂+ ဂိုးပြတ်: ${analysis.stats.awayWinBy2Plus}\n`;
  }
  
  const condLabel = analysis.coCondition === 'within' ? 'ကြေးတူညီ' : 
                   analysis.coCondition === 'above' ? 'ကြေးပျော့' : 'ကြေးပြင်း';
  output += `\n💡 ဤ Master Analysis သည် ${analysis.targetSide === 'home' ? 'HO/HA' : 'AO/AA'} + ${analysis.selectedCO} (${condLabel}) အခြေအနေအတွက်\n`;
  output += `   Historical matches ${analysis.stats?.total || 0} ပွဲကို အခြေခံထားခြင်း ဖြစ်သည်။\n`;
  output += `   အာမခံချက် မရှိပါ။ ကစားပွဲရလဒ်သည် ကွဲပြားနိုင်ပါသည်။\n`;
  output += `═══════════════════════════════════════\n`;
  
  await streamText(output, res, delay);
}
/ ✅ SERVE INDEX.HTML FOR ROOT ROUTE
let indexHtmlContent = '';
try {
  // public folder ထဲက index.html ကို ဖတ်ပါ
  const publicPath = join(process.cwd(), 'public', 'index.html');
  indexHtmlContent = readFileSync(publicPath, 'utf-8');
  console.log('✅ index.html loaded successfully from public folder');
} catch (err) {
  console.error('❌ Could not load index.html:', err.message);
}

app.get('/', (req, res) => {
  if (!indexHtmlContent) {
    return res.status(500).send('Error: index.html not found. Please ensure public/index.html exists.');
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(indexHtmlContent);
});

// ✅ SERVE STATIC FILES (CSS, Images, etc.)
app.use(express.static(join(process.cwd(), 'public')));
// ✅ Vercel API Route Handler
app.post('/api/chat-stream', async (req, res) => {
  try {
    // ✅ Initialize DB connection
    await initDB();
    
    const { message } = req.body;
    const file = req.file;
    
    // ✅ Set Headers for Streaming on Vercel
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');                   
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-cache');
    res.flushHeaders();
    
    // In-memory state (Note: In production Vercel, consider using external storage)
    let uploadedMatches = [];
    let uploadTimestamp = null;
    let lastSearchState = { 
      targets: null, offset: 0, timestamp: 0, activeSide: null, 
      sortedMatches: null, searchKey: null, fromUploadedData: false,
      totalMatches: 0
    };

    // ✅ HANDLE FILE UPLOAD
    if (file) {
      console.log('📁 ========== FILE UPLOAD START ==========');
      console.log('📁 File:', file.originalname);
      
      const workbook = XLSX.read(file.buffer);
      const sheetName = workbook.SheetNames[0];
      const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: "" });
      
      let hIdx = -1;
      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const row = rows[i];
        if (row.some(c => typeof c === 'string' && c.toLowerCase().includes("home"))) {
          hIdx = i;
          break;
        }
      }
      if (hIdx === -1) hIdx = 0;
      
      const headerRow = rows[hIdx] || [];
      console.log('📊 ========== ALL COLUMN HEADERS ==========');
      headerRow.forEach((h, i) => {
        const clean = String(h || '').toLowerCase().trim();
        console.log(`   Column ${i}: "${h}" → Clean: "${clean}"`);
      });
      console.log('📊 =========================================');
      
      const findColIndex = (keywords, columnName) => {
        console.log(`\n🔍 Searching for ${columnName}...`);
        for (let i = 0; i < headerRow.length; i++) {
          const header = String(headerRow[i] || '').toLowerCase().trim();
          for (const keyword of keywords) {
            if (header.includes(keyword.toLowerCase())) {
              console.log(`   ✅ MATCH! Column ${i}: "${header}"`);
              return i;
            }
          }
        }
        console.log(`   ❌ NOT FOUND`);
        return -1;
      };
      
      uploadedMatches = [];
      for (let rowIdx = hIdx + 1; rowIdx < rows.length; rowIdx++) {
        const dataRow = rows[rowIdx] || [];
        if (dataRow.length === 0) continue;
        
        const homeTeamIdx = findColIndex(['home team', 'home'], 'Home Team');
        const awayTeamIdx = findColIndex(['away team', 'away'], 'Away Team');
        const hoIdx = findColIndex(['home overall odds'], 'Home Overall Odds');
        const doIdx = findColIndex(['draw overall odds', 'draw odds'], 'Draw Overall Odds');
        const aoIdx = findColIndex(['away overall odds'], 'Away Overall Odds');
        const haIdx = findColIndex(['home adjusted decimal', 'home adjusted'], 'Home Adjusted');
        const daIdx = findColIndex(['draw adjusted decimal', 'draw adjusted'], 'Draw Adjusted');
        const aaIdx = findColIndex(['away adjusted decimal', 'away adjusted'], 'Away Adjusted');
        const homeWinProbIdx = findColIndex(['home win probability', 'home win prob'], 'Home Win Probability');
        const drawProbIdx = findColIndex(['draw probability', 'draw prob'], 'Draw Probability');
        const awayWinProbIdx = findColIndex(['away win probability', 'away win prob'], 'Away Win Probability');
        const homeLast6ProbIdx = findColIndex(['home last6 probability', 'home last 6 prob'], 'Home Last6 Probability');
        const drawLast6ProbIdx = findColIndex(['draw last6 probability', 'draw last 6 prob'], 'Draw Last6 Probability');
        const awayLast6ProbIdx = findColIndex(['away last6 probability', 'away last 6 prob'], 'Away Last6 Probability');
        const homeWinRateIdx = findColIndex(['home win rate', 'home rate'], 'Home Win Rate');
        const drawRateIdx = findColIndex(['draw rate'], 'Draw Rate');
        const awayWinRateIdx = findColIndex(['away win rate', 'away rate'], 'Away Win Rate');
        const scoringRateIdx = findColIndex(['scoring rate', 'score rate'], 'Scoring Rate');
        const homeLast6PointsIdx = findColIndex(['home last6 points', 'home last 6 points', 'home pts'], 'Home Last6 Points');
        const homeLast6GDIdx = findColIndex(['home last6 goals (gd)', 'home last6 gd', 'home last 6 goals (gd)', 'home last 6 gd', 'home goal difference', 'home gd', 'home last6 goal', 'h last6 gd', 'home gd last6', 'goal difference home', 'home goals gd', 'last6 gd home'], 'Home Last6 GD');
        const awayLast6PointsIdx = findColIndex(['away last6 points', 'away last 6 points', 'away pts'], 'Away Last6 Points');
        const awayLast6GDIdx = findColIndex(['away last6 goals (gd)', 'away last6 gd', 'away last 6 goals (gd)', 'away last 6 gd', 'away goal difference', 'away gd', 'away last6 goal', 'a last6 gd', 'away gd last6', 'goal difference away', 'away goals gd', 'last6 gd away'], 'Away Last6 GD');
        const homeRankIdx = findColIndex(['home ranking', 'home rank', 'home position'], 'Home Ranking');
        const awayRankIdx = findColIndex(['away ranking', 'away rank', 'away position'], 'Away Ranking');
        const cohIdx = findColIndex(['coh', 'home market odds', 'home co'], 'COH');
        const codIdx = findColIndex(['cod', 'draw market odds', 'draw co'], 'COD');
        const coaIdx = findColIndex(['coa', 'away market odds', 'away co'], 'COA');
        
        const matchData = {
          homeTeam: String(dataRow[homeTeamIdx] || dataRow[0] || ''),
          awayTeam: String(dataRow[awayTeamIdx] || dataRow[1] || ''),
          homeOverallOdds: toNum(dataRow[hoIdx]),
          drawOverallOdds: toNum(dataRow[doIdx]),
          awayOverallOdds: toNum(dataRow[aoIdx]),
          homeAdjustedDecimal: toNum(dataRow[haIdx]),
          drawAdjustedDecimal: toNum(dataRow[daIdx]),
          awayAdjustedDecimal: toNum(dataRow[aaIdx]),
          homeWinProbability: toNum(dataRow[homeWinProbIdx]),
          drawProbability: toNum(dataRow[drawProbIdx]),
          awayWinProbability: toNum(dataRow[awayWinProbIdx]),
          homeLast6Probability: toNum(dataRow[homeLast6ProbIdx]),
          drawLast6Probability: toNum(dataRow[drawLast6ProbIdx]),
          awayLast6Probability: toNum(dataRow[awayLast6ProbIdx]),
          homeWinRate: toNum(dataRow[homeWinRateIdx]),
          drawRate: toNum(dataRow[drawRateIdx]),
          awayWinRate: toNum(dataRow[awayWinRateIdx]),
          scoringRate: toNum(dataRow[scoringRateIdx]),
          homeLast6Points: toNum(dataRow[homeLast6PointsIdx]),
          homeLast6GoalsGD: toNum(dataRow[homeLast6GDIdx]),
          awayLast6Points: toNum(dataRow[awayLast6PointsIdx]),
          awayLast6GoalsGD: toNum(dataRow[awayLast6GDIdx]),
          homeRanking: toNum(dataRow[homeRankIdx]),
          awayRanking: toNum(dataRow[awayRankIdx]),
          coh: toNum(dataRow[cohIdx]),
          cod: toNum(dataRow[codIdx]),
          coa: toNum(dataRow[coaIdx]),
        };
        
        console.log(`\n📊 Row ${rowIdx}: ${matchData.homeTeam} vs ${matchData.awayTeam}`);
        console.log(`   HO:${matchData.homeOverallOdds} AO:${matchData.awayOverallOdds} HA:${matchData.homeAdjustedDecimal} AA:${matchData.awayAdjustedDecimal}`);
        console.log(`   Home GD:${matchData.homeLast6GoalsGD} Away GD:${matchData.awayLast6GoalsGD}`);
        
        if (matchData.homeTeam || matchData.awayTeam) {
          uploadedMatches.push(matchData);
        }
      }
      
      console.log('\n📊 ========== UPLOADED ALL MATCHES ==========');
      console.log('📊 Total matches:', uploadedMatches.length);
      uploadedMatches.forEach((m, i) => {
        console.log(`   ${i + 1}. ${m.homeTeam} vs ${m.awayTeam} | HO:${m.homeOverallOdds ?? '-'} AO:${m.awayOverallOdds ?? '-'} Home GD:${m.homeLast6GoalsGD ?? '-'} Away GD:${m.awayLast6GoalsGD ?? '-'}`);
      });
      console.log('📊 ==========================================\n');
      
      uploadTimestamp = Date.now();
      lastSearchState = { targets: null, offset: 0, timestamp: 0, activeSide: null, sortedMatches: null, searchKey: null, fromUploadedData: false, totalMatches: 0 };
      
      let output = `\n═══════════════════════════════════════\n📁 FILE UPLOADED SUCCESSFULLY\n═══════════════════════════════════════\n\n`;
      output += `File: ${file.originalname}\n`;
      output += `Total matches: ${uploadedMatches.length}\n\n`;
      output += `📋 Matches:\n`;
      uploadedMatches.slice(0, 10).forEach((m, i) => {
        output += `  ${i + 1}. ${m.homeTeam} vs ${m.awayTeam} | HO:${m.homeOverallOdds ?? '-'} AO:${m.awayOverallOdds ?? '-'}\n`;
      });
      if (uploadedMatches.length > 10) {
        output += `  ... and ${uploadedMatches.length - 10} more\n`;
      }
      output += `\n✅ Ready to search!\n`;
      output += `💡 Type team name (e.g., "Brage") OR odds number (e.g., "1.8")\n`;
      output += `💡 Or type "မေးလို့ရတဲ့ပွဲတွေဖော်ပြပေးပါ" to see all matches\n`;
      output += `═══════════════════════════════════════\n`;
      
      await streamText(output, res, 15);
      res.end();
      return;
    }
    
    // ✅ HANDLE TEXT MESSAGE
    console.log('📝 ========== TEXT MESSAGE ==========');
    console.log('📝 Message:', message);
    
    const lowerMsg = message ? message.toLowerCase().trim() : "";
    const isNextRequest = lowerMsg === 'more' || lowerMsg === 'next' || lowerMsg === 'ထပ်' || lowerMsg === 'ဆက်';

    if (uploadedMatches.length > 0 && isListMatchesRequest(message)) {
      console.log('📋 List matches request detected');
      let output = `\n═══════════════════════════════════════\n📋 AVAILABLE MATCHES (${uploadedMatches.length} ပွဲ)\n═══════════════════════════════════════\n\n`;
      uploadedMatches.forEach((m, i) => {
        output += `🏆 ${i + 1}. ${m.homeTeam} vs ${m.awayTeam}\n`;
        output += `   HO:${m.homeOverallOdds ?? '-'} | DO:${m.drawOverallOdds ?? '-'} | AO:${m.awayOverallOdds ?? '-'}\n`;
        output += `   HA:${m.homeAdjustedDecimal ?? '-'} | DA:${m.drawAdjustedDecimal ?? '-'} | AA:${m.awayAdjustedDecimal ?? '-'}\n`;
        output += `   Prob: H${m.homeWinProbability ?? '-'}% D${m.drawProbability ?? '-'}% A${m.awayWinProbability ?? '-'}%\n`;
        output += `─────────────────────────────\n`;
      });
      output += `\n💡 Type any team name to search historical data\n`;
      output += `═══════════════════════════════════════\n`;
      await streamText(output, res, 10);
      res.end();
      return;
    }

    let targets = { HO: null, AO: null, HA: null, AA: null };
    let activeSide = 'home';
    let searchKey = null;
    let useUploadedData = false;
    let matchedUploadMatch = null;
    
    const FIVE_MINUTES = 5 * 60 * 1000;
    
    const canLoadPagination = isNextRequest && 
                             lastSearchState.sortedMatches && 
                             lastSearchState.sortedMatches.length > 0 &&
                             lastSearchState.targets &&
                             (Object.values(lastSearchState.targets).some(v => v !== null)) &&
                             (Date.now() - lastSearchState.timestamp < FIVE_MINUTES);
    
    if (canLoadPagination) {
      console.log('🔄 Loading from pagination');
      targets = { ...lastSearchState.targets };
      activeSide = lastSearchState.activeSide;
      searchKey = lastSearchState.searchKey;
      useUploadedData = lastSearchState.fromUploadedData;
      matchedUploadMatch = lastSearchState.uploadedMatch ? { ...lastSearchState.uploadedMatch } : null;
    } 
    else if (message && !isNextRequest && isNumberSearch(message)) {
      console.log('🔢 Number search detected');
      const nums = message.match(/\d+\.?\d*/g).map(n => parseFloat(n));
      if (nums.length >= 1) {
        const hoMatch = message.match(/(?:HO|Home Overall)\s*(\d+\.?\d*)/i);
        const haMatch = message.match(/(?:HA|Home Adj)\s*(\d+\.?\d*)/i);
        const aoMatch = message.match(/(?:AO|Away Overall)\s*(\d+\.?\d*)/i);
        const aaMatch = message.match(/(?:AA|Away Adj)\s*(\d+\.?\d*)/i);
        if (hoMatch) { targets.HO = parseFloat(hoMatch[1]); activeSide = 'home'; searchKey = `HO_${hoMatch[1]}`; }
        else if (haMatch) { targets.HA = parseFloat(haMatch[1]); activeSide = 'home'; searchKey = `HA_${haMatch[1]}`; }
        else if (aoMatch) { targets.AO = parseFloat(aoMatch[1]); activeSide = 'away'; searchKey = `AO_${aoMatch[1]}`; }
        else if (aaMatch) { targets.AA = parseFloat(aaMatch[1]); activeSide = 'away'; searchKey = `AA_${aaMatch[1]}`; }
        else { targets.HO = nums[0]; activeSide = 'home'; searchKey = `HO_${nums[0]}`; }
      }
    }
    else if (uploadedMatches.length > 0 && uploadTimestamp && message && !isNextRequest) {
      const THIRTY_MINUTES = 30 * 60 * 1000;
      if (Date.now() - uploadTimestamp < THIRTY_MINUTES) {
        console.log('🔍 Searching for team in uploaded matches...');
        
        for (const uploaded of uploadedMatches) {
          const exactHome = uploaded.homeTeam.toLowerCase().trim();
          const exactAway = uploaded.awayTeam.toLowerCase().trim();
          const exactMatch = `${exactHome} vs ${exactAway}`;
          const reverseMatch = `${exactAway} vs ${exactHome}`;
          
          if (lowerMsg.includes(exactHome) || lowerMsg.includes(exactAway) || 
              lowerMsg.includes(exactMatch) || lowerMsg.includes(reverseMatch)) {
            console.log('🎯 Found (EXACT match):', uploaded.homeTeam, 'vs', uploaded.awayTeam);
            matchedUploadMatch = uploaded;
            useUploadedData = true;
            
            const hasValidHO = uploaded.homeOverallOdds !== null && uploaded.homeOverallOdds > 0;
            const hasValidAO = uploaded.awayOverallOdds !== null && uploaded.awayOverallOdds > 0;
            const hasValidHA = uploaded.homeAdjustedDecimal !== null && uploaded.homeAdjustedDecimal > 0;
            const hasValidAA = uploaded.awayAdjustedDecimal !== null && uploaded.awayAdjustedDecimal > 0;
            
            if (hasValidHO && hasValidAO) {
              if (uploaded.awayOverallOdds < uploaded.homeOverallOdds) {
                targets.AO = uploaded.awayOverallOdds; targets.AA = uploaded.awayAdjustedDecimal; activeSide = 'away';
              } else {
                targets.HO = uploaded.homeOverallOdds; targets.HA = uploaded.homeAdjustedDecimal; activeSide = 'home';
              }
            } else if (hasValidHO && hasValidHA) {
              targets.HO = uploaded.homeOverallOdds; targets.HA = uploaded.homeAdjustedDecimal; activeSide = 'home';
            } else if (hasValidAO && hasValidAA) {
              targets.AO = uploaded.awayOverallOdds; targets.AA = uploaded.awayAdjustedDecimal; activeSide = 'away';
            }
            searchKey = `UPLOADED_${uploaded.homeTeam}_${uploaded.awayTeam}`;
            break;
          }
        }
        
        if (!matchedUploadMatch) {
          for (const uploaded of uploadedMatches) {
            const homeKeywords = getTeamKeywords(uploaded.homeTeam);
            const awayKeywords = getTeamKeywords(uploaded.awayTeam);
            
            let homeMatched = false, awayMatched = false;
            
            for (const keyword of homeKeywords) {
              if (lowerMsg.includes(keyword)) {
                homeMatched = true;
                break;
              }
            }
            for (const keyword of awayKeywords) {
              if (lowerMsg.includes(keyword)) {
                awayMatched = true;
                break;
              }
            }
            
            if (homeMatched && awayMatched) {
              console.log('🎯 Found (STRICT keyword match):', uploaded.homeTeam, 'vs', uploaded.awayTeam);
              matchedUploadMatch = uploaded;
              useUploadedData = true;
              
              const hasValidHO = uploaded.homeOverallOdds !== null && uploaded.homeOverallOdds > 0;
              const hasValidAO = uploaded.awayOverallOdds !== null && uploaded.awayOverallOdds > 0;
              const hasValidHA = uploaded.homeAdjustedDecimal !== null && uploaded.homeAdjustedDecimal > 0;
              const hasValidAA = uploaded.awayAdjustedDecimal !== null && uploaded.awayAdjustedDecimal > 0;
              
              if (hasValidHO && hasValidAO) {
                if (uploaded.awayOverallOdds < uploaded.homeOverallOdds) {
                  targets.AO = uploaded.awayOverallOdds; targets.AA = uploaded.awayAdjustedDecimal; activeSide = 'away';
                } else {
                  targets.HO = uploaded.homeOverallOdds; targets.HA = uploaded.homeAdjustedDecimal; activeSide = 'home';
                }
              } else if (hasValidHO && hasValidHA) {
                targets.HO = uploaded.homeOverallOdds; targets.HA = uploaded.homeAdjustedDecimal; activeSide = 'home';
              } else if (hasValidAO && hasValidAA) {
                targets.AO = uploaded.awayOverallOdds; targets.AA = uploaded.awayAdjustedDecimal; activeSide = 'away';
              }
              searchKey = `UPLOADED_${uploaded.homeTeam}_${uploaded.awayTeam}`;
              break;
            }
          }
        }
      }
    }

    let offset = 0;
    if (canLoadPagination) { 
      offset = lastSearchState.offset || 0; 
    } else { 
      offset = 0; 
      if (!isNextRequest) { 
        lastSearchState = { targets: null, offset: 0, timestamp: 0, activeSide: null, sortedMatches: null, searchKey: null, fromUploadedData: false, totalMatches: 0 }; 
      } 
    }

    if (!Object.values(targets).some(v => v !== null)) {
      res.write('❌ Odds အချက်အလက် မတွေ့ပါ။\n\n');
      if (uploadedMatches.length > 0) {
        res.write(`💡 Upload လုပ်ထားသော ပွဲ (${uploadedMatches.length} ပွဲ) ရှိပါတယ်။\n`);
        res.write(`💡 "မေးလို့ရတဲ့ပွဲတွေဖော်ပြပေးပါ" လို့ ရိုက်ပြီး ကြည့်နိုင်ပါတယ်။\n\n`);
      }
      res.end();
      return;
    }

    console.log('🎯 Final Targets:', targets, '| Side:', activeSide);

    const allMatches = await db.collection('matches').find({ "fthgActual": { $exists: true, $ne: null } }).toArray();
    const scored = allMatches.map(m => {
      const mHO = toNum(m["homeOverallOdds"]), mAO = toNum(m["awayOverallOdds"]);
      const mHA = toNum(m["homeAdjustedDecimal"]), mAA = toNum(m["awayAdjustedDecimal"]);
      let diff = 9999, matchedFields = 0;
      if (activeSide === 'home') {
        if (targets.HO !== null && mHO !== null) { diff = Math.abs(targets.HO - mHO); matchedFields++; }
        if (targets.HA !== null && mHA !== null && matchedFields === 0) { diff = Math.abs(targets.HA - mHA); matchedFields++; }
      } else {
        if (targets.AO !== null && mAO !== null) { diff = Math.abs(targets.AO - mAO); matchedFields++; }
        if (targets.AA !== null && mAA !== null && matchedFields === 0) { diff = Math.abs(targets.AA - mAA); matchedFields++; }
      }
      return { m, diff, matchedFields };
    });
    
    const CLOSE_THRESHOLD = 0.15;
    let validMatches = scored.filter(s => s.matchedFields > 0 && s.diff <= CLOSE_THRESHOLD);
    
    const seenIds = new Set();
    validMatches = validMatches.filter(s => {
      const id = s.m.match_id;
      if (seenIds.has(id)) return false;
      seenIds.add(id);
      return true;
    });
    
    let currentCOCondition = 'unknown';
    if (matchedUploadMatch && useUploadedData) {
      if (activeSide === 'home') {
        const ho = matchedUploadMatch.homeOverallOdds;
        const ha = matchedUploadMatch.homeAdjustedDecimal;
        const coh = matchedUploadMatch.coh;
        if (ho !== null && ha !== null && coh !== null) {
          const minTarget = Math.min(ho, ha);
          const maxTarget = Math.max(ho, ha);
          if (coh > maxTarget + 0.05) currentCOCondition = 'above';
          else if (coh < minTarget - 0.05) currentCOCondition = 'below';
          else currentCOCondition = 'within';
        }
      } else {
        const ao = matchedUploadMatch.awayOverallOdds;
        const aa = matchedUploadMatch.awayAdjustedDecimal;
        const coa = matchedUploadMatch.coa;
        if (ao !== null && aa !== null && coa !== null) {
          const minTarget = Math.min(ao, aa);
          const maxTarget = Math.max(ao, aa);
          if (coa > maxTarget + 0.05) currentCOCondition = 'above';
          else if (coa < minTarget - 0.05) currentCOCondition = 'below';
          else currentCOCondition = 'within';
        }
      }
    }
    console.log(`🎯 Current CO Condition: ${currentCOCondition}`);
    
    validMatches.forEach(s => {
      if (activeSide === 'home') {
        const ho = s.m.homeOverallOdds;
        const ha = s.m.homeAdjustedDecimal;
        const coh = s.m.coh;
        if (ho !== null && ha !== null && coh !== null) {
          const minTarget = Math.min(ho, ha);
          const maxTarget = Math.max(ho, ha);
          if (coh > maxTarget + 0.05) s.coCondition = 'above';
          else if (coh < minTarget - 0.05) s.coCondition = 'below';
          else s.coCondition = 'within';
        } else {
          s.coCondition = 'unknown';
        }
      } else {
        const ao = s.m.awayOverallOdds;
        const aa = s.m.awayAdjustedDecimal;
        const coa = s.m.coa;
        if (ao !== null && aa !== null && coa !== null) {
          const minTarget = Math.min(ao, aa);
          const maxTarget = Math.max(ao, aa);
          if (coa > maxTarget + 0.05) s.coCondition = 'above';
          else if (coa < minTarget - 0.05) s.coCondition = 'below';
          else s.coCondition = 'within';
        } else {
          s.coCondition = 'unknown';
        }
      }
    });
    
    validMatches.sort((a, b) => {
      const aMatchesCurrent = (a.coCondition === currentCOCondition) ? 0 : 1;
      const bMatchesCurrent = (b.coCondition === currentCOCondition) ? 0 : 1;
      if (aMatchesCurrent !== bMatchesCurrent) {
        return aMatchesCurrent - bMatchesCurrent;
      }
      if (a.diff !== b.diff) return a.diff - b.diff;
      const dateA = new Date(a.m.date || 0);
      const dateB = new Date(b.m.date || 0);
      return dateB - dateA;
    });
    
    console.log(`📊 Found ${validMatches.length} unique historical matches`);
    console.log(`📊 Sorted by: CO condition match → distance → date`);
    
    if (!canLoadPagination) {
      lastSearchState = {
        sortedMatches: validMatches.map(v => ({ ...v, m: { ...v.m } })),
        targets: { HO: targets.HO, AO: targets.AO, HA: targets.HA, AA: targets.AA },
        activeSide: activeSide,
        searchKey: searchKey,
        fromUploadedData: useUploadedData,
        timestamp: Date.now(),
        totalMatches: validMatches.length,
        offset: 0,
        uploadedMatch: matchedUploadMatch ? { ...matchedUploadMatch } : null,
        currentCOCondition: currentCOCondition
      };
      console.log('💾 Search state saved for pagination');
    }
    
    const PAGE_SIZE = 7;
    let pageMatches;
    
    if (canLoadPagination && lastSearchState.sortedMatches) {
      offset = lastSearchState.offset || 0;
      pageMatches = lastSearchState.sortedMatches.slice(offset, offset + PAGE_SIZE);
      matchedUploadMatch = lastSearchState.uploadedMatch;
      useUploadedData = lastSearchState.fromUploadedData;
      activeSide = lastSearchState.activeSide;
      currentCOCondition = lastSearchState.currentCOCondition || currentCOCondition;
      console.log(`🔄 Pagination: Loading page with offset ${offset}`);
    } else {
      offset = 0;
      pageMatches = validMatches.slice(0, PAGE_SIZE);
    }
    
    lastSearchState.offset = offset + PAGE_SIZE;
    lastSearchState.timestamp = Date.now();
    
    console.log(`📄 Page: ${offset + 1}-${offset + pageMatches.length} of ${lastSearchState.totalMatches || validMatches.length}`);
    if (pageMatches.length > 0) {
      console.log(`📊 Distance: ${pageMatches[0].diff.toFixed(3)} → ${pageMatches[pageMatches.length - 1].diff.toFixed(3)}`);
    }

    let header = `\n═══════════════════════════════════════\n🔍 HISTORICAL SEARCH RESULTS\n═══════════════════════════════════════\n\n`;
    
    if (matchedUploadMatch && useUploadedData && !canLoadPagination) {
      header += `Searching for matches similar to:\n📌 ${matchedUploadMatch.homeTeam} vs ${matchedUploadMatch.awayTeam}\n`;
      header += `📊 Searching by: ${activeSide === 'home' ? 'HO/HA' : 'AO/AA'} (Lower Odds Side)\n`;
      header += `📊 HO: ${matchedUploadMatch.homeOverallOdds ?? '-'} | AO: ${matchedUploadMatch.awayOverallOdds ?? '-'}\n`;
      header += `📊 HA: ${matchedUploadMatch.homeAdjustedDecimal ?? '-'} | AA: ${matchedUploadMatch.awayAdjustedDecimal ?? '-'}\n`;
      header += `📊 Current CO Condition: ${currentCOCondition === 'above' ? 'ကြေးပျော့' : currentCOCondition === 'below' ? 'ကြေးပြင်း' : 'ကြေးတူညီ'}\n\n`;
    } else if (canLoadPagination && lastSearchState.uploadedMatch) {
      header += `📌 Continuing search: ${lastSearchState.uploadedMatch.homeTeam} vs ${lastSearchState.uploadedMatch.awayTeam}\n`;
      header += `📊 Page ${Math.floor(offset / PAGE_SIZE) + 1} of ${Math.ceil((lastSearchState.totalMatches || 0) / PAGE_SIZE)}\n\n`;
    }
    
    header += `Found ${lastSearchState.totalMatches || validMatches.length} historical matches with results:\n`;
    header += `(Sorted by: Same CO condition → closest match → newest date)\n`;
    header += `─────────────────────────────\n`;
    
    await streamText(header, res, 10);

    if (matchedUploadMatch && useUploadedData && !canLoadPagination) {
      let uploadedMatchOutput = `\n`;
      uploadedMatchOutput += `🏆 UPLOADED MATCH - ${matchedUploadMatch.homeTeam} vs ${matchedUploadMatch.awayTeam}\n`;
      uploadedMatchOutput += `📅 Current Match | No Result Yet\n`;
      uploadedMatchOutput += `🏟️ ${matchedUploadMatch.homeTeam} vs ${matchedUploadMatch.awayTeam}\n`;
      uploadedMatchOutput += `📊 Odds: HO:${matchedUploadMatch.homeOverallOdds ?? '-'} DO:${matchedUploadMatch.drawOverallOdds ?? '-'} AO:${matchedUploadMatch.awayOverallOdds ?? '-'}\n`;
      uploadedMatchOutput += `📊 Adj: HA:${matchedUploadMatch.homeAdjustedDecimal ?? '-'} DA:${matchedUploadMatch.drawAdjustedDecimal ?? '-'} AA:${matchedUploadMatch.awayAdjustedDecimal ?? '-'}\n`;
      uploadedMatchOutput += `📊 Market: COH:${matchedUploadMatch.coh ?? '-'} COD:${matchedUploadMatch.cod ?? '-'} COA:${matchedUploadMatch.coa ?? '-'}\n`;
      uploadedMatchOutput += `📊 Prob: H${matchedUploadMatch.homeWinProbability ?? '-'}% D${matchedUploadMatch.drawProbability ?? '-'}% A${matchedUploadMatch.awayWinProbability ?? '-'}%\n`;
      uploadedMatchOutput += `📊 Last6 Prob: H${matchedUploadMatch.homeLast6Probability ?? '-'}% D${matchedUploadMatch.drawLast6Probability ?? '-'}% A${matchedUploadMatch.awayLast6Probability ?? '-'}%\n`;
      uploadedMatchOutput += `📊 Rates: H-Win:${matchedUploadMatch.homeWinRate ?? '-'} Draw:${matchedUploadMatch.drawRate ?? '-'} A-Win:${matchedUploadMatch.awayWinRate ?? '-'} Score:${matchedUploadMatch.scoringRate ?? '-'}\n`;
      uploadedMatchOutput += `📊 Last6: H-Pts:${matchedUploadMatch.homeLast6Points ?? '-'} GD:${matchedUploadMatch.homeLast6GoalsGD ?? '-'} | A-Pts:${matchedUploadMatch.awayLast6Points ?? '-'} GD:${matchedUploadMatch.awayLast6GoalsGD ?? '-'}\n`;
      uploadedMatchOutput += `📊 Rank: H${matchedUploadMatch.homeRanking ?? '-'} A${matchedUploadMatch.awayRanking ?? '-'}\n`;
      uploadedMatchOutput += `✅ RESULT: ? - ? (Not played yet)\n`;
      uploadedMatchOutput += `📏 Distance: N/A (This is your uploaded match)\n`;
      uploadedMatchOutput += `─────────────────────────────\n`;
      
      await streamText(uploadedMatchOutput, res, 10);
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    for (let i = 0; i < pageMatches.length; i++) {
      const item = pageMatches[i];
      const m = item.m;
      const matchNumber = (lastSearchState.offset || 0) - PAGE_SIZE + i + 1;
      
      let matchOutput = `\n`;
      matchOutput += `🏆 Match ${matchNumber} - ${m["teams"] || 'Unknown'}\n`;
      matchOutput += `📅 ${m["date"] || '-'} | ${m["context"] || '-'} | Week ${m["week"] || '-'}\n`;
      matchOutput += `🏟️ ${m["homeTeam"] || '-'} vs ${m["awayTeam"] || '-'}\n`;
      matchOutput += `📊 Odds: HO:${m["homeOverallOdds"] ?? '-'} DO:${m["drawOverallOdds"] ?? '-'} AO:${m["awayOverallOdds"] ?? '-'}\n`;
      matchOutput += `📊 Adj: HA:${m["homeAdjustedDecimal"] ?? '-'} DA:${m["drawAdjustedDecimal"] ?? '-'} AA:${m["awayAdjustedDecimal"] ?? '-'}\n`;
      matchOutput += `📊 Market: COH:${m["coh"] ?? '-'} COD:${m["cod"] ?? '-'} COA:${m["coa"] ?? '-'}\n`;
      matchOutput += `📊 Prob: H${m["homeWinProbability"] ?? '-'}% D${m["drawProbability"] ?? '-'}% A${m["awayWinProbability"] ?? '-'}%\n`;
      matchOutput += `📊 Last6 Prob: H${m["homeLast6Probability"] ?? '-'}% D${m["drawLast6Probability"] ?? '-'}% A${m["awayLast6Probability"] ?? '-'}%\n`;
      matchOutput += `📊 Rates: H-Win:${m["homeWinRate"] ?? '-'} Draw:${m["drawRate"] ?? '-'} A-Win:${m["awayWinRate"] ?? '-'} Score:${m["scoringRate"] ?? '-'}\n`;
      matchOutput += `📊 Last6: H-Pts:${m["homeLast6Points"] ?? '-'} GD:${m["homeLast6GoalsGD"] ?? '-'} | A-Pts:${m["awayLast6Points"] ?? '-'} GD:${m["awayLast6GoalsGD"] ?? '-'}\n`;
      matchOutput += `📊 Rank: H${m["homeRanking"] ?? '-'} A${m["awayRanking"] ?? '-'}\n`;
      matchOutput += `✅ RESULT: ${m["fthgActual"] ?? '?'} - ${m["ftagActual"] ?? '?'}\n`;
      matchOutput += `📏 Distance: ${item.diff.toFixed(3)}\n`;
      matchOutput += `📐 CO: ${activeSide === 'home' ? `COH:${m["coh"] ?? '-'} vs HO/HA` : `COA:${m["coa"] ?? '-'} vs AO/AA`} [${item.coCondition}]\n`;
      matchOutput += `─────────────────────────────\n`;
      
      await streamText(matchOutput, res, 10);
      
      if (i < pageMatches.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    const targetValues = canLoadPagination && lastSearchState.targets 
      ? Object.values(lastSearchState.targets).filter(v => v !== null).join(', ')
      : Object.values(targets).filter(v => v !== null).join(', ');

    const totalMatches = lastSearchState.totalMatches || validMatches.length;
    const currentOffset = lastSearchState.offset || 0;
    const remainingMatches = totalMatches - currentOffset;

    if (remainingMatches > 0) {
      await new Promise(resolve => setTimeout(resolve, 200));
      await streamText(`\n💡 ${targetValues} နဲ့ အနီးစပ်ဆုံးပွဲတွေ ထပ်မံရှာလိုလျှင် "More" လို့ ပို့ပေးလို့ရပါတယ်။ (Remaining: ${remainingMatches})\n\n`, res, 10);
    } else {
      await new Promise(resolve => setTimeout(resolve, 200));
      await streamText(`\n✅ ပြသရန် ပွဲအားလုံး ကုန်ဆုံးပါပြီ။ စုစုပေါင်း ${totalMatches} ပွဲ။\n\n`, res, 10);
    }
    
    const isFirstPage = !canLoadPagination;
    
    if (isFirstPage && matchedUploadMatch && useUploadedData && validMatches.length > 0) {
      console.log('🧠 Generating AI prediction...');
      const prediction = generatePrediction(matchedUploadMatch, validMatches, activeSide);
      await streamPrediction(prediction, res, 12);
      
      console.log('📊 Generating Enhanced Market Odds Analysis...');
      const marketAnalysis = generateMarketOddsAnalysis(matchedUploadMatch, validMatches, activeSide);
      if (marketAnalysis.confidence > 0) {
        await streamMarketOddsAnalysis(marketAnalysis, res, 12);
      }
      
      console.log('📐 Generating Odds Range Analysis...');
      const rangeAnalysis = generateOddsRangeAnalysis(matchedUploadMatch, validMatches, activeSide);
      if (rangeAnalysis.condition) {
        await streamOddsRangeAnalysis(rangeAnalysis, res, 12);
      }
      
      console.log('🎯 Generating Master Analysis...');
      const masterAnalysis = generateMasterAnalysis(matchedUploadMatch, validMatches, activeSide);
      if (masterAnalysis.confidence > 0) {
        await streamMasterAnalysis(masterAnalysis, res, 12);
      }
    }
    
    res.end();
    console.log('✅ All matches streamed\n');

  } catch (err) {
    console.error('❌ Error:', err.message);
    res.write(`❌ Error: ${err.message}\n\n`);
    res.end();
  }
});

// ✅ Vercel Export: Do not use app.listen() in Vercel
// This allows Vercel to handle the server lifecycle
export default app;

// ✅ Local Development Fallback (Optional)
// If running locally with 'node server.js', this block will execute
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  initDB().then(() => {
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running at http://localhost:${PORT}`);
      console.log(`🔐 Google OAuth enabled`);
      console.log(`🧠 AI Prediction + Market Odds + Odds Range + Priority CO Sorting + MASTER ANALYSIS active`);
    });
    
    // Graceful shutdown for local dev
    process.on('SIGTERM', () => {
      server.close(() => {
        client.close();
        process.exit(0);
      });
    });
  });
}
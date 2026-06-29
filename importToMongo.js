// importToMongo.js
import { MongoClient } from 'mongodb';
import { readFile } from 'fs/promises';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function importToMongo() {
  const client = new MongoClient(process.env.MONGO_URI);

  try {
    await client.connect();
    console.log('✅ MongoDB ချိတ်ဆက်မှု အောင်မြင်ပါသည်။');

    const db = client.db('football_ai');
    const collection = db.collection('matches');

    const filePath = join(__dirname, 'football_data.json');
    const rawJson = await readFile(filePath, 'utf-8');
    const parsedData = JSON.parse(rawJson);
    const matches = Array.isArray(parsedData) ? parsedData : [parsedData];

    // ✅ KEEP ALL FIELDS - Don't map/filter anything
    const documents = matches.map(m => ({
      // ✅ Keep ALL original fields from JSON
      ...m,
      
      // ✅ Ensure imported_at timestamp
      imported_at: new Date()
    }));

    const result = await collection.insertMany(documents, { ordered: false });
    console.log(`🎉 ${result.insertedCount} မှတ်တမ်း MongoDB ထဲသို့ အောင်မြင်စွာ ဝင်ရောက်ပါသည်။`);

  } catch (err) {
    if (err.code === 11000) {
      console.warn('⚠️ အချို့မှတ်တမ်းများ Duplicate ဖြစ်နေသဖြင့် Skip လုပ်ထားပါသည်။');
    } else {
      console.error('❌ Error:', err.message);
    }
  } finally {
    await client.close();
    console.log('🔌 MongoDB ချိတ်ဆက်မှု ပိတ်သိမ်းပါသည်။');
    process.exit(0);
  }
}

importToMongo();
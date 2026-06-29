// test-connection.js - MongoDB Connection Test Only
import { MongoClient } from 'mongodb';
import 'dotenv/config';

const uri = process.env.MONGO_URI;
console.log('🔌 Testing connection to:', uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@'));

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000 // 5 seconds only
});

try {
  await client.connect();
  console.log('✅ SUCCESS! MongoDB Connected.');
  const dbs = await client.db().admin().listDatabases();
  console.log('📦 Databases:', dbs.databases.map(d => d.name).join(', '));
} catch (err) {
  console.error('❌ FAILED:', err.message);
  console.error('\n💡 အကြံပြုချက်:');
  console.error('  1. Atlas → Security → Network Access မှာ 0.0.0.0/0 ပါမပါ စစ်ပါ');
  console.error('  2. Firewall/Antivirus ကို ယာယီပိတ်ကြည့်ပါ');
  console.error('  3. Internet connection ကို စစ်ပါ');
} finally {
  await client.close();
}
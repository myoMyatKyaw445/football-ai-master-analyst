// test-mongo.js
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function testConnection() {
  console.log('🔄 Testing MongoDB connection...');
  console.log('📡 URI:', process.env.MONGO_URI.replace(/:[^:]+@/, ':***@')); // Hide password
  
  const client = new MongoClient(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 10000
  });
  
  try {
    await client.connect();
    console.log('✅ Connected successfully!');
    
    const db = client.db('football_ai');
    const collections = await db.listCollections().toArray();
    console.log('📊 Collections:', collections.map(c => c.name));
    
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    if (err.message.includes('ETIMEOUT')) {
      console.error('\n💡 This is a DNS/Network issue. Try:');
      console.error('   - ipconfig /flushdns');
      console.error('   - Check MongoDB Atlas IP whitelist');
      console.error('   - Use direct connection string instead of SRV');
    }
  } finally {
    await client.close();
    process.exit(0);
  }
}

testConnection();
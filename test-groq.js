// test-groq.js
import 'dotenv/config';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const GROQ_MODEL = 'llama-3.1-8b-instant';

async function testGroq() {
  try {
    console.log('🔑 Testing Groq API Key...');
    console.log('🔑 Key starts with:', GROQ_API_KEY?.substring(0, 8) + '...');
    console.log('🤖 Model:', GROQ_MODEL);
    
    const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: 'user', content: 'မင်္ဂလာပါ! ကျွန်တော်ကို ဘယ်လိုကူညီရမလဲ?' }
        ],
        stream: false,
        temperature: 0.1,
        max_tokens: 200
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Groq API Key is valid!');
      console.log('📊 Response:', data.choices[0]?.message?.content || 'N/A');
    } else {
      console.log('❌ Groq API Error:', response.status, response.statusText);
      const error = await response.text();
      console.log('📄 Error details:', error);
    }
  } catch (err) {
    console.error('❌ Connection Error:', err.message);
  }
}

testGroq();
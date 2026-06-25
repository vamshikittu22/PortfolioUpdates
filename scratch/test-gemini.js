const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const fs = require('fs');

// Simple .env parser
function parseEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const parts = trimmed.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim();
      env[key] = val;
    }
  });
  return env;
}

const env = parseEnv(path.join(__dirname, '../.env.local'));
const key = env.GEMINI_API_KEY;
console.log('Using Key:', key ? key.slice(0, 10) + '...' : 'none');

const genAI = new GoogleGenerativeAI(key);

async function testModel(modelName) {
  console.log(`Testing model: ${modelName}...`);
  try {
    const model = genAI.getGenerativeModel({ model: modelName });
    const res = await model.generateContent('Hello, reply with "test ok".');
    console.log(`  -> SUCCESS! Response:`, res.response.text().trim());
  } catch (e) {
    console.log(`  -> FAILED:`, e.message);
  }
}

async function run() {
  await testModel('gemini-1.5-flash');
  await testModel('gemini-2.5-flash');
  await testModel('gemini-2.0-flash');
  await testModel('gemini-1.5-pro');
  await testModel('gemini-1.0-pro');
}

run();

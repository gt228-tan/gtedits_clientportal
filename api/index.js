import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '../server/.env') });
} catch {
  // In production Vercel, process.env is injected by Vercel project environment variables
}

const app = require('../server/index.js');

export default app;

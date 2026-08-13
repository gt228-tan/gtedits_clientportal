const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express       = require('express');
const cors          = require('cors');
const connectDB     = require('./config/db');
const workRequests  = require('./routes/workRequests');
const projects      = require('./routes/projects');
const deliverables  = require('./routes/deliverables');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Routes ───────────────────────────────────────────────────
app.use('/api/work-requests', workRequests);
app.use('/api/projects',      projects);      // /api/projects/...
app.use('/api',               deliverables);  // /api/deliverables/..., /api/projects/:id/deliverables/...

// ── Health check ─────────────────────────────────────────────
app.get('/', (_, res) => res.json({ status: 'GT Client Portal API running ✅' }));

// ── Connect DB then start server ─────────────────────────────
connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
  });
});

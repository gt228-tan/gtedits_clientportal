const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express       = require('express');
const cors          = require('cors');
const connectDB     = require('./config/db');
const workRequests  = require('./routes/workRequests');
const projects      = require('./routes/projects');
const deliverables  = require('./routes/deliverables');
const aiPlanner     = require('./routes/aiPlanner');

const app  = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ───────────────────────────────────────────────
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(s => s.trim())
  : true;
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: '60mb' }));
app.use(express.urlencoded({ limit: '60mb', extended: true }));

// ── Middleware: Ensure MongoDB is connected ──────────────────
app.use(async (_req, _res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection error in request:', err.message);
    next(err);
  }
});

// ── Routes ───────────────────────────────────────────────────
app.use('/api/work-requests', workRequests);
app.use('/api/projects',      projects);      // /api/projects/...
app.use('/api/ai-planner',    aiPlanner);     // /api/ai-planner/analyze
app.use('/api',               deliverables);  // /api/deliverables/..., /api/projects/:id/deliverables/...

// ── Health check ─────────────────────────────────────────────
app.get('/api', (_, res) => res.json({ status: 'GT Client Portal API running ✅' }));
app.get('/',    (_, res) => res.json({ status: 'GT Client Portal API running ✅' }));

// ── Start standalone server if run directly ──────────────────
if (require.main === module) {
  connectDB().then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
    });
  }).catch((err) => {
    console.error('Failed to start server:', err.message);
  });
}

module.exports = app;


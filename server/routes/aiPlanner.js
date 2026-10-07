const express = require('express');
const router = express.Router();
const { analyzeAndPlanWorkRequest } = require('../services/geminiPlanner');

// ── POST /api/ai-planner/analyze — AI analyzes brief & generates plan ──
router.post('/analyze', async (req, res) => {
  try {
    const { prompt, clarifications, clientName } = req.body;

    if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Please provide a valid project description or request prompt.'
      });
    }

    const result = await analyzeAndPlanWorkRequest({
      prompt: prompt.trim(),
      clarifications: Array.isArray(clarifications) ? clarifications : [],
      clientName: clientName || '',
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    console.error('❌ AI Planner error:', err.message);
    const isApiKeyError = err.message.includes('GEMINI_API_KEY') || err.message.includes('API key');
    return res.status(500).json({
      success: false,
      error: isApiKeyError
        ? 'Gemini API Key is not configured or invalid on the server.'
        : `AI Planner error: ${err.message}`,
    });
  }
});

module.exports = router;

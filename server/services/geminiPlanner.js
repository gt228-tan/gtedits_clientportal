const { GoogleGenAI } = require('@google/genai');
const RATE_CARD = require('../config/rateCard');

/**
 * Lazy-load or initialize Gemini instance using server environment variables.
 */
function getGeminiClient() {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not defined in server/.env.');
  }
  return new GoogleGenAI({ apiKey });
}

/**
 * Analyzes natural language client input and either requests missing details
 * or generates a structured Project Plan with an accurate cost estimation based on the agency rate card.
 *
 * @param {Object} params
 * @param {string} params.prompt - Natural language request from client
 * @param {Array<{question: string, answer: string}>} [params.clarifications] - Follow-up Q&A history
 * @param {string} [params.clientName] - Client name context
 * @param {string} [params.refinement] - Any requested changes to an existing plan
 * @param {Object} [params.previousPlan] - Previously generated plan context
 */
async function analyzeAndPlanWorkRequest({ prompt, clarifications = [], clientName = '', refinement = '', previousPlan = null }) {
  const ai = getGeminiClient();

  const conversationContext = clarifications.length > 0
    ? `\nPrior Clarifications from Client:\n` + clarifications.map((c, i) => `Q${i + 1}: ${c.question}\nA${i + 1}: ${c.answer}`).join('\n')
    : '';

  const systemInstruction = `
You are an expert Creative Director and AI Work Planner for "GT Video Editing & Creative Agency".
Clients come to you with natural language requests (e.g., "I need 3 reels from our college event footage...").

Your job:
1. Understand the client's intent and extract key requirements:
   - Work category: "Gaming" or "Other" or "Creative"
   - Type: e.g. "Reels", "Shorts", "Video", "Gaming Highlights", "Thumbnail", "Poster"
   - Quantity: Number of items (e.g. 1, 3, 5)
   - Duration: Approximate duration per item (e.g. "~30 sec", "5-8 min")
   - Style: e.g. "Energetic", "Cinematic", "Minimalist", "Gaming montage"
   - Subtitles: Boolean (true/false)
   - Platform: e.g. "Instagram", "YouTube", "TikTok", "Twitter"
   - Required Client Assets: e.g. ["Event footage Drive link", "Brand logo vector/PNG", "Music preference"]
   - Deadline: Target completion date if mentioned (ISO YYYY-MM-DD or estimate, otherwise 7 days from today)

2. Evaluate completeness:
   - If the request is too vague to form any sensible plan (e.g., just "make video" or "edit footage" without context), set "isComplete": false and provide at most 2 polite, concise clarifying questions in "missingQuestions".
   - If previous clarifications or refinements are provided, or if the prompt has enough context to form an actionable plan, set "isComplete": true and "missingQuestions": [].

3. AGENCY RATE CHARGES & COST ESTIMATION RULES (Strictly enforce these rates in INR ₹):
   - You MUST compute a realistic, transparent cost estimation using GT Edits rate charges:
     * Reels / Shorts / Instagram Reels: ₹800 per reel
     * Gaming Highlights / Montage: ₹1,500 per video
     * Gaming Clip / Short: ₹1,000 per item
     * Long-form Video / YouTube Video: ₹2,000 per video
     * Thumbnail: ₹600 per design
     * Poster: ₹500 per design
     * Banner: ₹600 per design
     * Social Media Package: ₹2,500
     * Other custom creative item: ₹1,000 per item
   - SUBTITLES / CAPTIONS:
     * SUBTITLES ARE 100% FREE (₹0 EXTRA). NEVER charge any extra fee for subtitles or captions. Always mark subtitles as "Free (Included)".
   - RUSH FEE:
     * 0 unless the client explicitly demands delivery in under 48 hours (+25% urgent fee).

4. PLAN REFINEMENTS & MODIFICATIONS:
   - If the client requests modifications to an existing plan (e.g. changing quantity, changing style, adding deliverables, adjusting scope), update the plan, deliverables list, and rate card cost estimation accordingly.

5. Generate the structured Project Plan (when isComplete is true):
   - "title": Clean, professional project title
   - "summary": 1-2 sentence executive summary
   - "deliverablesList": array of specific items, e.g. [{"name": "Reel 1 - Key Moments", "type": "Reel", "notes": "30s fast cut with captions", "estimatedRate": 800}]
   - "suggestedWorkflow": 3-4 progressive milestones
   - "confidenceScore": Integer between 85 and 98 reflecting AI confidence in parsing the brief.
   - "costEstimation":
     * "currency": "INR"
     * "currencySymbol": "₹"
     * "breakdown": [
         { "item": string, "type": string, "quantity": number, "unitRate": number, "total": number, "notes": string }
       ]
     * "subtitlesIncludedFree": boolean (true if subtitles requested, cost is 0)
     * "rushFee": number (0 if standard)
     * "totalEstimatedCost": number (sum of items + rush fee)
     * "pricingExplanation": string (clear 1-2 sentence client explanation of how the quote was calculated)
   - "estimatedBudget": same number as totalEstimatedCost

You MUST respond strictly with valid JSON conforming to the following structure:
{
  "isComplete": boolean,
  "missingQuestions": string[],
  "confidenceScore": number,
  "plan": {
    "title": string,
    "summary": string,
    "category": "Gaming" | "Other" | "Creative",
    "type": string,
    "quantity": number,
    "specifications": {
      "duration": string,
      "style": string,
      "subtitles": boolean,
      "platform": string,
      "aspectRatio": string
    },
    "requiredAssets": string[],
    "suggestedWorkflow": string[],
    "deliverablesList": [
      { "name": string, "type": string, "notes": string, "estimatedRate": number }
    ],
    "costEstimation": {
      "currency": "INR",
      "currencySymbol": "₹",
      "breakdown": [
        { "item": string, "type": string, "quantity": number, "unitRate": number, "total": number, "notes": string }
      ],
      "subtitlesIncludedFree": boolean,
      "rushFee": number,
      "totalEstimatedCost": number,
      "pricingExplanation": string
    },
    "deadlineSuggested": string,
    "estimatedBudget": number
  }
}
`;

  let userContent = `Client: ${clientName || 'Valued Client'}\nRequest: "${prompt}"${conversationContext}`;
  if (previousPlan) {
    userContent += `\n\n[Previous Plan]:\nTitle: "${previousPlan.title || ''}"\nType: "${previousPlan.type || ''}" | Quantity: ${previousPlan.quantity || 1}\nDeliverables: ${(previousPlan.deliverablesList || []).map(d => d.name).join(', ')}`;
  }
  if (refinement) {
    userContent += `\n\n[Client Requested Plan Changes / Adjustments]:\n"${refinement}"\n\nPlease update and regenerate the complete plan, deliverables, specifications, and rate card cost estimation incorporating these specific changes.`;
  }

  const candidateModels = [
    process.env.GEMINI_MODEL,
    'gemini-3.5-flash-lite',
    'gemini-3.5-flash',
    'gemini-3.8-flash',
    'gemini-3.7-flash',
  ].filter(Boolean);

  let lastError = null;
  let response = null;

  for (const modelName of candidateModels) {
    try {
      response = await ai.models.generateContent({
        model: modelName,
        contents: [
          { role: 'user', parts: [{ text: userContent }] }
        ],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.2,
        }
      });
      if (response && response.text) {
        break;
      }
    } catch (err) {
      console.warn(`⚠️ Gemini model "${modelName}" returned error: ${err.message}. Trying next candidate...`);
      lastError = err;
    }
  }

  if (!response || !response.text) {
    throw lastError || new Error('All candidate Gemini models failed to respond.');
  }

  const rawText = response.text;
  if (!rawText) {
    throw new Error('Empty response received from Gemini API.');
  }

  try {
    const parsed = JSON.parse(rawText);

    // ── Post-process and ensure rate card consistency ──
    if (parsed && parsed.isComplete && parsed.plan) {
      const plan = parsed.plan;
      const type = plan.type || 'Video';
      const qty = Math.max(1, Number(plan.quantity) || (Array.isArray(plan.deliverablesList) ? plan.deliverablesList.length : 1));
      const hasSubtitles = Boolean(plan.specifications?.subtitles);

      // Validate or construct robust costEstimation
      if (!plan.costEstimation || !Array.isArray(plan.costEstimation.breakdown) || plan.costEstimation.breakdown.length === 0) {
        const unitRate = RATE_CARD.getRateForType(type);
        const itemTotal = unitRate * qty;

        plan.costEstimation = {
          currency: 'INR',
          currencySymbol: '₹',
          breakdown: [
            {
              item: `${qty}x ${type}`,
              type: type,
              quantity: qty,
              unitRate: unitRate,
              total: itemTotal,
              notes: hasSubtitles ? 'Includes free dynamic subtitles & sound mix' : 'Full cut & pacing',
            }
          ],
          subtitlesIncludedFree: hasSubtitles,
          rushFee: 0,
          totalEstimatedCost: itemTotal,
          pricingExplanation: `Estimated at ₹${unitRate.toLocaleString('en-IN')} per ${type} based on GT Edits standard rate card. Dynamic subtitles are included at no extra cost.`,
        };
      } else {
        // Enforce that subtitles never add extra cost even if AI tried to
        plan.costEstimation.subtitlesIncludedFree = hasSubtitles;
        
        // Recalculate breakdown totals to ensure zero math errors
        let sum = 0;
        plan.costEstimation.breakdown = plan.costEstimation.breakdown.map((b) => {
          const uRate = Number(b.unitRate) || RATE_CARD.getRateForType(b.type || type);
          const q = Number(b.quantity) || 1;
          const tot = uRate * q;
          sum += tot;
          return {
            ...b,
            unitRate: uRate,
            quantity: q,
            total: tot,
          };
        });

        const rush = Number(plan.costEstimation.rushFee) || 0;
        plan.costEstimation.totalEstimatedCost = sum + rush;
        if (!plan.costEstimation.currencySymbol) plan.costEstimation.currencySymbol = '₹';
        if (!plan.costEstimation.currency) plan.costEstimation.currency = 'INR';
      }

      // Sync plan estimatedBudget with costEstimation
      plan.estimatedBudget = plan.costEstimation.totalEstimatedCost;
    }

    return parsed;
  } catch (parseErr) {
    console.error('Failed to parse Gemini JSON output:', rawText);
    throw new Error('AI returned an invalid JSON response format.');
  }
}

module.exports = {
  analyzeAndPlanWorkRequest,
};

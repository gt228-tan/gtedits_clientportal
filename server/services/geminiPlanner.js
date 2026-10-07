const { GoogleGenAI } = require('@google/genai');

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
 * or generates a structured Project Plan.
 *
 * @param {Object} params
 * @param {string} params.prompt - Natural language request from client
 * @param {Array<{question: string, answer: string}>} [params.clarifications] - Follow-up Q&A history
 * @param {string} [params.clientName] - Client name context
 */
async function analyzeAndPlanWorkRequest({ prompt, clarifications = [], clientName = '' }) {
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
   - If previous clarifications are already provided, or if the initial prompt has enough context to form an actionable plan, set "isComplete": true and "missingQuestions": [].

3. Generate the structured Project Plan (when isComplete is true):
   - "title": Clean, professional project title
   - "summary": 1-2 sentence executive summary
   - "deliverablesList": array of specific items, e.g. [{"name": "Reel 1 - Key Moments", "type": "Reel", "notes": "30s fast cut with captions"}]
   - "suggestedWorkflow": 3-4 progressive milestones (e.g. ["1. Raw Footage Ingestion & Selection", "2. Rough Cut & Pacing", "3. Subtitles, SFX & Color Grade", "4. Final Review & Delivery"])
   - "confidenceScore": Integer between 85 and 98 reflecting AI confidence in parsing the brief.

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
      { "name": string, "type": string, "notes": string }
    ],
    "deadlineSuggested": string,
    "estimatedBudget": number
  }
}
`;

  const userContent = `Client: ${clientName || 'Valued Client'}\nRequest: "${prompt}"${conversationContext}`;

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
    return parsed;
  } catch (parseErr) {
    console.error('Failed to parse Gemini JSON output:', rawText);
    throw new Error('AI returned an invalid JSON response format.');
  }
}

module.exports = {
  analyzeAndPlanWorkRequest,
};

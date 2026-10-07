const mongoose = require('mongoose');

// ── Valid types per category ─────────────────────────────────
const GAMING_TYPES = ['Gaming Highlights', 'Shorts', 'Reel', 'Reels', 'Thumbnail', 'Banner', 'Poster'];
const OTHER_TYPES  = ['Reels', 'Reel', 'Shorts', 'Video', 'Thumbnail', 'Poster', 'Instagram Reel', 'Social Media Package', 'Other'];
const ALL_TYPES    = [...new Set([...GAMING_TYPES, ...OTHER_TYPES])];

const WorkRequestSchema = new mongoose.Schema({
  clientId:          { type: String, required: true },   // Firebase RTDB Client ID
  clientFirebaseUid: { type: String, default: '' },      // Firebase Auth UID
  clientName:        { type: String, required: true },   // Client full name
  title:             { type: String, default: '', trim: true }, // Request title

  // ── Category & Type ─────────────────────────────────────────
  category: {
    type: String,
    enum: ['Gaming', 'Other', 'Creative'],
    required: true,
  },
  type: {
    type: String,
    enum: ALL_TYPES,
    required: true,
  },
  gameName: { type: String, default: '' },         // Only when category = 'Gaming'

  // ── Submission Details ───────────────────────────────────────
  materials: { type: String, default: '' },        // YT / Drive / Dropbox link
  image:     { type: String, default: '' },        // Single image attachment (base64 or URL < 50MB)
  budget:    { type: Number, default: 0 },         // Budget in ₹ (default 0 if to be negotiated)
  deadline:  { type: Date,   required: true },     // Target completion date
  remarks:   { type: String, default: '' },        // Color theme, character, description, etc.

  // ── AI Planner Fields (from newiddea.txt) ───────────────────
  aiGenerated:        { type: Boolean, default: false },
  aiConfidence:       { type: Number, default: null },       // e.g. 94 (%)
  aiOriginalPrompt:   { type: String, default: '' },         // Raw user natural language prompt
  quantity:           { type: Number, default: 1 },          // e.g. 3
  specifications: {
    duration:         { type: String, default: '' },         // e.g. "~30 sec"
    style:            { type: String, default: '' },         // e.g. "Energetic"
    subtitles:        { type: Boolean, default: false },     // true/false
    platform:         { type: String, default: '' },         // e.g. "Instagram"
    aspectRatio:      { type: String, default: '' },         // e.g. "9:16"
  },
  requiredAssets:     [{ type: String }],                    // e.g. ["Event footage", "Brand Logo"]
  suggestedWorkflow:  [{ type: String }],                    // e.g. ["1. First Draft", "2. Client Review", "3. Revisions", "4. Final Delivery"]
  deliverablesList:   [{
    name:             { type: String },                      // e.g. "Reel 1 - Event Highlight"
    type:             { type: String },                      // e.g. "Reel"
    notes:            { type: String, default: '' },
  }],

  // ── Admin-side fields ────────────────────────────────────────
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Revision'],
    default: 'Pending',
  },
  adminNote:          { type: String, default: '' },        // Admin feedback / revision note
  approvalEmailSent:  { type: Boolean, default: false },    // Prevent sending duplicate approval emails
  rejectionEmailSent: { type: Boolean, default: false },    // Prevent sending duplicate rejection emails
}, { timestamps: true });

module.exports = mongoose.model('WorkRequest', WorkRequestSchema);

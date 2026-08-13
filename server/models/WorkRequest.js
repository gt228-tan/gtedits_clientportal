const mongoose = require('mongoose');

// ── Valid types per category ─────────────────────────────────
const GAMING_TYPES = ['Gaming Highlights', 'Shorts', 'Reel', 'Thumbnail', 'Banner', 'Poster'];
const OTHER_TYPES  = ['Reels', 'Shorts', 'Video', 'Thumbnail', 'Poster'];
const ALL_TYPES    = [...new Set([...GAMING_TYPES, ...OTHER_TYPES])];

const WorkRequestSchema = new mongoose.Schema({
  clientId:          { type: String, required: true },   // Firebase RTDB Client ID
  clientFirebaseUid: { type: String, default: '' },      // Firebase Auth UID
  clientName:        { type: String, required: true },   // Client full name
  title:             { type: String, default: '', trim: true }, // Optional request title

  // ── Category & Type ─────────────────────────────────────────
  category: {
    type: String,
    enum: ['Gaming', 'Other'],
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
  budget:    { type: Number, required: true },     // Budget in ₹
  deadline:  { type: Date,   required: true },     // Target completion date
  remarks:   { type: String, default: '' },        // Color theme, character, etc.

  // ── Admin-side fields ────────────────────────────────────────
  status: {
    type: String,
    enum: ['Pending', 'Approved', 'Rejected', 'Revision'],
    default: 'Pending',
  },
  adminNote: { type: String, default: '' },        // Admin feedback / revision note
}, { timestamps: true });

module.exports = mongoose.model('WorkRequest', WorkRequestSchema);

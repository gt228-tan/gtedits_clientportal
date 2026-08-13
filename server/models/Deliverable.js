const mongoose = require('mongoose');

const DeliverableSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },

    // Denormalised client UID for fast security checks
    clientFirebaseUid: {
      type: String,
      required: true,
    },

    // Firebase UID of the admin/uploader
    uploadedBy: {
      type: String,
      required: true,
    },

    // ── Deliverable type ──────────────────────────────────────
    type: {
      type: String,
      enum: ['file', 'link'],
      required: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String,
      default: '',
    },

    // ── File-specific fields (null for links) ─────────────────
    fileId: {
      type: mongoose.Schema.Types.ObjectId, // GridFS file _id
      default: null,
    },
    originalFileName: {
      type: String,
      default: null,
    },
    mimeType: {
      type: String,
      default: null,
    },
    fileSize: {
      type: Number, // bytes
      default: null,
    },

    // ── Link-specific fields (null for files) ─────────────────
    url: {
      type: String,
      default: null,
    },

    // ── Client permissions ────────────────────────────────────
    allowDownload: {
      type: Boolean,
      default: true,
    },

    // ── Versioning ────────────────────────────────────────────
    version: {
      type: Number,
      required: true,
      min: 1,
    },

    // ── Status lifecycle ──────────────────────────────────────
    status: {
      type: String,
      enum: [
        'draft',
        'awaiting_approval',
        'approved',
        'revision_requested',
        'superseded',
      ],
      default: 'awaiting_approval',
    },

    // ── Approval snapshot ─────────────────────────────────────
    approvedBy: {
      type: String, // Firebase UID
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
DeliverableSchema.index({ projectId: 1, version: -1 });
DeliverableSchema.index({ clientFirebaseUid: 1 });
DeliverableSchema.index({ status: 1 });
DeliverableSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Deliverable', DeliverableSchema);

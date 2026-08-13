const mongoose = require('mongoose');

const PROJECT_STATUSES = [
  'work_request',
  'approved',
  'project_created',
  'in_progress',
  'deliverable_uploaded',
  'awaiting_client_approval',
  'approved_by_client',
  'revision_requested',
  'in_revision',
  'completed',
];

const ProjectSchema = new mongoose.Schema(
  {
    // ── Client linkage ────────────────────────────────────────
    firebaseClientId: {
      type: String,
      required: true, // Firebase RTDB key (e.g. "-NxyzABC")
    },
    clientFirebaseUid: {
      type: String,
      required: true, // Firebase Auth UID of the client
    },
    clientName: {
      type: String,
      required: true,
      trim: true,
    },

    // ── Project info ──────────────────────────────────────────
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },

    // ── Status lifecycle ──────────────────────────────────────
    status: {
      type: String,
      enum: PROJECT_STATUSES,
      default: 'project_created',
    },

    // ── Approval snapshot ─────────────────────────────────────
    approvedBy: {
      type: String, // Firebase UID of the client who approved
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    approvedDeliverableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deliverable',
      default: null,
    },
    approvedVersion: {
      type: Number,
      default: null,
    },

    // ── Source Work Request linkage (if auto-created) ─────────
    workRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'WorkRequest',
      default: null,
    },
  },
  { timestamps: true }
);

// Indexes
ProjectSchema.index({ firebaseClientId: 1 });
ProjectSchema.index({ clientFirebaseUid: 1 });
ProjectSchema.index({ status: 1 });

module.exports = mongoose.model('Project', ProjectSchema);
module.exports.PROJECT_STATUSES = PROJECT_STATUSES;

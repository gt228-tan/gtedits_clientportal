const mongoose = require('mongoose');

const RevisionRequestSchema = new mongoose.Schema(
  {
    projectId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    deliverableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deliverable',
      required: true,
    },
    deliverableVersion: {
      type: Number,
      required: true,
    },

    // Firebase UID of the client requesting revision
    clientFirebaseUid: {
      type: String,
      required: true,
    },
    clientName: {
      type: String,
      default: '',
    },

    description: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ['requested', 'acknowledged', 'in_progress', 'resolved'],
      default: 'requested',
    },

    adminNote: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

RevisionRequestSchema.index({ projectId: 1 });
RevisionRequestSchema.index({ deliverableId: 1 });
RevisionRequestSchema.index({ clientFirebaseUid: 1 });

module.exports = mongoose.model('RevisionRequest', RevisionRequestSchema);

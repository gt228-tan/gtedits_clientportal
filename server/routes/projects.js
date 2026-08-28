const express  = require('express');
const router   = express.Router();
const Project  = require('../models/Project');
const Deliverable = require('../models/Deliverable');
const { requireAuth } = require('../middleware/auth');
const { getClientContactEmail, isRealEmail, readClientFromRTDB } = require('../utils/getClientEmail');
const { sendClientPaymentReminderNotification } = require('../utils/sendEmail');
const { generateInvoicePdfBuffer } = require('../utils/generateInvoicePdf');

router.get('/client/mine', requireAuth('client'), async (req, res) => {
  try {
    const projects = await Project.find({ clientFirebaseUid: req.uid }).sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


router.post('/', requireAuth('admin'), async (req, res) => {
  try {
    const { firebaseClientId, clientFirebaseUid, clientName, title, description } = req.body;

    if (!firebaseClientId || !clientFirebaseUid || !clientName || !title) {
      return res.status(400).json({ error: 'firebaseClientId, clientFirebaseUid, clientName and title are required' });
    }
    if (!clientFirebaseUid || clientFirebaseUid.trim() === '') {
      return res.status(400).json({ error: 'clientFirebaseUid is required — ensure the client has completed Firebase Auth setup.' });
    }

    const project = await Project.create({
      firebaseClientId,
      clientFirebaseUid,
      clientName,
      title,
      description: description || '',
      status: 'project_created',
    });

    res.status(201).json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});


router.get('/', requireAuth('admin'), async (req, res) => {
  try {
    const filter = {};
    if (req.query.clientUid)        filter.clientFirebaseUid = req.query.clientUid;
    if (req.query.firebaseClientId) filter.firebaseClientId  = req.query.firebaseClientId;

    const projects = await Project.find(filter).sort({ createdAt: -1 }).lean();

    // Attach latest RevisionRequest for each project if available
    const projectIds = projects.map(p => p._id);
    const RevisionRequest = require('../models/RevisionRequest');
    const revisions = await RevisionRequest.find({ projectId: { $in: projectIds } })
      .sort({ createdAt: -1 })
      .lean();

    const revisionMap = {};
    revisions.forEach(r => {
      const pIdStr = r.projectId.toString();
      if (!revisionMap[pIdStr]) {
        revisionMap[pIdStr] = r;
      }
    });

    const enriched = projects.map(p => ({
      ...p,
      latestRevision: revisionMap[p._id.toString()] || null,
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/projects/:projectId
// Admin: get a single project
// ─────────────────────────────────────────────────────────────
router.get('/:projectId', requireAuth('admin'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/projects/:projectId/status
// Admin: update project status
// ─────────────────────────────────────────────────────────────
router.patch('/:projectId/status', requireAuth('admin'), async (req, res) => {
  try {
    const { status } = req.body;
    const VALID = [
      'work_request', 'approved', 'project_created', 'in_progress',
      'deliverable_uploaded', 'awaiting_client_approval', 'awaiting_client_response', 'approved_by_client',
      'revision_requested', 'in_revision', 'completed',
    ];
    if (!VALID.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const project = await Project.findByIdAndUpdate(
      req.params.projectId,
      { status },
      { new: true, runValidators: true }
    );
    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json(project);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/projects/:projectId
// Admin: delete project (also cleans up deliverables)
// ─────────────────────────────────────────────────────────────
router.delete('/:projectId', requireAuth('admin'), async (req, res) => {
  try {
    const project = await Project.findByIdAndDelete(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Cascade delete deliverables
    await Deliverable.deleteMany({ projectId: req.params.projectId });

    res.json({ message: 'Project deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.all('/clients/:clientId/send-payment-reminder', requireAuth('admin'), async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    let clientData = req.body?.clientData || null;

    if (!clientData) {
      clientData = await readClientFromRTDB(clientId);
    }

    if (!clientData) {
      const ClientEmail = require('../models/ClientEmail');
      const mongoRecord = await ClientEmail.findOne({ clientId });
      const mongoProj   = await Project.findOne({ firebaseClientId: clientId });
      if (mongoRecord || mongoProj) {
        clientData = {
          name: mongoRecord?.clientName || mongoProj?.clientName || 'Client',
          uid: mongoProj?.clientFirebaseUid || '',
          contactEmail: mongoRecord?.contactEmail || mongoProj?.clientEmail || '',
          work: {},
        };
      }
    }

    if (!clientData) {
      return res.status(404).json({ error: 'Client record not found. Please ensure client details exist.' });
    }

    const clientName = clientData.name || clientData.clientName || 'Client';
    const clientUid  = clientData.uid || '';

    const clientEmail = await getClientContactEmail(clientId, clientUid, clientName);
    if (!clientEmail || !isRealEmail(clientEmail)) {
      return res.status(400).json({ error: `Client "${clientName}" does not have a valid contact email configured.` });
    }

    const workData = clientData.work || {};

    let grandTotal = 0;
    const remainingItems = Object.values(workData).filter(w => (w.status || 'Pending') !== 'Paid');
    remainingItems.forEach(w => {
      const qty       = Number(w.qty || 1);
      const rate      = Number(w.price || w.amt || 0);
      const lineTotal = qty * rate;
      const status    = w.status || 'Pending';
      const advAmt    = Number(w.advance || 0);
      const dueAmt    = status === 'Pending' ? lineTotal : status === 'Advance' ? Math.max(0, lineTotal - advAmt) : 0;
      grandTotal += dueAmt;
    });

    let pdfBuffer = null;
    if (req.body.pdfBase64) {
      try {
        pdfBuffer = Buffer.from(req.body.pdfBase64.replace(/^data:application\/pdf;base64,/, ''), 'base64');
      } catch (err) {
        console.warn('Failed to parse pdfBase64 from payload:', err.message);
      }
    }

    if (!pdfBuffer) {
      pdfBuffer = await generateInvoicePdfBuffer({
        clientName,
        work: workData,
        brandName: 'GT Edits',
      });
    }

    const projectObj = { title: 'GT Edits Work Items' };

    const result = await sendClientPaymentReminderNotification({
      clientEmail,
      clientName,
      project: projectObj,
      grandTotal,
      pdfBuffer,
    });

    if (result && result.success === false) {
      return res.status(400).json({ error: result.reason || 'Failed to send payment reminder email.' });
    }

    res.json({
      message: `Payment reminder email with invoice attachment sent successfully to ${clientEmail}!`,
      clientEmail,
    });
  } catch (err) {
    console.error('Error sending client payment reminder:', err);
    res.status(500).json({ error: err.message || 'Failed to send payment reminder email' });
  }
});

module.exports = router;

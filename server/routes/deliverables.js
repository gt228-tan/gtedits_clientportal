const express = require('express');
const router = express.Router();
const multer = require('multer');
const mongoose = require('mongoose');
const Project = require('../models/Project');
const Deliverable = require('../models/Deliverable');
const RevisionRequest = require('../models/RevisionRequest');
const { requireAuth } = require('../middleware/auth');
const { getDeliverablesBucket } = require('../config/gridfs');
const { sendClientDeliverableNotification, sendClientPaymentReminderNotification } = require('../utils/sendEmail');
const { getClientContactEmail, isRealEmail, readClientFromRTDB } = require('../utils/getClientEmail');
const { generateInvoicePdfBuffer } = require('../utils/generateInvoicePdf');


// ── Max file size: 50MB ─────────────────────────────────────
const MAX_SIZE = 50 * 1024 * 1024;

// ── Multer: memory storage (stream directly to GridFS) ────────
// We use memoryStorage so multer holds the file in a Buffer.
// For very large files this could be an issue, but since our
// hard limit is 100 MB and we reject above that immediately
// via fileSize limit, this remains safe and avoids disk I/O.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE },
  fileFilter: (_req, _file, cb) => {
    // Accept ALL file types — restriction is size only
    cb(null, true);
  },
});

// ── Helpers ───────────────────────────────────────────────────

/** Validate that a URL uses http/https only */
function isValidUrl(str) {
  try {
    const u = new URL(str);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Format bytes to human-readable string */
function formatBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

/**
 * Upload a Buffer to GridFS using an upload stream.
 * Returns the GridFS file _id.
 */
function uploadBufferToGridFS(bucket, buffer, filename, metadata) {
  return new Promise((resolve, reject) => {
    const uploadStream = bucket.openUploadStream(filename, { metadata });
    uploadStream.on('error', reject);
    uploadStream.on('finish', (file) => resolve(uploadStream.id));
    uploadStream.end(buffer);
  });
}

// ─────────────────────────────────────────────────────────────
// POST /api/projects/:projectId/deliverables/file
// Admin: upload a file deliverable
// ─────────────────────────────────────────────────────────────
router.post(
  '/projects/:projectId/deliverables/file',
  requireAuth('admin'),
  upload.single('file'),
  async (req, res) => {
    try {
      // ── 1. Validate project exists ────────────────────────
      const project = await Project.findById(req.params.projectId);
      if (!project) return res.status(404).json({ error: 'Project not found' });

      // ── 2. File present? ──────────────────────────────────
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

      const { name, description, allowDownload } = req.body;
      if (!name || !name.trim()) {
        return res.status(400).json({ error: 'Deliverable name is required' });
      }

      // ── 3. Size guard (multer already limits, but double-check) ─
      if (req.file.size > MAX_SIZE) {
        return res.status(400).json({ error: 'File size must be 100 MB or less.' });
      }

      // ── 4. Determine next version ─────────────────────────
      const latestDeliverable = await Deliverable.findOne(
        { projectId: project._id },
        {},
        { sort: { version: -1 } }
      );
      const nextVersion = latestDeliverable ? latestDeliverable.version + 1 : 1;

      // ── 5. Mark previous versions as superseded ───────────
      if (latestDeliverable) {
        await Deliverable.updateMany(
          { projectId: project._id, status: { $ne: 'superseded' } },
          { $set: { status: 'superseded' } }
        );
      }

      // ── 6. Stream to GridFS ───────────────────────────────
      const bucket = getDeliverablesBucket();
      const gridMetadata = {
        projectId: project._id.toString(),
        clientId: project.clientFirebaseUid,
        uploadedBy: req.uid,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
        version: nextVersion,
        type: 'file',
      };
      const fileId = await uploadBufferToGridFS(
        bucket,
        req.file.buffer,
        req.file.originalname,
        gridMetadata
      );

      // ── 7. Create Deliverable document ────────────────────
      const deliverable = await Deliverable.create({
        projectId: project._id,
        clientFirebaseUid: project.clientFirebaseUid,
        uploadedBy: req.uid,
        type: 'file',
        name: name.trim(),
        description: description || '',
        fileId,
        originalFileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size,
        url: null,
        version: nextVersion,
        allowDownload: allowDownload !== undefined ? String(allowDownload) !== 'false' : true,
        status: 'awaiting_approval',
      });

      // ── 8. Update project status ──────────────────────────
      await Project.findByIdAndUpdate(project._id, {
        status: 'awaiting_client_response',
      });

      // ── 9. Notify client via email ────────────────────────
      try {
        const clientEmail = await getClientContactEmail(project.firebaseClientId, project.clientFirebaseUid, project.clientName);
        if (clientEmail) {
          await sendClientDeliverableNotification({
            clientEmail,
            clientName: project.clientName,
            project,
            deliverable,
          });
        }
      } catch (emailErr) {
        console.error('Failed to notify client of deliverable upload:', emailErr.message);
      }

      res.status(201).json({
        deliverable,
        message: `Version ${nextVersion} uploaded successfully (${formatBytes(req.file.size)})`,
      });
    } catch (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size must be 100 MB or less.' });
      }
      console.error('[deliverables/file]', err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ─────────────────────────────────────────────────────────────
// POST /api/projects/:projectId/deliverables/link
// Admin: add an external link deliverable
// ─────────────────────────────────────────────────────────────
router.post('/projects/:projectId/deliverables/link', requireAuth('admin'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const { name, description, url } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Deliverable name is required' });
    if (!url || !url.trim()) return res.status(400).json({ error: 'URL is required' });
    if (!isValidUrl(url)) return res.status(400).json({ error: 'URL must use http:// or https://' });

    // Next version
    const latest = await Deliverable.findOne({ projectId: project._id }, {}, { sort: { version: -1 } });
    const nextVersion = latest ? latest.version + 1 : 1;

    // Supersede previous
    if (latest) {
      await Deliverable.updateMany(
        { projectId: project._id, status: { $ne: 'superseded' } },
        { $set: { status: 'superseded' } }
      );
    }

    const deliverable = await Deliverable.create({
      projectId: project._id,
      clientFirebaseUid: project.clientFirebaseUid,
      uploadedBy: req.uid,
      type: 'link',
      name: name.trim(),
      description: description || '',
      fileId: null,
      originalFileName: null,
      mimeType: null,
      fileSize: null,
      url: url.trim(),
      version: nextVersion,
      status: 'awaiting_approval',
    });

    await Project.findByIdAndUpdate(project._id, { status: 'awaiting_client_response' });

    // Notify client via email
    try {
      const clientEmail = await getClientContactEmail(project.firebaseClientId, project.clientFirebaseUid, project.clientName);
      if (clientEmail) {
        await sendClientDeliverableNotification({
          clientEmail,
          clientName: project.clientName,
          project,
          deliverable,
        });
      }
    } catch (emailErr) {
      console.error('Failed to notify client of link deliverable upload:', emailErr.message);
    }

    res.status(201).json({ deliverable });
  } catch (err) {
    console.error('[deliverables/link]', err);
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/projects/:projectId/deliverables
// Admin: list all deliverables for a project
// ─────────────────────────────────────────────────────────────
router.get('/projects/:projectId/deliverables', requireAuth('admin'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const deliverables = await Deliverable.find({ projectId: project._id }).sort({ version: -1 });
    res.json(deliverables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/deliverables/:deliverableId
// Admin: get one deliverable
// ─────────────────────────────────────────────────────────────
router.get('/deliverables/:deliverableId', requireAuth('admin'), async (req, res) => {
  try {
    const d = await Deliverable.findById(req.params.deliverableId);
    if (!d) return res.status(404).json({ error: 'Deliverable not found' });
    res.json(d);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/deliverables/:deliverableId/download
// Authenticated: stream file from GridFS
// ─────────────────────────────────────────────────────────────
router.get('/deliverables/:deliverableId/download', requireAuth(), async (req, res) => {
  try {
    const d = await Deliverable.findById(req.params.deliverableId).populate('projectId');
    if (!d) return res.status(404).json({ error: 'Deliverable not found' });
    if (d.type !== 'file' || !d.fileId) {
      return res.status(400).json({ error: 'This deliverable has no file' });
    }

    // Security: clients may only access their own project
    if (req.role === 'client' && d.clientFirebaseUid !== req.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Security: check if admin has disabled client download
    if (req.role === 'client' && d.allowDownload === false) {
      return res.status(403).json({ error: 'Download access is disabled by Admin for this deliverable.' });
    }

    const bucket = getDeliverablesBucket();
    const fileId = new mongoose.Types.ObjectId(d.fileId);

    // Set headers
    const mimeType = d.mimeType || 'application/octet-stream';
    const fileName = encodeURIComponent(d.originalFileName || 'download');
    res.set('Content-Type', mimeType);
    res.set('Content-Disposition', `attachment; filename="${d.originalFileName || 'download'}"; filename*=UTF-8''${fileName}`);
    if (d.fileSize) res.set('Content-Length', d.fileSize);

    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.on('error', (err) => {
      if (!res.headersSent) res.status(500).json({ error: 'File stream error' });
    });
    downloadStream.pipe(res);
  } catch (err) {
    console.error('[download]', err);
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/deliverables/:deliverableId/preview
// Authenticated: stream file inline (for browser preview)
// ─────────────────────────────────────────────────────────────
router.get('/deliverables/:deliverableId/preview', requireAuth(), async (req, res) => {
  try {
    const d = await Deliverable.findById(req.params.deliverableId);
    if (!d) return res.status(404).json({ error: 'Deliverable not found' });
    if (d.type !== 'file' || !d.fileId) {
      return res.status(400).json({ error: 'No file to preview' });
    }

    if (req.role === 'client' && d.clientFirebaseUid !== req.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const bucket = getDeliverablesBucket();
    const fileId = new mongoose.Types.ObjectId(d.fileId);

    const mimeType = d.mimeType || 'application/octet-stream';
    res.set('Content-Type', mimeType);
    res.set('Content-Disposition', `inline; filename="${d.originalFileName || 'preview'}"`);
    if (d.fileSize) res.set('Content-Length', d.fileSize);

    const downloadStream = bucket.openDownloadStream(fileId);
    downloadStream.on('error', () => {
      if (!res.headersSent) res.status(500).json({ error: 'File stream error' });
    });
    downloadStream.pipe(res);
  } catch (err) {
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// DELETE /api/deliverables/:deliverableId
// Admin: delete a deliverable (and its GridFS file)
// ─────────────────────────────────────────────────────────────
router.delete('/deliverables/:deliverableId', requireAuth('admin'), async (req, res) => {
  try {
    const d = await Deliverable.findByIdAndDelete(req.params.deliverableId);
    if (!d) return res.status(404).json({ error: 'Deliverable not found' });

    // Delete GridFS file if applicable
    if (d.fileId) {
      try {
        const bucket = getDeliverablesBucket();
        await bucket.delete(new mongoose.Types.ObjectId(d.fileId));
      } catch (gridErr) {
        console.warn('[delete] GridFS delete failed:', gridErr.message);
      }
    }

    res.json({ message: 'Deliverable deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// PATCH /api/deliverables/:deliverableId/toggle-download
// Admin: toggle download permission for a deliverable
// ─────────────────────────────────────────────────────────────
router.patch('/deliverables/:deliverableId/toggle-download', requireAuth('admin'), async (req, res) => {
  try {
    const d = await Deliverable.findById(req.params.deliverableId);
    if (!d) return res.status(404).json({ error: 'Deliverable not found' });

    const allowDownload = typeof req.body.allowDownload === 'boolean'
      ? req.body.allowDownload
      : !d.allowDownload;

    d.allowDownload = allowDownload;
    await d.save();

    res.json({ message: `Download permission updated to ${allowDownload ? 'Allowed' : 'Blocked'}`, deliverable: d });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/deliverables/:deliverableId/send-payment-reminder
// Admin: send payment reminder email with remaining payment invoice attachment
// ─────────────────────────────────────────────────────────────
router.post('/deliverables/:deliverableId/send-payment-reminder', requireAuth('admin'), async (req, res) => {
  try {
    const deliverable = await Deliverable.findById(req.params.deliverableId);
    if (!deliverable) return res.status(404).json({ error: 'Deliverable not found' });

    const project = await Project.findById(deliverable.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Fetch client contact email
    const clientEmail = await getClientContactEmail(project.firebaseClientId, project.clientFirebaseUid, project.clientName);
    if (!clientEmail || !isRealEmail(clientEmail)) {
      return res.status(400).json({ error: `Client "${project.clientName}" does not have a valid contact email configured.` });
    }

    // Read client data from Firebase RTDB
    const clientData = await readClientFromRTDB(project.firebaseClientId);
    const workData = clientData?.work || {};

    // Calculate grand total of remaining items
    let grandTotal = 0;
    const remainingItems = Object.values(workData).filter(w => (w.status || 'Pending') !== 'Paid');
    remainingItems.forEach(w => {
      const qty = Number(w.qty || 1);
      const rate = Number(w.price || w.amt || 0);
      const lineTotal = qty * rate;
      const status = w.status || 'Pending';
      const advAmt = Number(w.advance || 0);
      const dueAmt = status === 'Pending' ? lineTotal : status === 'Advance' ? Math.max(0, lineTotal - advAmt) : 0;
      grandTotal += dueAmt;
    });

    let pdfBuffer = null;
    if (req.body.pdfBase64) {
      try {
        pdfBuffer = Buffer.from(req.body.pdfBase64.replace(/^data:application\/pdf;base64,/, ''), 'base64');
      } catch (err) {
        console.warn('Failed to parse pdfBase64 from payload, falling back to server generation:', err.message);
      }
    }

    if (!pdfBuffer) {
      pdfBuffer = await generateInvoicePdfBuffer({
        clientName: project.clientName,
        work: workData,
        brandName: 'GT Edits',
      });
    }

    const result = await sendClientPaymentReminderNotification({
      clientEmail,
      clientName: project.clientName,
      project,
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
    console.error('Error sending payment reminder:', err);
    res.status(500).json({ error: err.message || 'Failed to send payment reminder email' });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/clients/:clientId/send-payment-reminder
// Admin: send payment reminder email directly to a client from dashboard
// ─────────────────────────────────────────────────────────────
router.post('/clients/:clientId/send-payment-reminder', requireAuth('admin'), async (req, res) => {
  try {
    const { clientId } = req.params;
    if (!clientId) return res.status(400).json({ error: 'clientId is required' });

    // Read client record: payload > RTDB > Mongo
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

    // Resolve contact email
    const clientEmail = await getClientContactEmail(clientId, clientUid, clientName);
    if (!clientEmail || !isRealEmail(clientEmail)) {
      return res.status(400).json({ error: `Client "${clientName}" does not have a valid contact email configured.` });
    }

    const workData = clientData.work || {};

    // Calculate grand total of remaining unpaid/advance items
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
        console.warn('Failed to parse pdfBase64 from payload, falling back to server generation:', err.message);
      }
    }

    if (!pdfBuffer) {
      pdfBuffer = await generateInvoicePdfBuffer({
        clientName,
        work: workData,
        brandName: 'GT Edits',
      });
    }

    const projectObj = {
      title: 'GT Edits Work Items',
    };

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



// ─────────────────────────────────────────────────────────────
// GET /api/client/projects/:projectId/deliverables
// Client: list deliverables for own project (latest first)
// ─────────────────────────────────────────────────────────────
router.get('/client/projects/:projectId/deliverables', requireAuth('client'), async (req, res) => {
  try {
    const project = await Project.findById(req.params.projectId);
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Security: verify this project belongs to the authenticated client
    if (project.clientFirebaseUid !== req.uid) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const deliverables = await Deliverable.find({ projectId: project._id }).sort({ version: -1 });
    res.json(deliverables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const {
  sendAdminApprovalNotification,
  sendAdminRevisionNotification,
} = require('../utils/sendEmail');

// ─────────────────────────────────────────────────────────────
// POST /api/deliverables/:deliverableId/approve
// Client: approve a deliverable
// ─────────────────────────────────────────────────────────────
router.post('/deliverables/:deliverableId/approve', requireAuth('client'), async (req, res) => {
  try {
    const d = await Deliverable.findById(req.params.deliverableId);
    if (!d) return res.status(404).json({ error: 'Deliverable not found' });

    // Security
    if (d.clientFirebaseUid !== req.uid) return res.status(403).json({ error: 'Forbidden' });
    if (d.status !== 'awaiting_approval') {
      return res.status(400).json({ error: 'This deliverable is not awaiting approval' });
    }

    // Mark deliverable as approved
    d.status = 'approved';
    d.approvedBy = req.uid;
    d.approvedAt = new Date();
    await d.save();

    // Update project to completed
    const project = await Project.findByIdAndUpdate(
      d.projectId,
      {
        status: 'completed',
        approvedBy: req.uid,
        approvedAt: new Date(),
        approvedDeliverableId: d._id,
        approvedVersion: d.version,
      },
      { new: true }
    );

    // Send email notification to admin asynchronously
    if (project) {
      sendAdminApprovalNotification({ deliverable: d, project }).catch(err => {
        console.error('Failed sending admin approval email:', err.message);
      });
    }

    res.json({ message: 'Deliverable approved', deliverable: d });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/deliverables/:deliverableId/request-revision
// Client: request a revision
// ─────────────────────────────────────────────────────────────
router.post('/deliverables/:deliverableId/request-revision', requireAuth('client'), async (req, res) => {
  try {
    const d = await Deliverable.findById(req.params.deliverableId);
    if (!d) return res.status(404).json({ error: 'Deliverable not found' });
    if (d.clientFirebaseUid !== req.uid) return res.status(403).json({ error: 'Forbidden' });
    if (d.status !== 'awaiting_approval') {
      return res.status(400).json({ error: 'This deliverable is not awaiting approval' });
    }

    const { description, clientName } = req.body;
    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'A revision description is required' });
    }

    // Mark deliverable as revision_requested
    d.status = 'revision_requested';
    await d.save();

    // Create revision request record
    const revision = await RevisionRequest.create({
      projectId: d.projectId,
      deliverableId: d._id,
      deliverableVersion: d.version,
      clientFirebaseUid: req.uid,
      clientName: clientName || '',
      description: description.trim(),
    });

    // Update project status
    const project = await Project.findByIdAndUpdate(
      d.projectId,
      { status: 'revision_requested' },
      { new: true }
    );

    // Send email notification to admin asynchronously
    if (project) {
      sendAdminRevisionNotification({ deliverable: d, project, revision }).catch(err => {
        console.error('Failed sending admin revision email:', err.message);
      });
    }

    res.status(201).json({ message: 'Revision requested', revision });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /api/projects/:projectId/revisions
// Admin: get revision requests for a project
// ─────────────────────────────────────────────────────────────
router.get('/projects/:projectId/revisions', requireAuth('admin'), async (req, res) => {
  try {
    const revisions = await RevisionRequest.find({ projectId: req.params.projectId })
      .sort({ createdAt: -1 })
      .lean();

    const deliverableIds = revisions.map(r => r.deliverableId).filter(Boolean);
    const deliverables = await Deliverable.find({ _id: { $in: deliverableIds } }).lean();

    const dMap = {};
    deliverables.forEach(d => { dMap[d._id.toString()] = d; });

    const enriched = revisions.map(r => ({
      ...r,
      deliverable: r.deliverableId ? (dMap[r.deliverableId.toString()] || null) : null,
    }));

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

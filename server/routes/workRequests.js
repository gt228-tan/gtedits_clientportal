const express     = require('express');
const router      = express.Router();
const WorkRequest = require('../models/WorkRequest');
const Project     = require('../models/Project');
const { sendAdminNotification } = require('../utils/sendEmail');

/**
 * Helper: Automatically create a Project when a WorkRequest is approved.
 * Ensures no duplicate project is created if approved multiple times.
 */
async function createProjectForApprovedRequest(workRequest) {
  try {
    // 1. Prevent duplicate project creation for the same work request
    const existing = await Project.findOne({ workRequestId: workRequest._id });
    if (existing) {
      return existing;
    }

    // 2. Resolve clientFirebaseUid
    let clientFirebaseUid = workRequest.clientFirebaseUid;

    if (!clientFirebaseUid || clientFirebaseUid === workRequest.clientId) {
      const match = await Project.findOne({
        $or: [
          { firebaseClientId: workRequest.clientId },
          { clientName: workRequest.clientName }
        ],
        clientFirebaseUid: { $exists: true, $ne: '', $ne: workRequest.clientId }
      });
      if (match) {
        clientFirebaseUid = match.clientFirebaseUid;
      } else {
        clientFirebaseUid = workRequest.clientFirebaseUid || workRequest.clientId;
      }
    }

    // 3. Determine project title
    const projectTitle = (workRequest.title && workRequest.title.trim())
      ? workRequest.title.trim()
      : `${workRequest.type}${workRequest.gameName ? ' (' + workRequest.gameName + ')' : ''}`;

    // 4. Create new Project
    const project = await Project.create({
      firebaseClientId:  workRequest.clientId,
      clientFirebaseUid: clientFirebaseUid,
      clientName:        workRequest.clientName,
      title:             projectTitle,
      description:       workRequest.remarks || `Auto-created from approved Work Request (${workRequest.category} - ${workRequest.type})`,
      status:            'approved',
      workRequestId:     workRequest._id,
    });

    console.log(`🎉 Auto-created project "${project.title}" (ID: ${project._id}) for client "${project.clientName}"`);
    return project;
  } catch (err) {
    console.error('❌ Error auto-creating project for work request:', err.message);
  }
}

/**
 * Sync function: ensures all Approved Work Requests have corresponding Projects created.
 */
async function syncApprovedWorkRequests() {
  try {
    const approvedRequests = await WorkRequest.find({ status: 'Approved' });
    for (const req of approvedRequests) {
      await createProjectForApprovedRequest(req);
    }
  } catch (err) {
    console.error('❌ Error syncing approved work requests:', err.message);
  }
}

// ── POST /api/work-requests — Client submits new request ─────
router.post('/', async (req, res) => {
  try {
    const { clientId, clientFirebaseUid, clientName, title, category, type, gameName, materials, budget, deadline, remarks } = req.body;
    const doc = await WorkRequest.create({
      clientId,
      clientFirebaseUid: clientFirebaseUid || '',
      clientName,
      title: title || '',
      category,
      type,
      gameName: gameName || '',
      materials: materials || '',
      budget,
      deadline,
      remarks: remarks || '',
    });

    // Send email notification to admin asynchronously
    sendAdminNotification(doc).catch((err) => {
      console.error('Failed to send admin email notification:', err.message);
    });

    res.status(201).json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── GET /api/work-requests — Admin fetches all (optional ?status=) ──
router.get('/', async (req, res) => {
  try {
    // Sync any approved requests that might not have a project created yet
    await syncApprovedWorkRequests();

    const filter = req.query.status ? { status: req.query.status } : {};
    const docs   = await WorkRequest.find(filter).sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/work-requests/client/:clientId — Client's own requests ─
router.get('/client/:clientId', async (req, res) => {
  try {
    const docs = await WorkRequest.find({ clientId: req.params.clientId })
                                  .sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/work-requests/:id/action — Email Quick Action (Approve / Reject) ──
router.get('/:id/action', async (req, res) => {
  try {
    const { status } = req.query; // 'Approved' or 'Rejected'
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).send('<h2 style="font-family:sans-serif;color:red;">Invalid action status</h2>');
    }

    const doc = await WorkRequest.findById(req.params.id);
    if (!doc) {
      return res.status(404).send('<h2 style="font-family:sans-serif;color:red;">Work Request not found</h2>');
    }

    // If Approval requested:
    if (status === 'Approved') {
      doc.status = 'Approved';
      await doc.save();
      await createProjectForApprovedRequest(doc);

      return res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Work Request Approved</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body { font-family: 'Segoe UI', Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; box-sizing: border-box; }
            .card { background: #1e293b; padding: 40px; border-radius: 16px; text-align: center; max-width: 480px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
            h1 { color: #16a34a; font-size: 26px; margin-bottom: 12px; margin-top: 0; }
            p { color: #94a3b8; font-size: 15px; line-height: 1.5; margin: 8px 0; }
            .details { background: #0f172a; padding: 16px; border-radius: 8px; margin: 20px 0; text-align: left; font-size: 14px; border: 1px solid #1e293b; }
            .details p { color: #cbd5e1; margin: 6px 0; }
            .badge { display: inline-block; padding: 4px 10px; border-radius: 20px; font-weight: bold; background: #16a34a; color: white; font-size: 13px; margin-top: 4px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>✅ Request Approved</h1>
            <p>The work request from <strong>${doc.clientName || 'Client'}</strong> has been approved and project created.</p>
            <div class="details">
              <p><strong>Title:</strong> ${doc.title || doc.type}</p>
              <p><strong>Category:</strong> ${doc.category}</p>
              <p><strong>Type:</strong> ${doc.type}</p>
              <p><strong>Budget:</strong> ₹${doc.budget ? doc.budget.toLocaleString('en-IN') : '0'}</p>
              <p><strong>Current Status:</strong> <span class="badge">${doc.status}</span></p>
            </div>
            <p style="font-size: 13px; color: #64748b;">You can close this window or return to your admin portal.</p>
          </div>
        </body>
        </html>
      `);
    }

    // If Rejection requested via Email: Render Interactive Rejection Form Page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Reject Work Request</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #1e293b; padding: 32px; border-radius: 16px; text-align: left; max-width: 560px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
          h1 { color: #f87171; font-size: 22px; margin-bottom: 6px; margin-top: 0; display: flex; align-items: center; gap: 8px; }
          p.sub { color: #94a3b8; font-size: 14px; margin-bottom: 20px; }
          .req-info { background: #0f172a; padding: 14px; border-radius: 8px; margin-bottom: 20px; border: 1px solid #1e293b; font-size: 13px; color: #cbd5e1; }
          .req-info p { margin: 4px 0; }
          .section-label { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #94a3b8; letter-spacing: 0.05em; margin-bottom: 8px; display: block; }
          .freq-grid { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
          .freq-card { background: #0f172a; border: 1px solid #334155; border-radius: 8px; padding: 10px 12px; cursor: pointer; transition: all 0.2s ease; text-align: left; color: #f8fafc; }
          .freq-card:hover { border-color: #f87171; background: #1e1b2e; }
          .freq-title { font-weight: bold; font-size: 13px; color: #fca5a5; margin-bottom: 4px; }
          .freq-line { font-size: 12px; color: #94a3b8; line-height: 1.3; }
          textarea { width: 100%; background: #0f172a; border: 1.5px solid #475569; border-radius: 8px; padding: 12px; font-size: 14px; color: #fff; outline: none; box-sizing: border-box; resize: vertical; min-height: 90px; }
          textarea:focus { border-color: #f87171; }
          .btn-reject { width: 100%; background: #dc2626; color: white; font-weight: bold; border: none; padding: 12px; border-radius: 8px; font-size: 15px; cursor: pointer; margin-top: 16px; transition: background 0.2s ease; }
          .btn-reject:hover { background: #b91c1c; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>❌ Reject Work Request</h1>
          <p class="sub">Specify rejection reason for client <strong>${doc.clientName || 'Client'}</strong>.</p>
          
          <div class="req-info">
            <p><strong>Title:</strong> ${doc.title || doc.type}</p>
            <p><strong>Category:</strong> ${doc.category} &bull; <strong>Type:</strong> ${doc.type}</p>
            <p><strong>Budget:</strong> ₹${doc.budget ? doc.budget.toLocaleString('en-IN') : '0'}</p>
          </div>

          <form action="/api/work-requests/${doc._id}/reject" method="POST">
            <span class="section-label">⚡ Frequent Replies (Click to populate text area)</span>
            <div class="freq-grid">
              <div class="freq-card" onclick="setReason('The proposed budget or deadline does not match our scope for this project.\\nPlease re-submit with revised timeframe or reach out to adjust project scope.')">
                <div class="freq-title">💬 Budget / Schedule Mismatch</div>
                <div class="freq-line">The proposed budget or deadline does not match our scope for this project.</div>
                <div class="freq-line">Please re-submit with revised timeframe or reach out to adjust project scope.</div>
              </div>

              <div class="freq-card" onclick="setReason('Required media assets, drive links, or project guidelines are missing.\\nKindly re-submit with complete assets and details so we can re-evaluate.')">
                <div class="freq-title">💬 Incomplete Materials / Brief</div>
                <div class="freq-line">Required media assets, drive links, or project guidelines are missing.</div>
                <div class="freq-line">Kindly re-submit with complete assets and details so we can re-evaluate.</div>
              </div>

              <div class="freq-card" onclick="setReason('Our editing team is currently at full capacity for the requested dates.\\nPlease select a later deadline or check back for upcoming open slots.')">
                <div class="freq-title">💬 Schedule Fully Booked</div>
                <div class="freq-line">Our editing team is currently at full capacity for the requested dates.</div>
                <div class="freq-line">Please select a later deadline or check back for upcoming open slots.</div>
              </div>
            </div>

            <span class="section-label" style="margin-top: 14px;">Rejection Reason (Editable / Custom)</span>
            <textarea name="rejectReason" id="rejectReason" placeholder="Type custom reason or select a frequent reply above..." required>${doc.adminNote || ''}</textarea>

            <button type="submit" class="btn-reject">❌ Confirm Rejection</button>
          </form>

          <script>
            function setReason(text) {
              document.getElementById('rejectReason').value = text;
            }
          </script>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`<h2 style="font-family:sans-serif;color:red;">Error processing request: ${err.message}</h2>`);
  }
});

// ── POST /api/work-requests/:id/reject — Handle rejection submission from Email form ──
router.post('/:id/reject', async (req, res) => {
  try {
    const { rejectReason } = req.body;
    const doc = await WorkRequest.findByIdAndUpdate(
      req.params.id,
      { status: 'Rejected', adminNote: rejectReason || 'Rejected by Admin' },
      { new: true, runValidators: true }
    );

    if (!doc) {
      return res.status(404).send('<h2 style="font-family:sans-serif;color:red;">Work Request not found</h2>');
    }

    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Work Request Rejected</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { font-family: 'Segoe UI', Arial, sans-serif; display: flex; justify-content: center; align-items: center; min-height: 100vh; background: #0f172a; color: #f8fafc; margin: 0; padding: 20px; box-sizing: border-box; }
          .card { background: #1e293b; padding: 36px; border-radius: 16px; text-align: center; max-width: 480px; width: 100%; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #334155; }
          h1 { color: #f87171; font-size: 24px; margin-bottom: 12px; margin-top: 0; }
          p { color: #cbd5e1; font-size: 14px; line-height: 1.5; margin: 8px 0; }
          .reason-box { background: #0f172a; border-left: 3px solid #f87171; padding: 12px 16px; border-radius: 6px; text-align: left; font-size: 13px; color: #f8fafc; margin: 18px 0; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>❌ Request Marked as Rejected</h1>
          <p>Work request from <strong>${doc.clientName || 'Client'}</strong> has been updated to <strong>Rejected</strong>.</p>
          <div class="reason-box"><strong>Recorded Reason:</strong><br/>${doc.adminNote}</div>
          <p style="font-size: 13px; color: #64748b;">You can close this tab or return to your admin portal.</p>
        </div>
      </body>
      </html>
    `);
  } catch (err) {
    res.status(500).send(`<h2 style="font-family:sans-serif;color:red;">Error saving rejection: ${err.message}</h2>`);
  }
});


// ── PATCH /api/work-requests/:id/status — Admin updates status ─
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, adminNote } = req.body;
    const doc = await WorkRequest.findByIdAndUpdate(
      req.params.id,
      { status, adminNote: adminNote || '' },
      { new: true, runValidators: true }
    );
    if (!doc) return res.status(404).json({ error: 'Not found' });

    if (status === 'Approved') {
      await createProjectForApprovedRequest(doc);
    }

    res.json(doc);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ── DELETE /api/work-requests/:id — Admin deletes a request ─
router.delete('/:id', async (req, res) => {
  try {
    const doc = await WorkRequest.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

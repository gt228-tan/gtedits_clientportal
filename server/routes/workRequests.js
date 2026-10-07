const express = require('express');
const router = express.Router();
const WorkRequest = require('../models/WorkRequest');
const Project = require('../models/Project');
const ClientEmail = require('../models/ClientEmail');
const { sendAdminNotification, sendClientRequestApprovalNotification, sendClientRequestRejectionNotification } = require('../utils/sendEmail');
const { getClientContactEmail } = require('../utils/getClientEmail');

/**
 * Helper: Automatically create a Project when a WorkRequest is approved.
 * Ensures no duplicate project is created if approved multiple times.
 */
async function createProjectForApprovedRequest(workRequest, options = {}) {
  const { isExplicitApproval = false } = options;
  let project = null;
  let isNewProject = false;

  // ── Step 1: Create project (if not already existing) ───────
  try {
    project = await Project.findOne({ workRequestId: workRequest._id });
    if (!project) {
      // Resolve clientFirebaseUid
      let clientFirebaseUid = workRequest.clientFirebaseUid;

      if (!clientFirebaseUid || clientFirebaseUid === workRequest.clientId) {
        const match = await Project.findOne({
          $or: [
            { firebaseClientId: workRequest.clientId },
            { clientName: workRequest.clientName }
          ],
          clientFirebaseUid: { $exists: true, $nin: ['', workRequest.clientId] }
        });
        if (match) {
          clientFirebaseUid = match.clientFirebaseUid;
        } else {
          clientFirebaseUid = workRequest.clientFirebaseUid || workRequest.clientId;
        }
      }

      // Determine project title
      const projectTitle = (workRequest.title && workRequest.title.trim())
        ? workRequest.title.trim()
        : `${workRequest.type}${workRequest.gameName ? ' (' + workRequest.gameName + ')' : ''}`;

      // Build rich description if AI planned
      let projectDescription = workRequest.remarks || '';
      if (workRequest.aiGenerated && workRequest.specifications) {
        const specs = [];
        if (workRequest.specifications.duration) specs.push(`Duration: ${workRequest.specifications.duration}`);
        if (workRequest.specifications.style) specs.push(`Style: ${workRequest.specifications.style}`);
        if (workRequest.specifications.platform) specs.push(`Platform: ${workRequest.specifications.platform}`);
        if (workRequest.quantity) specs.push(`Quantity: ${workRequest.quantity}`);
        const specsText = specs.length > 0 ? `\n\n[Specs: ${specs.join(' | ')}]` : '';
        projectDescription = (projectDescription ? `${projectDescription}\n` : '') + `Auto-created from AI Work Request: ${projectTitle}${specsText}`;
      } else if (!projectDescription) {
        projectDescription = `Auto-created from approved Work Request (${workRequest.category} - ${workRequest.type})`;
      }

      // Create new Project
      project = await Project.create({
        firebaseClientId: workRequest.clientId,
        clientFirebaseUid: clientFirebaseUid,
        clientName: workRequest.clientName,
        title: projectTitle,
        description: projectDescription,
        status: 'project_created',
        workRequestId: workRequest._id,
      });

      // If AI generated multiple deliverables, seed initial draft deliverable placeholders
      if (workRequest.aiGenerated && Array.isArray(workRequest.deliverablesList) && workRequest.deliverablesList.length > 0) {
        const Deliverable = require('../models/Deliverable');
        for (const item of workRequest.deliverablesList) {
          try {
            await Deliverable.create({
              projectId: project._id,
              clientFirebaseUid: clientFirebaseUid,
              uploadedBy: 'admin',
              type: 'link',
              name: item.name || 'Deliverable',
              description: item.notes || `Deliverable for ${projectTitle}`,
              url: workRequest.materials || 'https://drive.google.com',
              version: 1,
              status: 'draft',
            });
          } catch (delivErr) {
            console.warn(`Could not seed draft deliverable "${item.name}":`, delivErr.message);
          }
        }
      }

      isNewProject = true;
      console.log(`🎉 Auto-created project "${project.title}" (ID: ${project._id}) for client "${project.clientName}"`);
    }
  } catch (err) {
    console.error('❌ Error auto-creating project for work request:', err.message);
  }

  // ── Step 2: Send approval email ONLY IF NOT SENT ALREADY ──
  // Send email if:
  // 1. Approval email has NOT been sent yet (!workRequest.approvalEmailSent) AND
  // 2. Either this is an explicit approval action OR a brand-new project was just created
  const shouldSendEmail = !workRequest.approvalEmailSent && (isExplicitApproval || isNewProject);

  if (shouldSendEmail) {
    try {
      const clientEmail = await getClientContactEmail(
        workRequest.clientId,
        workRequest.clientFirebaseUid || project?.clientFirebaseUid,
        workRequest.clientName
      );
      console.log(`[ApprovalEmail] Resolved email for "${workRequest.clientName}" (clientId: ${workRequest.clientId}): "${clientEmail || '(none)'}"`);

      if (clientEmail) {
        await sendClientRequestApprovalNotification({
          clientEmail,
          clientName: workRequest.clientName,
          workRequest,
        });
        console.log(`✅ Approval notification sent to ${clientEmail}`);
      } else {
        console.warn(`⚠️ No notification email found for client "${workRequest.clientName}" (clientId: ${workRequest.clientId}, uid: ${workRequest.clientFirebaseUid}). Email NOT sent.`);
      }
    } catch (emailErr) {
      console.error(`❌ Failed to send approval email for "${workRequest.clientName}":`, emailErr.message);
    } finally {
      await WorkRequest.findByIdAndUpdate(workRequest._id, { approvalEmailSent: true }).catch(() => {});
    }
  } else if (!workRequest.approvalEmailSent && project) {
    // If project already existed previously and email wasn't sent (or legacy), mark approvalEmailSent as true without re-sending email
    await WorkRequest.findByIdAndUpdate(workRequest._id, { approvalEmailSent: true }).catch(() => {});
  }

  return project;
}

/**
 * Sync function: ensures all Approved Work Requests have corresponding Projects created.
 */
async function syncApprovedWorkRequests() {
  try {
    const approvedRequests = await WorkRequest.find({ status: 'Approved' });
    for (const req of approvedRequests) {
      await createProjectForApprovedRequest(req, { isExplicitApproval: false });
    }
  } catch (err) {
    console.error('❌ Error syncing approved work requests:', err.message);
  }
}

/**
 * Helper: Notify client via email when a WorkRequest is rejected.
 */
async function notifyClientOfRejection(workRequest, reason) {
  try {
    if (workRequest.rejectionEmailSent) return;

    const clientEmail = await getClientContactEmail(
      workRequest.clientId,
      workRequest.clientFirebaseUid,
      workRequest.clientName
    );

    console.log(`[RejectionEmail] Resolved email for "${workRequest.clientName}" (clientId: ${workRequest.clientId}): "${clientEmail || '(none)'}"`);

    if (clientEmail) {
      await sendClientRequestRejectionNotification({
        clientEmail,
        clientName: workRequest.clientName,
        workRequest,
        reason: reason || workRequest.adminNote,
      });
      await WorkRequest.findByIdAndUpdate(workRequest._id, { rejectionEmailSent: true }).catch(() => {});
      console.log(`✅ Rejection notification sent to ${clientEmail}`);
    } else {
      console.warn(`⚠️ No notification email found for client "${workRequest.clientName}". Rejection email NOT sent.`);
    }
  } catch (err) {
    console.error(`❌ Failed to send rejection email for "${workRequest.clientName}":`, err.message);
  }
}

// ── POST /api/work-requests/client-email — Save notification email to MongoDB ─
router.post('/client-email', async (req, res) => {
  try {
    const { clientId, clientName, contactEmail } = req.body;
    if (!contactEmail || !contactEmail.trim()) {
      return res.status(400).json({ error: 'contactEmail is required' });
    }
    const emailToSave = contactEmail.trim();
    const record = await ClientEmail.findOneAndUpdate(
      { $or: [{ clientId }, { clientName }] },
      { clientId, clientName, contactEmail: emailToSave },
      { upsert: true, new: true }
    );
    console.log(`✅ Saved notification email "${emailToSave}" for client "${clientName || clientId}" in MongoDB`);
    res.json(record);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/work-requests/client-email — Fetch client's notification email ─
router.get('/client-email', async (req, res) => {
  try {
    const { clientId, clientName } = req.query;
    const email = await getClientContactEmail({ clientId, clientName });
    res.json({ contactEmail: email || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/work-requests — Client submits new request ─────
router.post('/', async (req, res) => {
  try {
    const {
      clientId, clientFirebaseUid, clientName, title, category, type, gameName,
      materials, image, budget, deadline, remarks, notificationEmail, contactEmail,
      aiGenerated, aiConfidence, aiOriginalPrompt, quantity, specifications,
      requiredAssets, suggestedWorkflow, deliverablesList
    } = req.body;
    
    // Auto-save notification email to client record in RTDB & MongoDB if provided
    const providedEmail = (notificationEmail || contactEmail || '').trim();
    if (providedEmail && !providedEmail.includes('gtportal.com')) {
      ClientEmail.findOneAndUpdate(
        { $or: [{ clientId }, { clientName }] },
        { clientId, clientName, contactEmail: providedEmail },
        { upsert: true }
      ).catch(e => console.warn('Failed auto-saving ClientEmail:', e.message));

      if (clientId) {
        const DATABASE_URL = process.env.FIREBASE_DB_URL || "https://client-tracker-b9331-default-rtdb.asia-southeast1.firebasedatabase.app/";
        fetch(`${DATABASE_URL.replace(/\/+$/, '')}/clients/${encodeURIComponent(clientId)}.json`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contactEmail: providedEmail, notificationEmail: providedEmail })
        }).catch(e => console.warn('Failed to auto-update client notification email:', e.message));
      }
    }

    const doc = await WorkRequest.create({
      clientId,
      clientFirebaseUid: clientFirebaseUid || '',
      clientName,
      title: title || '',
      category: category || 'Other',
      type: type || 'Reels',
      gameName: gameName || '',
      materials: materials || '',
      image: image || '',
      budget: budget !== undefined && budget !== null && budget !== '' ? Number(budget) : 0,
      deadline: deadline || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      remarks: remarks || '',
      aiGenerated: Boolean(aiGenerated),
      aiConfidence: aiConfidence ? Number(aiConfidence) : null,
      aiOriginalPrompt: aiOriginalPrompt || '',
      quantity: quantity ? Number(quantity) : 1,
      specifications: specifications || {},
      requiredAssets: Array.isArray(requiredAssets) ? requiredAssets : [],
      suggestedWorkflow: Array.isArray(suggestedWorkflow) ? suggestedWorkflow : [],
      deliverablesList: Array.isArray(deliverablesList) ? deliverablesList : [],
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

// ── PUT /api/work-requests/:id — Admin updates scope / fields ─
router.put('/:id', async (req, res) => {
  try {
    const allowed = [
      'title', 'category', 'type', 'gameName', 'materials', 'budget',
      'deadline', 'remarks', 'quantity', 'specifications', 'requiredAssets',
      'suggestedWorkflow', 'deliverablesList', 'adminNote'
    ];
    const updateData = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) {
        updateData[key] = req.body[key];
      }
    }
    const doc = await WorkRequest.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
    if (!doc) return res.status(404).json({ error: 'Work Request not found' });
    res.json(doc);
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
    const docs = await WorkRequest.find(filter).sort({ createdAt: -1 });
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
      const isAlreadyApproved = doc.status === 'Approved';
      doc.status = 'Approved';
      await doc.save();
      await createProjectForApprovedRequest(doc, { isExplicitApproval: !isAlreadyApproved });

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

    // Send rejection email to client
    await notifyClientOfRejection(doc, rejectReason);

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
      await createProjectForApprovedRequest(doc, { isExplicitApproval: true });
    } else if (status === 'Rejected') {
      await notifyClientOfRejection(doc, adminNote);
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

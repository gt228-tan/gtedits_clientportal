const express  = require('express');
const router   = express.Router();
const Project  = require('../models/Project');
const Deliverable = require('../models/Deliverable');
const { requireAuth } = require('../middleware/auth');

// ─────────────────────────────────────────────────────────────
// GET /api/projects/client/mine
// Client: list their own projects
// MUST be declared before /:projectId to avoid route collision
// ─────────────────────────────────────────────────────────────
router.get('/client/mine', requireAuth('client'), async (req, res) => {
  try {
    const projects = await Project.find({ clientFirebaseUid: req.uid }).sort({ createdAt: -1 });
    res.json(projects);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /api/projects
// Admin: create a new project for a client
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// GET /api/projects
// Admin: list all projects (optionally filter by ?clientUid=)
// ─────────────────────────────────────────────────────────────
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
      'deliverable_uploaded', 'awaiting_client_approval', 'approved_by_client',
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

module.exports = router;

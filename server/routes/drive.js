const express = require('express');
const router = express.Router();
const { isDriveConfigured, createClientFolder } = require('../services/googleDriveService');

// ── GET /api/drive/status — Check if Google Drive API is configured ──
router.get('/status', (req, res) => {
  const configured = isDriveConfigured();
  return res.json({
    configured,
    message: configured
      ? 'Google Drive API is configured and ready.'
      : 'Google Drive API credentials not found in server/.env.'
  });
});

// ── POST /api/drive/create-client-folder — Create folder for a client ──
router.post('/create-client-folder', async (req, res) => {
  try {
    const { clientName, clientEmail, clientId, folderPrefix } = req.body;

    if (!clientName || typeof clientName !== 'string' || !clientName.trim()) {
      return res.status(400).json({
        success: false,
        error: 'clientName is required.'
      });
    }

    const result = await createClientFolder({
      clientName: clientName.trim(),
      clientEmail: clientEmail ? clientEmail.trim() : '',
      folderPrefix: folderPrefix || '',
    });

    if (!result.success) {
      return res.status(result.configured ? 500 : 200).json(result);
    }

    return res.json({
      success: true,
      ...result,
      clientId,
    });
  } catch (err) {
    console.error('❌ Error in /api/drive/create-client-folder:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

// ── POST /api/drive/batch-create-client-folders — Create folders for multiple existing clients ──
router.post('/batch-create-client-folders', async (req, res) => {
  try {
    const { clients } = req.body;

    if (!Array.isArray(clients) || clients.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'clients array is required and must not be empty.'
      });
    }

    const created = [];
    const failed = [];

    for (const item of clients) {
      if (!item.clientName || !item.clientName.trim()) continue;

      try {
        const result = await createClientFolder({
          clientName: item.clientName.trim(),
          clientEmail: item.clientEmail ? item.clientEmail.trim() : '',
        });

        if (result.success && result.folderUrl) {
          created.push({
            clientId: item.clientId,
            clientName: item.clientName,
            folderId: result.folderId,
            folderUrl: result.folderUrl,
          });
        } else {
          failed.push({
            clientId: item.clientId,
            clientName: item.clientName,
            error: result.message || 'Failed to create folder',
          });
        }
      } catch (err) {
        failed.push({
          clientId: item.clientId,
          clientName: item.clientName,
          error: err.message,
        });
      }
    }

    return res.json({
      success: true,
      totalRequested: clients.length,
      createdCount: created.length,
      failedCount: failed.length,
      created,
      failed,
    });
  } catch (err) {
    console.error('❌ Error in /api/drive/batch-create-client-folders:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;


const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

/**
 * Checks whether Google Drive API credentials are configured in environment variables or service account file.
 */
function isDriveConfigured() {
  if (process.env.GOOGLE_CLIENT_EMAIL && (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_PRIVATE_KEY)) {
    return true;
  }
  if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    const filePath = path.isAbsolute(process.env.GOOGLE_SERVICE_ACCOUNT_FILE)
      ? process.env.GOOGLE_SERVICE_ACCOUNT_FILE
      : path.join(__dirname, '..', process.env.GOOGLE_SERVICE_ACCOUNT_FILE);
    return fs.existsSync(filePath);
  }
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    return true;
  }
  return false;
}

/**
 * Creates authenticated Google Drive client
 */
function getDriveClient() {
  // Option 1: Service Account via Environment Variables
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL || process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.GOOGLE_PRIVATE_KEY;

  if (clientEmail && privateKeyRaw) {
    const privateKey = privateKeyRaw.replace(/\\n/g, '\n');
    const auth = new google.auth.JWT({
      email: clientEmail,
      key: privateKey,
      scopes: [
        'https://www.googleapis.com/auth/drive',
        'https://www.googleapis.com/auth/drive.file'
      ]
    });
    return google.drive({ version: 'v3', auth });
  }

  // Option 2: Service Account JSON file path
  if (process.env.GOOGLE_SERVICE_ACCOUNT_FILE) {
    const filePath = path.isAbsolute(process.env.GOOGLE_SERVICE_ACCOUNT_FILE)
      ? process.env.GOOGLE_SERVICE_ACCOUNT_FILE
      : path.join(__dirname, '..', process.env.GOOGLE_SERVICE_ACCOUNT_FILE);

    if (fs.existsSync(filePath)) {
      const auth = new google.auth.GoogleAuth({
        keyFile: filePath,
        scopes: [
          'https://www.googleapis.com/auth/drive',
          'https://www.googleapis.com/auth/drive.file'
        ]
      });
      return google.drive({ version: 'v3', auth });
    }
  }

  // Option 3: OAuth2 Refresh Token
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN) {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI || 'https://developers.google.com/oauthplayground'
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });
    return google.drive({ version: 'v3', auth: oauth2Client });
  }

  return null;
}

/**
 * Creates a dedicated Google Drive folder for a client and configures permissions
 * @param {Object} options
 * @param {string} options.clientName - Name of the client
 * @param {string} [options.clientEmail] - Notification email of client
 * @param {string} [options.folderPrefix] - Optional folder name prefix or customization
 */
async function createClientFolder({ clientName, clientEmail, folderPrefix = '' }) {
  if (!isDriveConfigured()) {
    return {
      success: false,
      configured: false,
      message: 'Google Drive API is not configured yet. Please configure credentials in server/.env.'
    };
  }

  const drive = getDriveClient();
  if (!drive) {
    return {
      success: false,
      configured: false,
      message: 'Could not initialize Google Drive client. Please check your credentials.'
    };
  }

  try {
    const folderName = folderPrefix
      ? `${folderPrefix} - ${clientName}`
      : `${clientName} — Project Assets & Deliverables`;

    const fileMetadata = {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
      description: `EditDesk dedicated project assets & raw footage folder for ${clientName}`,
    };

    // If a parent folder ID is specified in .env, place the client folder inside it
    if (process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID) {
      fileMetadata.parents = [process.env.GOOGLE_DRIVE_PARENT_FOLDER_ID.trim()];
    }

    const folderRes = await drive.files.create({
      resource: fileMetadata,
      fields: 'id, name, webViewLink',
      supportsAllDrives: true,
    });

    const folderId = folderRes.data.id;
    const folderUrl = folderRes.data.webViewLink || `https://drive.google.com/drive/folders/${folderId}`;

    // Share permission: anyone with link can view and edit/upload files
    try {
      await drive.permissions.create({
        fileId: folderId,
        supportsAllDrives: true,
        requestBody: {
          role: 'writer', // or 'reader'
          type: 'anyone',
          allowFileDiscovery: false,
        },
      });
    } catch (permErr) {
      console.warn('⚠️ Could not set anyone-with-link permission on Drive folder:', permErr.message);
    }

    // Direct permission: If client has a valid external notification email, grant direct access
    if (clientEmail && clientEmail.includes('@') && !clientEmail.includes('gtportal.com')) {
      try {
        await drive.permissions.create({
          fileId: folderId,
          supportsAllDrives: true,
          requestBody: {
            role: 'writer',
            type: 'user',
            emailAddress: clientEmail.trim(),
          },
          sendNotificationEmail: true,
        });
      } catch (clientPermErr) {
        console.warn(`⚠️ Could not invite ${clientEmail} to Drive folder:`, clientPermErr.message);
      }
    }

    console.log(`✅ Google Drive folder created for "${clientName}": ${folderUrl}`);

    return {
      success: true,
      configured: true,
      folderId,
      folderUrl,
      folderName,
    };
  } catch (err) {
    console.error('❌ Error creating Google Drive folder:', err.message);
    return {
      success: false,
      configured: true,
      error: err.message,
      message: `Failed to create Google Drive folder: ${err.message}`
    };
  }
}

module.exports = {
  isDriveConfigured,
  createClientFolder,
};

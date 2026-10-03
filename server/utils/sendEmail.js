const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const nodemailer = require('nodemailer');

const emailPass = (process.env.EMAIL_PASS || '').replace(/\s+/g, '');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: Number(process.env.EMAIL_PORT) === 465, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: emailPass,
  },
  tls: {
    rejectUnauthorized: false,
  },
});

const sendAdminNotification = async (workRequest) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER || 'gtbtbhay22@gmail.com';
    if (!adminEmail) {
      console.warn('⚠️ [sendEmail] ADMIN_EMAIL and EMAIL_USER missing. Admin notification NOT sent.');
      return;
    }

    const serverUrl = process.env.SERVER_URL || 'http://localhost:3001';

    const formattedDeadline = workRequest.deadline
      ? new Date(workRequest.deadline).toLocaleDateString('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
      : 'N/A';

    const gameRow = workRequest.category === 'Gaming' && workRequest.gameName
      ? `<p><strong>Game Name:</strong> ${workRequest.gameName}</p>`
      : '';

    const materialsRow = workRequest.materials
      ? `<p><strong>Materials:</strong> <a href="${workRequest.materials}" target="_blank" style="color: #4f46e5;">${workRequest.materials}</a></p>`
      : `<p><strong>Materials:</strong> None provided</p>`;

    const remarksRow = workRequest.remarks
      ? `<p><strong>Remarks:</strong> ${workRequest.remarks}</p>`
      : `<p><strong>Remarks:</strong> None</p>`;

    const imageRow = workRequest.image
      ? (workRequest.image.startsWith('http') || workRequest.image.startsWith('data:image'))
        ? `<div style="margin: 12px 0;"><p><strong>Attached Reference Image:</strong></p><img src="${workRequest.image}" style="max-width: 100%; max-height: 300px; border-radius: 8px; border: 1px solid #e2e8f0; margin-top: 4px;" alt="Reference Image" /></div>`
        : `<p><strong>Attachment Image:</strong> Included</p>`
      : '';

    const approveUrl = `${serverUrl}/api/work-requests/${workRequest._id}/action?status=Approved`;
    const rejectUrl = `${serverUrl}/api/work-requests/${workRequest._id}/action?status=Rejected`;

    const titleRow = workRequest.title
      ? `<div style="background-color: #e0f2fe; border: 1px solid #bae6fd; padding: 12px 16px; border-radius: 6px; margin: 12px 0;">
          <strong style="color: #0369a1; font-size: 14px;">📌 Request Title:</strong>
          <span style="color: #0f1714; font-size: 16px; font-weight: bold; display: block; margin-top: 4px;">${workRequest.title}</span>
         </div>`
      : '';

    const mailOptions = {
      from: `"GT Client Portal" <${process.env.EMAIL_USER}>`,
      to: adminEmail,
      subject: `🚨 New Work Request from ${workRequest.clientName || 'Client'}: ${workRequest.title ? `"${workRequest.title}"` : `${workRequest.category} - ${workRequest.type}`}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; color: #333; background-color: #ffffff;">
          <h2 style="color: #4f46e5; border-bottom: 2px solid #4f46e5; padding-bottom: 8px; margin-top: 0;">📝 New Work Request Received</h2>
          
          <p><strong>Client Name:</strong> ${workRequest.clientName || 'N/A'}</p>
          <p><strong>Client ID:</strong> ${workRequest.clientId || 'N/A'}</p>
          ${titleRow}
          <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;" />

          <p><strong>Category:</strong> ${workRequest.category || 'N/A'}</p>
          <p><strong>Type:</strong> ${workRequest.type || 'N/A'}</p>
          ${gameRow}
          <p><strong>Budget:</strong> ₹${workRequest.budget ? workRequest.budget.toLocaleString('en-IN') : '0'}</p>
          <p><strong>Deadline:</strong> ${formattedDeadline}</p>
          ${materialsRow}
          ${remarksRow}
          ${imageRow}

          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${approveUrl}" 
               style="background-color: #16a34a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block; margin-right: 12px;">
               ✅ Approve Request
            </a>
            <a href="${rejectUrl}" 
               style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">
               ❌ Reject Request
            </a>
          </div>

          <p style="font-size: 12px; color: #888; text-align: center; margin-bottom: 0;">
            Clicking a button above will immediately update the request status in your portal.
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✉️ Admin notification email sent successfully to ${adminEmail} for work request "${workRequest._id || workRequest.title}"`);
  } catch (err) {
    console.error('❌ Failed to send admin email notification:', err.message);
  }
};

/**
 * Send email notification to Admin when client APPROVES a deliverable
 */
const sendAdminApprovalNotification = async ({ deliverable, project }) => {
  try {
    const mailOptions = {
      from: `"GT Client Portal" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `✅ Deliverable Approved by ${project.clientName || 'Client'}: "${project.title}" (v${deliverable.version})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; color: #333; background-color: #ffffff;">
          <h2 style="color: #16a34a; border-bottom: 2px solid #16a34a; padding-bottom: 8px; margin-top: 0;">🎉 Deliverable Approved!</h2>
          <p>Client <strong>${project.clientName}</strong> has approved deliverable <strong>"${deliverable.name}"</strong> (Version ${deliverable.version}).</p>
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px; border-radius: 6px; margin: 16px 0; font-size: 14px;">
            <p style="margin: 4px 0;"><strong>Project:</strong> ${project.title}</p>
            <p style="margin: 4px 0;"><strong>Deliverable:</strong> ${deliverable.name} (v${deliverable.version})</p>
            <p style="margin: 4px 0;"><strong>Approved Date:</strong> ${new Date().toLocaleString('en-IN')}</p>
          </div>
          <p style="font-size: 12px; color: #888;">Project status updated to Approved by Client in your portal.</p>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Failed to send admin approval email:', err.message);
  }
};

/**
 * Send email notification to Admin when client REQUESTS A REVISION
 */
const sendAdminRevisionNotification = async ({ deliverable, project, revision }) => {
  try {
    const mailOptions = {
      from: `"GT Client Portal" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `🔴 Revision Requested by ${project.clientName || 'Client'}: "${project.title}" (v${deliverable.version})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; color: #333; background-color: #ffffff;">
          <h2 style="color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 8px; margin-top: 0;">🔄 Revision Requested by Client</h2>
          <p>Client <strong>${project.clientName}</strong> has requested revisions for deliverable <strong>"${deliverable.name}"</strong> (Version ${deliverable.version}).</p>
          
          <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 14px; border-radius: 4px; margin: 16px 0; font-size: 14px;">
            <strong style="color: #991b1b; display: block; margin-bottom: 6px;">💬 Client Revision Feedback:</strong>
            <span style="color: #1e293b; white-space: pre-wrap;">${revision.description}</span>
          </div>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; color: #64748b;">
            <p style="margin: 3px 0;"><strong>Project:</strong> ${project.title}</p>
            <p style="margin: 3px 0;"><strong>Deliverable:</strong> ${deliverable.name} (v${deliverable.version})</p>
            <p style="margin: 3px 0;"><strong>Requested At:</strong> ${new Date().toLocaleString('en-IN')}</p>
          </div>
          <p style="font-size: 12px; color: #888; margin-top: 16px;">Project status has been updated to Revision Requested in your portal.</p>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Failed to send admin revision email:', err.message);
  }
};

/**
 * Send email notification to Admin when a work request / deliverable is REJECTED
 */
const sendAdminRejectionNotification = async ({ workRequest, reason }) => {
  try {
    const mailOptions = {
      from: `"GT Client Portal" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `❌ Work Request Rejected: ${workRequest.title || workRequest.clientName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; color: #333; background-color: #ffffff;">
          <h2 style="color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 8px; margin-top: 0;">❌ Work Request Rejected</h2>
          <p>Work request from <strong>${workRequest.clientName || 'Client'}</strong> has been marked as <strong>Rejected</strong>.</p>
          <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 14px; border-radius: 4px; margin: 16px 0; font-size: 14px;">
            <strong style="color: #991b1b; display: block; margin-bottom: 6px;">Reason Recorded:</strong>
            <span style="color: #1e293b; white-space: pre-wrap;">${reason || workRequest.adminNote || 'None'}</span>
          </div>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Failed to send admin rejection email:', err.message);
  }
};

/**
 * Send email notification to CLIENT when work request is APPROVED
 */
const sendClientRequestApprovalNotification = async ({ clientEmail, clientName, workRequest }) => {
  if (!clientEmail || clientEmail.includes('gtportal.com')) {
    console.warn(`[sendEmail] Skipping approval email for "${clientName}": email is empty or generated login email (${clientEmail})`);
    return;
  }
  try {
    const clientPortalUrl = process.env.CLIENT_URL || 'https://gtedits-clientportal.vercel.app';
    const mailOptions = {
      from: `"GT Client Portal" <${process.env.EMAIL_USER}>`,
      to: clientEmail,
      subject: `🎉 Your Work Request has been Approved: "${workRequest.title || workRequest.type}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; color: #333; background-color: #ffffff;">
          <h2 style="color: #16a34a; border-bottom: 2px solid #16a34a; padding-bottom: 8px; margin-top: 0;">✅ Work Request Approved</h2>
          <p>Hi <strong>${clientName || 'Client'}</strong>,</p>
          <p>Great news! Your work request has been approved and project editing is under way.</p>
          
          <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px; border-radius: 6px; margin: 16px 0; font-size: 14px;">
            <p style="margin: 4px 0;"><strong>Request Title:</strong> ${workRequest.title || workRequest.type}</p>
            <p style="margin: 4px 0;"><strong>Category:</strong> ${workRequest.category || 'N/A'}</p>
            <p style="margin: 4px 0;"><strong>Budget:</strong> ₹${workRequest.budget ? workRequest.budget.toLocaleString('en-IN') : '0'}</p>
          </div>

          <div style="text-align: center; margin: 25px 0;">
            <a href="${clientPortalUrl}" style="background-color: #0f1714; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">
              🚀 Open Client Portal
            </a>
          </div>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
    console.log(`✉️ Approved notification email sent successfully to ${clientEmail}`);
  } catch (err) {
    console.error('Failed to send client request approval email:', err.message);
  }
};

/**
 * Send email notification to CLIENT when a DELIVERABLE is uploaded
 */
const sendClientDeliverableNotification = async ({ clientEmail, clientName, project, deliverable }) => {
  if (!process.env.EMAIL_USER || !emailPass) {
    console.error('❌ [sendEmail] EMAIL_USER or EMAIL_PASS not configured in server environment (.env)');
    return { success: false, reason: 'Email server credentials not configured.' };
  }

  if (!clientEmail || clientEmail.includes('gtportal.com') || !clientEmail.includes('@')) {
    console.warn(`[sendEmail] Skipping deliverable email for "${clientName}": email is empty, invalid, or generated login email (${clientEmail})`);
    return { success: false, reason: `Invalid or missing client email address (${clientEmail || 'empty'}).` };
  }

  try {
    const clientPortalUrl = process.env.CLIENT_URL || 'https://gtedits-clientportal.vercel.app';
    const notesHtml = deliverable.description
      ? `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; margin: 12px 0; font-size: 13px; color: #475569;">
          <strong>📝 Notes from Editor:</strong>
          <p style="margin: 4px 0 0 0; white-space: pre-wrap;">${deliverable.description}</p>
         </div>`
      : '';

    const directLinkHtml = deliverable.url
      ? `<a href="${deliverable.url}" target="_blank" style="background-color: #0284c7; color: #ffffff; padding: 12px 22px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px; display: inline-block; margin-left: 8px;">
          🔗 Open Deliverable Link
         </a>`
      : '';

    const mailOptions = {
      from: `"GT Client Portal" <${process.env.EMAIL_USER}>`,
      to: clientEmail.trim(),
      subject: `📦 New Deliverable Ready: "${deliverable.name}" (v${deliverable.version}) - ${project.title || 'GT Edits'}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; color: #333; background-color: #ffffff;">
          <h2 style="color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 8px; margin-top: 0;">🎬 Deliverable Ready for Review</h2>
          <p>Hi <strong>${clientName || 'Client'}</strong>,</p>
          <p>A new deliverable version has been uploaded for your project <strong>"${project.title}"</strong>.</p>
          
          <div style="background-color: #e0f2fe; border: 1px solid #bae6fd; padding: 14px; border-radius: 6px; margin: 16px 0; font-size: 14px;">
            <p style="margin: 4px 0;"><strong>Deliverable:</strong> ${deliverable.name} (v${deliverable.version})</p>
            <p style="margin: 4px 0;"><strong>Project:</strong> ${project.title}</p>
            ${deliverable.type === 'file' && deliverable.fileSize ? `<p style="margin: 4px 0;"><strong>File Size:</strong> ${(deliverable.fileSize / 1024 / 1024).toFixed(1)} MB</p>` : ''}
          </div>

          ${notesHtml}

          <p style="font-size: 14px; color: #475569; margin: 20px 0 10px 0;">
            Please log in to preview the deliverable and approve or request revisions:
          </p>

          <div style="text-align: center; margin: 25px 0;">
            <a href="${clientPortalUrl}" style="background-color: #16a34a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">
              👀 Open Client Portal
            </a>
            ${directLinkHtml}
          </div>

          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
          <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 0;">
            GT Edits Client Portal · Deliverable Update Notification
          </p>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Deliverable notification email sent successfully to ${clientEmail} (messageId: ${info.messageId})`);
    return { success: true, email: clientEmail, messageId: info.messageId };
  } catch (err) {
    console.error('Failed to send client deliverable email:', err.message);
    return { success: false, reason: err.message };
  }
};

/**
 * Send email notification to CLIENT when work request is REJECTED
 */
const sendClientRequestRejectionNotification = async ({ clientEmail, clientName, workRequest, reason }) => {
  if (!clientEmail || clientEmail.includes('gtportal.com')) {
    console.warn(`[sendEmail] Skipping rejection email for "${clientName}": email is empty or generated login email (${clientEmail})`);
    return;
  }
  try {
    const clientPortalUrl = process.env.CLIENT_URL || 'https://gtedits-clientportal.vercel.app';
    const rejectionReason = reason || workRequest?.adminNote || 'No specific reason provided.';
    const mailOptions = {
      from: `"GT Client Portal" <${process.env.EMAIL_USER}>`,
      to: clientEmail,
      subject: `❌ Update regarding your Work Request: "${workRequest.title || workRequest.type}"`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; color: #333; background-color: #ffffff;">
          <h2 style="color: #dc2626; border-bottom: 2px solid #dc2626; padding-bottom: 8px; margin-top: 0;">❌ Work Request Update</h2>
          <p>Hi <strong>${clientName || 'Client'}</strong>,</p>
          <p>Thank you for submitting your work request. Unfortunately, we are unable to process this request at this time.</p>
          
          <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 14px; border-radius: 6px; margin: 16px 0; font-size: 14px;">
            <p style="margin: 0 0 6px 0; color: #991b1b;"><strong>Reason / Feedback from Admin:</strong></p>
            <span style="color: #1e293b; white-space: pre-wrap;">${rejectionReason}</span>
          </div>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 6px; margin: 16px 0; font-size: 14px;">
            <p style="margin: 4px 0;"><strong>Request Title:</strong> ${workRequest.title || workRequest.type}</p>
            <p style="margin: 4px 0;"><strong>Category:</strong> ${workRequest.category || 'N/A'}</p>
            <p style="margin: 4px 0;"><strong>Budget:</strong> ₹${workRequest.budget ? workRequest.budget.toLocaleString('en-IN') : '0'}</p>
          </div>

          <p style="font-size: 14px; color: #475569;">You are welcome to submit a revised work request with updated details or scope.</p>

          <div style="text-align: center; margin: 25px 0;">
            <a href="${clientPortalUrl}" style="background-color: #0f1714; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">
              🚀 Open Client Portal
            </a>
          </div>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
    console.log(`✉️ Rejection notification email sent successfully to ${clientEmail}`);
  } catch (err) {
    console.error('Failed to send client request rejection email:', err.message);
  }
};


const sendClientPaymentReminderNotification = async ({
  clientEmail,
  clientName,
  project,
  grandTotal = 0,
  pdfBuffer,
}) => {
  if (!process.env.EMAIL_USER || !emailPass) {
    console.error('❌ [sendEmail] EMAIL_USER or EMAIL_PASS not configured in server environment (.env)');
    return { success: false, reason: 'Email server credentials (EMAIL_USER / EMAIL_PASS) are not configured in server .env.' };
  }

  if (!clientEmail || clientEmail.includes('gtportal.com') || !clientEmail.includes('@')) {
    console.warn(`[sendEmail] Skipping payment reminder email for "${clientName}": email is empty, invalid, or generated login email (${clientEmail})`);
    return { success: false, reason: `Invalid or missing client email address (${clientEmail || 'empty'}).` };
  }

  try {
    const clientPortalUrl = process.env.CLIENT_URL || 'https://gtedits-clientportal.vercel.app';
    const formattedTotal = `Rs. ${Number(grandTotal).toLocaleString('en-IN')}`;
    const safeClientName = clientName || 'Valued Client';
    const filename = `Invoice_${safeClientName.replace(/\s+/g, '_')}.pdf`;

    const mailOptions = {
      from: `"GT Client Portal" <${process.env.EMAIL_USER}>`,
      to: clientEmail.trim(),
      subject: `💳 Payment Reminder: Outstanding Balance of GT Edits`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 620px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; padding: 28px; color: #1e293b; background-color: #ffffff;">
          <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #f59e0b;">
            <h2 style="color: #d97706; margin: 0; font-size: 22px;">💳 Payment Reminder</h2>
            <p style="color: #64748b; margin-top: 4px; font-size: 14px;">GT Edits Client Portal</p>
          </div>

          <div style="margin-top: 24px;">
            <p style="font-size: 15px; line-height: 1.6;">Dear <strong>${safeClientName}</strong>,</p>
            <p style="font-size: 15px; line-height: 1.6; color: #334155;">
              We hope you are doing well! This is a friendly reminder regarding your remaining balance payment.
            </p>

            <div style="background-color: #fffbebf5; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e; font-size: 13px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">Summary of Outstanding Amount</p>
              <p style="margin: 6px 0 0 0; color: #78350f; font-size: 24px; font-weight: bold;">${formattedTotal}</p>
            </div>

            <p style="font-size: 14px; line-height: 1.6; color: #475569;">
              We have attached your itemized <strong>Remaining Payment Invoice PDF</strong> to this email for your reference.
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${clientPortalUrl}" style="background-color: #f59e0b; color: #ffffff; padding: 13px 28px; text-decoration: none; border-radius: 7px; font-weight: bold; font-size: 15px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(245, 158, 11, 0.3);">
                🚀 View Details in Client Portal
              </a>
            </div>

            <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 25px 0;" />

            <p style="font-size: 13px; color: #64748b; line-height: 1.5; margin: 0;">
              If you have already processed this payment, please disregard this notice or feel free to reach out to us with any questions.
            </p>
            <p style="font-size: 14px; font-weight: bold; color: #1e293b; margin-top: 16px;">
              Best regards,<br/>
              <span style="color: #4f46e5;">GT Edits</span>
            </p>
          </div>
        </div>
      `,
      attachments: (pdfBuffer && Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 0) ? [
        {
          filename,
          content: pdfBuffer,
          contentType: 'application/pdf',
        }
      ] : [],
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Payment reminder email sent successfully to ${clientEmail} (messageId: ${info.messageId})`);
    return { success: true, email: clientEmail, messageId: info.messageId };
  } catch (err) {
    console.error('Failed to send payment reminder email:', err.message);
    throw new Error(`SMTP Mail delivery failed: ${err.message}`);
  }
};

module.exports = {
  sendAdminNotification,
  sendAdminApprovalNotification,
  sendAdminRevisionNotification,
  sendAdminRejectionNotification,
  sendClientRequestApprovalNotification,
  sendClientRequestRejectionNotification,
  sendClientDeliverableNotification,
  sendClientPaymentReminderNotification,
};




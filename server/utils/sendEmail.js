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

// Helper to construct a standard HTML email template with valid doctype and anti-spam footer
const wrapHtml = (contentHtml, footerNote = '') => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>GT Edits Notification</title>
</head>
<body style="margin: 0; padding: 20px 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; -webkit-font-smoothing: antialiased;">
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc;">
    <tr>
      <td align="center" style="padding: 12px;">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 600px; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <!-- Header Banner -->
          <tr>
            <td style="padding: 24px 32px 16px 32px; border-bottom: 1px solid #f1f5f9; background-color: #ffffff;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #0f172a; letter-spacing: -0.3px;">GT Edits</h1>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #64748b;">Client Portal Notification</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 28px 32px; line-height: 1.6; font-size: 15px; color: #334155;">
              ${contentHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5; text-align: center;">
              <p style="margin: 0 0 4px 0;">This is an automated notification regarding your project with <strong>GT Edits</strong>.</p>
              ${footerNote ? `<p style="margin: 0 0 4px 0;">${footerNote}</p>` : ''}
              <p style="margin: 0; color: #94a3b8;">If you have any questions, you can reply directly to this email.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

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
      ? `<p style="margin: 4px 0;"><strong>Game Name:</strong> ${workRequest.gameName}</p>`
      : '';

    const materialsRow = workRequest.materials
      ? `<p style="margin: 4px 0;"><strong>Materials:</strong> <a href="${workRequest.materials}" target="_blank" style="color: #4f46e5; text-decoration: underline;">${workRequest.materials}</a></p>`
      : `<p style="margin: 4px 0;"><strong>Materials:</strong> None provided</p>`;

    const remarksRow = workRequest.remarks
      ? `<p style="margin: 4px 0;"><strong>Remarks:</strong> ${workRequest.remarks}</p>`
      : `<p style="margin: 4px 0;"><strong>Remarks:</strong> None</p>`;

    const imageRow = workRequest.image
      ? (workRequest.image.startsWith('http') || workRequest.image.startsWith('data:image'))
        ? `<div style="margin: 14px 0;"><p style="margin: 0 0 4px 0;"><strong>Attached Reference Image:</strong></p><img src="${workRequest.image}" style="max-width: 100%; max-height: 280px; border-radius: 6px; border: 1px solid #e2e8f0; margin-top: 4px;" alt="Reference Image" /></div>`
        : `<p style="margin: 4px 0;"><strong>Attachment Image:</strong> Included</p>`
      : '';

    const approveUrl = `${serverUrl}/api/work-requests/${workRequest._id}/action?status=Approved`;
    const rejectUrl = `${serverUrl}/api/work-requests/${workRequest._id}/action?status=Rejected`;

    const titleRow = workRequest.title
      ? `<div style="background-color: #f0f9ff; border: 1px solid #bae6fd; padding: 12px 16px; border-radius: 6px; margin: 12px 0;">
          <strong style="color: #0369a1; font-size: 13px;">Request Title:</strong>
          <span style="color: #0f172a; font-size: 15px; font-weight: 600; display: block; margin-top: 2px;">${workRequest.title}</span>
         </div>`
      : '';

    const htmlBody = `
      <h2 style="color: #4f46e5; margin: 0 0 16px 0; font-size: 18px;">New Work Request Received</h2>
      
      <p style="margin: 4px 0;"><strong>Client Name:</strong> ${workRequest.clientName || 'N/A'}</p>
      <p style="margin: 4px 0;"><strong>Client ID:</strong> ${workRequest.clientId || 'N/A'}</p>
      ${titleRow}
      <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 14px 0;" />

      <p style="margin: 4px 0;"><strong>Category:</strong> ${workRequest.category || 'N/A'}</p>
      <p style="margin: 4px 0;"><strong>Type:</strong> ${workRequest.type || 'N/A'}</p>
      ${gameRow}
      <p style="margin: 4px 0;"><strong>Budget:</strong> ₹${workRequest.budget ? workRequest.budget.toLocaleString('en-IN') : '0'}</p>
      <p style="margin: 4px 0;"><strong>Deadline:</strong> ${formattedDeadline}</p>
      ${materialsRow}
      ${remarksRow}
      ${imageRow}

      <div style="text-align: center; margin: 28px 0 16px 0;">
        <a href="${approveUrl}" 
           style="background-color: #16a34a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block; margin-right: 12px;">
           Approve Request
        </a>
        <a href="${rejectUrl}" 
           style="background-color: #dc2626; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
           Reject Request
        </a>
      </div>
      <p style="font-size: 12px; color: #64748b; text-align: center; margin: 0;">
        Clicking Approve or Reject will update the request status directly in your portal.
      </p>
    `;

    const textBody = `New Work Request Received\n\n` +
      `Client Name: ${workRequest.clientName || 'N/A'}\n` +
      `Title: ${workRequest.title || workRequest.type || 'N/A'}\n` +
      `Category: ${workRequest.category || 'N/A'}\n` +
      `Budget: ₹${workRequest.budget || 0}\n` +
      `Deadline: ${formattedDeadline}\n\n` +
      `Approve: ${approveUrl}\n` +
      `Reject: ${rejectUrl}\n`;

    const mailOptions = {
      from: `"GT Edits" <${process.env.EMAIL_USER}>`,
      replyTo: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      to: adminEmail,
      subject: `[GT Edits] New Work Request from ${workRequest.clientName || 'Client'}: ${workRequest.title || workRequest.type}`,
      text: textBody,
      html: wrapHtml(htmlBody),
    };

    await transporter.sendMail(mailOptions);
    console.log(`✉️ Admin notification email sent successfully to ${adminEmail}`);
  } catch (err) {
    console.error('❌ Failed to send admin email notification:', err.message);
  }
};

/**
 * Send email notification to Admin when client APPROVES a deliverable
 */
const sendAdminApprovalNotification = async ({ deliverable, project }) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    const htmlBody = `
      <h2 style="color: #16a34a; margin: 0 0 16px 0; font-size: 18px;">Deliverable Approved</h2>
      <p>Client <strong>${project.clientName}</strong> has approved the deliverable <strong>"${deliverable.name}"</strong> (Version ${deliverable.version}).</p>
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px; border-radius: 6px; margin: 16px 0; font-size: 14px;">
        <p style="margin: 4px 0;"><strong>Project:</strong> ${project.title}</p>
        <p style="margin: 4px 0;"><strong>Deliverable:</strong> ${deliverable.name} (v${deliverable.version})</p>
        <p style="margin: 4px 0;"><strong>Approved Date:</strong> ${new Date().toLocaleString('en-IN')}</p>
      </div>
      <p style="font-size: 13px; color: #64748b;">The project status has been updated to "Approved by Client" in your portal.</p>
    `;

    const textBody = `Deliverable Approved\n\n` +
      `Client: ${project.clientName}\n` +
      `Project: ${project.title}\n` +
      `Deliverable: ${deliverable.name} (v${deliverable.version})\n` +
      `Approved Date: ${new Date().toLocaleString('en-IN')}\n`;

    const mailOptions = {
      from: `"GT Edits" <${process.env.EMAIL_USER}>`,
      replyTo: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      to: adminEmail,
      subject: `[GT Edits] Deliverable Approved: "${project.title}" (v${deliverable.version})`,
      text: textBody,
      html: wrapHtml(htmlBody),
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
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    const htmlBody = `
      <h2 style="color: #dc2626; margin: 0 0 16px 0; font-size: 18px;">Revision Requested by Client</h2>
      <p>Client <strong>${project.clientName}</strong> has requested revisions for <strong>"${deliverable.name}"</strong> (Version ${deliverable.version}).</p>
      
      <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 14px; border-radius: 4px; margin: 16px 0; font-size: 14px;">
        <strong style="color: #991b1b; display: block; margin-bottom: 6px;">Client Feedback:</strong>
        <span style="color: #1e293b; white-space: pre-wrap;">${revision.description}</span>
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; font-size: 13px; color: #64748b;">
        <p style="margin: 3px 0;"><strong>Project:</strong> ${project.title}</p>
        <p style="margin: 3px 0;"><strong>Deliverable:</strong> ${deliverable.name} (v${deliverable.version})</p>
        <p style="margin: 3px 0;"><strong>Requested Date:</strong> ${new Date().toLocaleString('en-IN')}</p>
      </div>
    `;

    const textBody = `Revision Requested by Client\n\n` +
      `Client: ${project.clientName}\n` +
      `Project: ${project.title}\n` +
      `Deliverable: ${deliverable.name} (v${deliverable.version})\n` +
      `Feedback: ${revision.description}\n`;

    const mailOptions = {
      from: `"GT Edits" <${process.env.EMAIL_USER}>`,
      replyTo: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      to: adminEmail,
      subject: `[GT Edits] Revision Requested: "${project.title}" (v${deliverable.version})`,
      text: textBody,
      html: wrapHtml(htmlBody),
    };
    await transporter.sendMail(mailOptions);
  } catch (err) {
    console.error('Failed to send admin revision email:', err.message);
  }
};

/**
 * Send email notification to Admin when a work request is REJECTED
 */
const sendAdminRejectionNotification = async ({ workRequest, reason }) => {
  try {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    const htmlBody = `
      <h2 style="color: #dc2626; margin: 0 0 16px 0; font-size: 18px;">Work Request Rejected</h2>
      <p>Work request from <strong>${workRequest.clientName || 'Client'}</strong> has been marked as <strong>Rejected</strong>.</p>
      <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 14px; border-radius: 4px; margin: 16px 0; font-size: 14px;">
        <strong style="color: #991b1b; display: block; margin-bottom: 6px;">Reason:</strong>
        <span style="color: #1e293b; white-space: pre-wrap;">${reason || workRequest.adminNote || 'None'}</span>
      </div>
    `;

    const textBody = `Work Request Rejected\n\n` +
      `Client: ${workRequest.clientName || 'Client'}\n` +
      `Reason: ${reason || workRequest.adminNote || 'None'}\n`;

    const mailOptions = {
      from: `"GT Edits" <${process.env.EMAIL_USER}>`,
      replyTo: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      to: adminEmail,
      subject: `[GT Edits] Work Request Rejected: ${workRequest.title || workRequest.clientName}`,
      text: textBody,
      html: wrapHtml(htmlBody),
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
    const htmlBody = `
      <h2 style="color: #16a34a; margin: 0 0 16px 0; font-size: 18px;">Work Request Approved</h2>
      <p>Hi <strong>${clientName || 'there'}</strong>,</p>
      <p>Great news! Your work request has been approved and production is now underway.</p>
      
      <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; padding: 14px; border-radius: 6px; margin: 16px 0; font-size: 14px;">
        <p style="margin: 4px 0;"><strong>Request:</strong> ${workRequest.title || workRequest.type}</p>
        <p style="margin: 4px 0;"><strong>Category:</strong> ${workRequest.category || 'N/A'}</p>
        <p style="margin: 4px 0;"><strong>Budget:</strong> ₹${workRequest.budget ? workRequest.budget.toLocaleString('en-IN') : '0'}</p>
      </div>

      <div style="text-align: center; margin: 28px 0 16px 0;">
        <a href="${clientPortalUrl}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
          Open Client Portal
        </a>
      </div>
    `;

    const textBody = `Hi ${clientName || 'there'},\n\n` +
      `Great news! Your work request has been approved and production is now underway.\n\n` +
      `Request: ${workRequest.title || workRequest.type}\n` +
      `Category: ${workRequest.category || 'N/A'}\n` +
      `Budget: ₹${workRequest.budget || 0}\n\n` +
      `Log in to your portal to view status: ${clientPortalUrl}\n\n` +
      `Best regards,\nGT Edits Team`;

    const mailOptions = {
      from: `"GT Edits" <${process.env.EMAIL_USER}>`,
      replyTo: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      to: clientEmail.trim(),
      subject: `[GT Edits] Work Request Approved: "${workRequest.title || workRequest.type}"`,
      text: textBody,
      html: wrapHtml(htmlBody),
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
      ? `<div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 6px; margin: 14px 0; font-size: 13px; color: #475569;">
          <strong>Notes from Editor:</strong>
          <p style="margin: 4px 0 0 0; white-space: pre-wrap;">${deliverable.description}</p>
         </div>`
      : '';

    const directLinkHtml = deliverable.url
      ? `<a href="${deliverable.url}" target="_blank" style="background-color: #0284c7; color: #ffffff; padding: 12px 22px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block; margin-left: 8px;">
          Direct Link
         </a>`
      : '';

    const htmlBody = `
      <h2 style="color: #0284c7; margin: 0 0 16px 0; font-size: 18px;">Deliverable Ready for Review</h2>
      <p>Hi <strong>${clientName || 'there'}</strong>,</p>
      <p>A new deliverable version has been uploaded for your project <strong>"${project.title}"</strong>.</p>
      
      <div style="background-color: #f0f9ff; border: 1px solid #bae6fd; padding: 14px; border-radius: 6px; margin: 16px 0; font-size: 14px;">
        <p style="margin: 4px 0;"><strong>Deliverable:</strong> ${deliverable.name} (v${deliverable.version})</p>
        <p style="margin: 4px 0;"><strong>Project:</strong> ${project.title}</p>
        ${deliverable.type === 'file' && deliverable.fileSize ? `<p style="margin: 4px 0;"><strong>File Size:</strong> ${(deliverable.fileSize / 1024 / 1024).toFixed(1)} MB</p>` : ''}
      </div>

      ${notesHtml}

      <p style="font-size: 14px; color: #475569; margin: 20px 0 12px 0;">
        Please log in to your portal to review and either approve the deliverable or submit revision feedback:
      </p>

      <div style="text-align: center; margin: 24px 0 16px 0;">
        <a href="${clientPortalUrl}" style="background-color: #16a34a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
          Review in Client Portal
        </a>
        ${directLinkHtml}
      </div>
    `;

    const textBody = `Hi ${clientName || 'there'},\n\n` +
      `A new deliverable version has been uploaded for your project "${project.title}".\n\n` +
      `Deliverable: ${deliverable.name} (v${deliverable.version})\n` +
      `Project: ${project.title}\n` +
      (deliverable.description ? `Notes: ${deliverable.description}\n` : '') +
      (deliverable.url ? `Direct Link: ${deliverable.url}\n` : '') +
      `\nYou can review, approve, or request revisions directly in your client portal:\n` +
      `${clientPortalUrl}\n\n` +
      `Best regards,\nGT Edits Team`;

    const mailOptions = {
      from: `"GT Edits" <${process.env.EMAIL_USER}>`,
      replyTo: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      to: clientEmail.trim(),
      subject: `[GT Edits] Deliverable ready for review: "${deliverable.name}" (v${deliverable.version})`,
      text: textBody,
      html: wrapHtml(htmlBody),
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

    const htmlBody = `
      <h2 style="color: #dc2626; margin: 0 0 16px 0; font-size: 18px;">Work Request Update</h2>
      <p>Hi <strong>${clientName || 'there'}</strong>,</p>
      <p>Thank you for submitting your work request. We are unable to process this request at this time.</p>
      
      <div style="background-color: #fef2f2; border-left: 4px solid #dc2626; padding: 14px; border-radius: 4px; margin: 16px 0; font-size: 14px;">
        <p style="margin: 0 0 6px 0; color: #991b1b;"><strong>Reason / Feedback:</strong></p>
        <span style="color: #1e293b; white-space: pre-wrap;">${rejectionReason}</span>
      </div>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 14px; border-radius: 6px; margin: 16px 0; font-size: 14px;">
        <p style="margin: 4px 0;"><strong>Request:</strong> ${workRequest.title || workRequest.type}</p>
        <p style="margin: 4px 0;"><strong>Category:</strong> ${workRequest.category || 'N/A'}</p>
        <p style="margin: 4px 0;"><strong>Budget:</strong> ₹${workRequest.budget ? workRequest.budget.toLocaleString('en-IN') : '0'}</p>
      </div>

      <p style="font-size: 14px; color: #475569;">You are welcome to submit a revised request with updated details or scope.</p>

      <div style="text-align: center; margin: 24px 0 16px 0;">
        <a href="${clientPortalUrl}" style="background-color: #0f172a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
          Open Client Portal
        </a>
      </div>
    `;

    const textBody = `Hi ${clientName || 'there'},\n\n` +
      `Thank you for submitting your work request. We are unable to process this request at this time.\n\n` +
      `Reason / Feedback: ${rejectionReason}\n\n` +
      `Request: ${workRequest.title || workRequest.type}\n` +
      `Category: ${workRequest.category || 'N/A'}\n\n` +
      `You are welcome to submit a revised request in your portal: ${clientPortalUrl}\n\n` +
      `Best regards,\nGT Edits Team`;

    const mailOptions = {
      from: `"GT Edits" <${process.env.EMAIL_USER}>`,
      replyTo: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      to: clientEmail.trim(),
      subject: `[GT Edits] Update regarding your Work Request: "${workRequest.title || workRequest.type}"`,
      text: textBody,
      html: wrapHtml(htmlBody),
    };
    await transporter.sendMail(mailOptions);
    console.log(`✉️ Rejection notification email sent successfully to ${clientEmail}`);
  } catch (err) {
    console.error('Failed to send client request rejection email:', err.message);
  }
};

/**
 * Send email notification to CLIENT for invoice / payment reminder
 */
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
    const formattedTotal = `₹${Number(grandTotal).toLocaleString('en-IN')}`;
    const safeClientName = clientName || 'Client';
    const filename = `Invoice_${safeClientName.replace(/\s+/g, '_')}.pdf`;

    const htmlBody = `
      <div style="text-align: center; padding-bottom: 16px; border-bottom: 2px solid #f59e0b;">
        <h2 style="color: #d97706; margin: 0; font-size: 20px;">Invoice & Balance Notice</h2>
      </div>

      <div style="margin-top: 20px;">
        <p style="font-size: 15px;">Dear <strong>${safeClientName}</strong>,</p>
        <p style="font-size: 15px; color: #334155;">
          This is a friendly update regarding the balance payment for your project with GT Edits.
        </p>

        <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; border-radius: 6px; margin: 20px 0;">
          <p style="margin: 0; color: #92400e; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Outstanding Amount</p>
          <p style="margin: 6px 0 0 0; color: #78350f; font-size: 22px; font-weight: 700;">${formattedTotal}</p>
        </div>

        <p style="font-size: 14px; color: #475569;">
          We have attached your itemized <strong>Invoice PDF</strong> to this email for your accounting records.
        </p>

        <div style="text-align: center; margin: 26px 0 18px 0;">
          <a href="${clientPortalUrl}" style="background-color: #f59e0b; color: #ffffff; padding: 12px 26px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 14px; display: inline-block;">
            View Details in Client Portal
          </a>
        </div>

        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />

        <p style="font-size: 12px; color: #64748b; line-height: 1.5; margin: 0;">
          If you have already processed this payment, please disregard this notice or reach out to us with any questions.
        </p>
        <p style="font-size: 14px; font-weight: 600; color: #1e293b; margin-top: 14px;">
          Best regards,<br/>
          <span style="color: #4f46e5;">GT Edits</span>
        </p>
      </div>
    `;

    const textBody = `Dear ${safeClientName},\n\n` +
      `This is a friendly update regarding the balance payment for your project with GT Edits.\n\n` +
      `Outstanding Amount: ${formattedTotal}\n\n` +
      `We have attached your itemized Invoice PDF to this email for your reference.\n\n` +
      `You can review your project details directly in your portal:\n${clientPortalUrl}\n\n` +
      `If you have already settled this balance, please disregard this message.\n\n` +
      `Best regards,\nGT Edits Team`;

    const mailOptions = {
      from: `"GT Edits" <${process.env.EMAIL_USER}>`,
      replyTo: process.env.ADMIN_EMAIL || process.env.EMAIL_USER,
      to: clientEmail.trim(),
      subject: `[GT Edits] Invoice update for your project: ${formattedTotal}`,
      text: textBody,
      html: wrapHtml(htmlBody),
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
    return { success: false, reason: `SMTP Mail delivery failed: ${err.message}` };
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

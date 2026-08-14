const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendAdminNotification = async (workRequest) => {
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
    to: process.env.ADMIN_EMAIL,
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
  if (!clientEmail || clientEmail.includes('gtportal.com')) {
    console.warn(`[sendEmail] Skipping deliverable email for "${clientName}": email is empty or generated login email (${clientEmail})`);
    return;
  }
  try {
    const clientPortalUrl = process.env.CLIENT_URL || 'https://gtedits-clientportal.vercel.app';
    const mailOptions = {
      from: `"GT Client Portal" <${process.env.EMAIL_USER}>`,
      to: clientEmail,
      subject: `📦 New Deliverable Uploaded for "${project.title}" (v${deliverable.version})`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px; color: #333; background-color: #ffffff;">
          <h2 style="color: #0284c7; border-bottom: 2px solid #0284c7; padding-bottom: 8px; margin-top: 0;">🎬 Deliverable Ready for Review</h2>
          <p>Hi <strong>${clientName || 'Client'}</strong>,</p>
          <p>A new deliverable has been uploaded for your project <strong>"${project.title}"</strong>.</p>
          
          <div style="background-color: #e0f2fe; border: 1px solid #bae6fd; padding: 14px; border-radius: 6px; margin: 16px 0; font-size: 14px;">
            <p style="margin: 4px 0;"><strong>Deliverable:</strong> ${deliverable.name} (v${deliverable.version})</p>
            <p style="margin: 4px 0;"><strong>Project:</strong> ${project.title}</p>
          </div>

          <p>Please log in to preview and approve or request revisions.</p>

          <div style="text-align: center; margin: 25px 0;">
            <a href="${clientPortalUrl}" style="background-color: #16a34a; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px; display: inline-block;">
              👀 View Deliverable
            </a>
          </div>
        </div>
      `,
    };
    await transporter.sendMail(mailOptions);
    console.log(`✉️ Deliverable notification email sent successfully to ${clientEmail}`);
  } catch (err) {
    console.error('Failed to send client deliverable email:', err.message);
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

module.exports = {
  sendAdminNotification,
  sendAdminApprovalNotification,
  sendAdminRevisionNotification,
  sendAdminRejectionNotification,
  sendClientRequestApprovalNotification,
  sendClientRequestRejectionNotification,
  sendClientDeliverableNotification,
};



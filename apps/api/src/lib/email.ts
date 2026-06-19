import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // TLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Gmail app password
  },
});

export async function sendOtpEmail(to: string, otp: string, clinicName?: string): Promise<void> {
  const clinic = clinicName || 'Clinic';
  await transporter.sendMail({
    from: `"${clinic}" <${process.env.SMTP_USER}>`,
    to,
    subject: `Your ${clinic} Login OTP — ${otp}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">Verify your email</h2>
        <p>Use the OTP below to log in. It expires in <strong>10 minutes</strong>.</p>
        <div style="
          font-size: 36px;
          font-weight: 700;
          letter-spacing: 10px;
          text-align: center;
          padding: 20px;
          background: #f4f4f9;
          border-radius: 8px;
          margin: 24px 0;
          color: #6c63ff;
        ">${otp}</div>
        <p style="color: #888; font-size: 13px;">
          If you didn't request this, ignore this email. Never share your OTP.
        </p>
      </div>
    `,
    text: `Your login OTP: ${otp}\nExpires in 10 minutes.\nDo not share this.`,
  });
}

export async function sendAppointmentConfirmationEmail(params: {
  to: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  clinicPhone?: string;
  appointmentDatetime: Date;
  durationMinutes: number;
  appointmentId: string;
  paymentDetails?: {
    amount: string;
    paymentId: string;
    paymentMethod?: string;
    completedAt?: Date;
  };
}): Promise<void> {
  const { to, patientName, doctorName, clinicName, clinicPhone, appointmentDatetime, durationMinutes, appointmentId, paymentDetails } = params;

  const dateStr = appointmentDatetime.toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Kolkata',
  });
  const timeStr = appointmentDatetime.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });

  const receiptHtml = paymentDetails ? `
    <div style="margin-top: 24px; padding-top: 20px; border-top: 2px dashed #eee;">
      <h4 style="color: #1a1a2e; margin: 0 0 10px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">Payment Receipt</h4>
      <table style="width: 100%; border-collapse: collapse; background: #fafafa; border: 1px solid #f0f0f0; border-radius: 6px;">
        <tr>
          <td style="padding: 10px 12px; color: #666; font-size: 13px; border-bottom: 1px solid #eee;">Receipt ID</td>
          <td style="padding: 10px 12px; text-align: right; font-size: 13px; border-bottom: 1px solid #eee;"><strong>${paymentDetails.paymentId}</strong></td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; color: #666; font-size: 13px; border-bottom: 1px solid #eee;">Amount Paid</td>
          <td style="padding: 10px 12px; text-align: right; font-size: 13px; border-bottom: 1px solid #eee; color: #10b981;"><strong>₹${paymentDetails.amount}</strong></td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; color: #666; font-size: 13px; border-bottom: 1px solid #eee;">Payment Method</td>
          <td style="padding: 10px 12px; text-align: right; font-size: 13px; border-bottom: 1px solid #eee; text-transform: capitalize;">${paymentDetails.paymentMethod || 'Online'}</td>
        </tr>
        <tr>
          <td style="padding: 10px 12px; color: #666; font-size: 13px;">Status</td>
          <td style="padding: 10px 12px; text-align: right; font-size: 13px;">
            <span style="background: rgba(16, 185, 129, 0.1); color: #10b981; padding: 4px 10px; border-radius: 20px; font-weight: 700; font-size: 11px;">PAID</span>
          </td>
        </tr>
      </table>
    </div>
  ` : '';

  await transporter.sendMail({
    from: `"${clinicName}" <${process.env.SMTP_USER}>`,
    to,
    subject: `✅ Appointment Confirmed — ${dateStr}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: auto; padding: 24px; background: #fff;">
        <div style="background: #6c63ff; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
          <h2 style="margin: 0;">Appointment Confirmed!</h2>
          <p style="margin: 6px 0 0; opacity: 0.85;">${clinicName}</p>
        </div>
        <div style="padding: 24px; border: 1px solid #eee; border-radius: 0 0 8px 8px;">
          <p>Hello <strong>${patientName}</strong>,</p>
          <p>Your appointment has been successfully booked.</p>

          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 10px; border-bottom: 1px solid #f0f0f0; color: #888; width: 40%;">Doctor</td><td style="padding: 10px; border-bottom: 1px solid #f0f0f0;"><strong>Dr. ${doctorName}</strong></td></tr>
            <tr><td style="padding: 10px; border-bottom: 1px solid #f0f0f0; color: #888;">Date</td><td style="padding: 10px; border-bottom: 1px solid #f0f0f0;"><strong>${dateStr}</strong></td></tr>
            <tr><td style="padding: 10px; border-bottom: 1px solid #f0f0f0; color: #888;">Time</td><td style="padding: 10px; border-bottom: 1px solid #f0f0f0;"><strong>${timeStr}</strong></td></tr>
            <tr><td style="padding: 10px; border-bottom: 1px solid #f0f0f0; color: #888;">Duration</td><td style="padding: 10px; border-bottom: 1px solid #f0f0f0;">${durationMinutes} minutes</td></tr>
            ${clinicPhone ? `<tr><td style="padding: 10px; color: #888;">Clinic Phone</td><td style="padding: 10px;">${clinicPhone}</td></tr>` : ''}
          </table>

          ${receiptHtml}

          <p style="background: #f9f9ff; padding: 12px; border-radius: 6px; font-size: 13px; margin-top: 24px;">
            📌 Please arrive <strong>10 minutes early</strong>. Bring any previous reports or prescriptions.
          </p>

          <p style="color: #888; font-size: 12px; margin-top: 20px;">
            Appointment ID: ${appointmentId}
          </p>
        </div>
      </div>
    `,
  });
}

export async function sendReminderEmail(params: {
  to: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  appointmentDatetime: Date;
}): Promise<void> {
  const { to, patientName, doctorName, clinicName, appointmentDatetime } = params;
  const timeStr = appointmentDatetime.toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });

  await transporter.sendMail({
    from: `"${clinicName}" <${process.env.SMTP_USER}>`,
    to,
    subject: `⏰ Reminder: Appointment tomorrow at ${timeStr}`,
    html: `
      <div style="font-family: sans-serif; max-width: 480px; margin: auto; padding: 24px;">
        <h2 style="color: #1a1a2e;">Appointment Reminder</h2>
        <p>Hi <strong>${patientName}</strong>, this is a reminder that you have an appointment tomorrow:</p>
        <p>🩺 <strong>Dr. ${doctorName}</strong> at <strong>${timeStr}</strong></p>
        <p>See you soon!</p>
      </div>
    `,
  });
}

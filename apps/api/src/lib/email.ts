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

async function sendEmail(params: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  fromName: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    console.log(`[Email] Dispatching via Resend API to: ${params.to}`);
    const fromEmail = process.env.RESEND_FROM_EMAIL || process.env.SMTP_USER || 'info@sriswethaclinic.com';
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `"${params.fromName}" <${fromEmail}>`,
        to: [params.to],
        subject: params.subject,
        html: params.html,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Resend API response error (${response.status}): ${JSON.stringify(errorData)}`);
    }
  } else {
    console.log(`[Email] Dispatching via SMTP transporter to: ${params.to}`);
    await transporter.sendMail({
      from: `"${params.fromName}" <${process.env.SMTP_USER}>`,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
  }
}

export async function sendOtpEmail(to: string, otp: string, clinicName?: string): Promise<void> {
  const clinic = clinicName || 'Clinic';
  await sendEmail({
    fromName: clinic,
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
    <!-- Receipt Card -->
    <div style="margin-top: 28px; padding: 20px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h4 style="color: #0f172a; margin: 0; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;">Payment Details</h4>
        <span style="background-color: #d1fae5; color: #065f46; padding: 4px 10px; border-radius: 20px; font-weight: 700; font-size: 10px; letter-spacing: 0.5px; text-transform: uppercase;">Paid ✅</span>
      </div>
      
      <table style="width: 100%; border-collapse: collapse; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-size: 13px;">Transaction ID</td>
          <td style="padding: 10px 0; text-align: right; font-size: 13px; color: #334155; font-family: monospace; font-weight: 600;">${paymentDetails.paymentId}</td>
        </tr>
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 10px 0; color: #64748b; font-size: 13px;">Payment Method</td>
          <td style="padding: 10px 0; text-align: right; font-size: 13px; color: #334155; text-transform: capitalize;">${paymentDetails.paymentMethod || 'Online'}</td>
        </tr>
        <tr>
          <td style="padding: 10px 0; color: #64748b; font-size: 13px; font-weight: 600;">Amount Charged</td>
          <td style="padding: 10px 0; text-align: right; font-size: 16px; color: #4f46e5; font-weight: 800;">₹${paymentDetails.amount}</td>
        </tr>
      </table>
    </div>
  ` : '';

  await sendEmail({
    fromName: clinicName,
    to,
    subject: `Appointment Confirmed at ${clinicName} — Dr. ${doctorName}`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Appointment Confirmed</title>
      </head>
      <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 600px; margin: 40px auto; padding: 0 16px;">
          
          <!-- Outer Container -->
          <div style="background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.05); border: 1px solid #e2e8f0;">
            
            <!-- Gradient Header Banner -->
            <div style="background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 32px; text-align: center; color: #ffffff;">
              <div style="display: inline-block; background-color: rgba(255, 255, 255, 0.15); border-radius: 50%; padding: 12px; margin-bottom: 16px;">
                <span style="font-size: 32px; line-height: 1;">✅</span>
              </div>
              <h1 style="margin: 0; font-size: 24px; font-weight: 800; letter-spacing: -0.5px;">Appointment Confirmed!</h1>
              <p style="margin: 6px 0 0 0; font-size: 14px; opacity: 0.85; font-weight: 500;">Thank you for choosing ${clinicName}</p>
            </div>
            
            <!-- Card Body Content -->
            <div style="padding: 32px; color: #334155; line-height: 1.6;">
              <p style="margin: 0 0 20px 0; font-size: 15px; color: #334155;">Hello <strong style="color: #0f172a;">${patientName}</strong>,</p>
              <p style="margin: 0 0 24px 0; font-size: 14px; color: #64748b;">Your booking request was successfully verified, and your appointment slot is officially reserved. Below is your consultation summary:</p>
              
              <!-- Appointment Details Card -->
              <div style="border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin-bottom: 24px; background-color: #fafbfd;">
                <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 0; color: #64748b; width: 35%;">Consulting Doctor</td>
                    <td style="padding: 10px 0; color: #0f172a; font-weight: 700;">Dr. ${doctorName}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 0; color: #64748b;">Appointment Date</td>
                    <td style="padding: 10px 0; color: #0f172a; font-weight: 700;">${dateStr}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 0; color: #64748b;">Scheduled Time</td>
                    <td style="padding: 10px 0; color: #0f172a; font-weight: 700;">${timeStr}</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 0; color: #64748b;">Session Duration</td>
                    <td style="padding: 10px 0; color: #334155;">${durationMinutes} Minutes</td>
                  </tr>
                  <tr style="border-bottom: 1px solid #f1f5f9;">
                    <td style="padding: 10px 0; color: #64748b;">Consultation Mode</td>
                    <td style="padding: 10px 0; color: #334155; font-weight: 600;">${params.paymentDetails ? '💻 Teleconsult (Online)' : '🏥 In-Person (Clinic Visit)'}</td>
                  </tr>
                  ${clinicPhone ? `
                  <tr>
                    <td style="padding: 10px 0; color: #64748b;">Clinic Helpline</td>
                    <td style="padding: 10px 0; color: #334155; font-weight: 600;">${clinicPhone}</td>
                  </tr>` : ''}
                </table>
              </div>

              <!-- Payment Receipt HTML Insertion -->
              ${receiptHtml}

              <!-- Pre-visit Patient Instructions -->
              <div style="background-color: #eef2ff; border-left: 4px solid #6366f1; padding: 16px; border-radius: 4px; margin-top: 28px; font-size: 13px; color: #3730a3; line-height: 1.5;">
                <strong style="display: block; margin-bottom: 4px;">📌 Patient Instructions:</strong>
                Please join the consultation link or arrive at the clinic <strong>10 minutes before</strong> your scheduled time. Please keep any recent medical records or prescriptions handy.
              </div>

              <div style="margin-top: 36px; padding-top: 24px; border-top: 1px solid #f1f5f9; text-align: center;">
                <span style="font-size: 11px; color: #94a3b8; font-family: monospace;">Booking Ref ID: ${appointmentId}</span>
              </div>
            </div>
            
          </div>
          
          <!-- Email Footer -->
          <div style="margin-top: 24px; text-align: center; font-size: 12px; color: #94a3b8; line-height: 1.5;">
            This email is an automated confirmation slip for your booking. Please do not reply directly to this message.<br>
            © ${new Date().getFullYear()} ${clinicName} Platform. Powered by ClinicBook.
          </div>
          
        </div>
      </body>
      </html>
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

  await sendEmail({
    fromName: clinicName,
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

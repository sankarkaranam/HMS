import 'dotenv/config';
import { sendAppointmentConfirmationEmail } from '../lib/email';

async function test() {
  const recipient = process.env.SMTP_USER;
  if (!recipient) {
    console.error('❌ Error: SMTP_USER is not set in apps/api/.env file.');
    process.exit(1);
  }

  console.log(`✉️ Sending test confirmation email to: ${recipient}...`);
  console.log(`SMTP Host: ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
  console.log(`SMTP Port: ${process.env.SMTP_PORT || '587'}`);

  try {
    await sendAppointmentConfirmationEmail({
      to: recipient,
      patientName: 'John Doe',
      doctorName: 'Pavan Kumar',
      clinicName: 'Sri Swetha Pharmacy & Clinic',
      clinicPhone: '+91 98765 43210',
      appointmentDatetime: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
      durationMinutes: 15,
      appointmentId: 'apt_test_78520BFE',
      paymentDetails: {
        amount: '1.00',
        paymentId: 'TXN_PHPE_859201848',
        paymentMethod: 'UPI (GPay)',
        completedAt: new Date(),
      },
    });

    console.log('✅ Test email sent successfully! Please check your inbox.');
  } catch (err: any) {
    console.error('❌ Failed to send test email. Error details:');
    console.error(err);
  }
}

test();

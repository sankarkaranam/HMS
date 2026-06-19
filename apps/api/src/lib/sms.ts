/**
 * Simulated SMS Service Library
 * Logs SMS message payload to console for verification in development.
 */

export interface SmsParams {
  to: string;
  patientName: string;
  doctorName: string;
  clinicName: string;
  appointmentDatetime: Date;
  amount?: string;
  paymentId?: string;
}

export async function sendAppointmentConfirmationSms(params: SmsParams): Promise<void> {
  const { to, patientName, doctorName, clinicName, appointmentDatetime } = params;

  const dateStr = appointmentDatetime.toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  });
  
  const timeStr = appointmentDatetime.toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });

  const message = `Hi ${patientName}, your appointment at ${clinicName} with Dr. ${doctorName} is confirmed for ${dateStr} at ${timeStr}. Thank you!`;

  console.log('\n=================== [SIMULATED SMS SENT] ===================');
  console.log(`To:      ${to}`);
  console.log(`Message: ${message}`);
  console.log('============================================================\n');
}

export async function sendPaymentReceiptSms(params: SmsParams): Promise<void> {
  const { to, patientName, clinicName, amount, paymentId } = params;

  const message = `Hi ${patientName}, we have received your payment of Rs. ${amount || '0.00'} for your appointment at ${clinicName}. Receipt ID: ${paymentId || 'N/A'}. Thank you!`;

  console.log('\n=================== [SIMULATED SMS SENT] ===================');
  console.log(`To:      ${to}`);
  console.log(`Message: ${message}`);
  console.log('============================================================\n');
}

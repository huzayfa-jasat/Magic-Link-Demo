// Dependencies
const { Resend } = require('resend');
console.log('🔑 Resend API Key:', process.env.RESEND_API_KEY ? '✅ Present' : '❌ Missing');
const resend = new Resend(process.env.RESEND_API_KEY);

// Template Imports
const {
  resend_template_OtpLogin,
} = require('./resend_utils/templates/index');

// Sender Constants
const FROM_EMAIL = 'Magic Link Demo <onboarding@resend.dev>';
const REPLY_TO_EMAIL = 'Magic Link Demo <onboarding@resend.dev>';

// Helper Functions
async function resend_sendEmail(recipient_email, subject, html) {
    try {
        console.log('📧 Attempting to send email to:', recipient_email);
        const { data, error } = await resend.emails.send({
            from: FROM_EMAIL,
            replyTo: REPLY_TO_EMAIL,
            to: recipient_email,
            subject,
            html,
        });
        if (error) {
            console.error('❌ Email send error:', error);
            return { error };
        }
        console.log('✅ Email sent successfully:', data);
        return data;
    } catch (error) {
        console.error('❌ Email send exception:', error);
        return { error };
    }
}

/**
 * Send OTP email
 * @param {string} recipient_email - The email address of the recipient
 * @param {string} otp_link - The OTP link
 * @returns {Promise<object>}
*/
async function resend_sendOtpEmail(recipient_email, otp_link) {
  try {
    console.log('🔗 Generating OTP email with link:', otp_link);
    const html = resend_template_OtpLogin(otp_link);
    return await resend_sendEmail(recipient_email, 'Sign In to Magic Link Demo', html);
  } catch (error) {
    console.error('❌ OTP email error:', error);
    return { error };
  }
}

// Export
module.exports = {
    resend_sendOtpEmail,
};
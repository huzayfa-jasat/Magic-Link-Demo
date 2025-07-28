// Dependencies
const { Resend } = require('resend');
const resend = new Resend(process.env.RESEND_API_KEY);

// Template Imports
const {
  resend_template_Welcome,
  resend_template_OtpLogin,
  resend_template_PasswordReset,
  resend_template_LowCredits,
} = require('./resend_utils/templates/index');

// Sender Constants
const FROM_EMAIL = 'OmniVerifier <help@updates.omniverifier.com>';
const REPLY_TO_EMAIL = 'OmniVerifier <help@updates.omniverifier.com>';

// Helper Functions
async function resend_sendEmail(recipient_email, subject, html) {
    try {
        const { data } = await resend.emails.send({
            from: FROM_EMAIL,
            replyTo: REPLY_TO_EMAIL,
            to: recipient_email,
            subject,
            html,
        });
        return data;
    } catch (error) {
        return { error };
    }
}


// Main Functions

/**
 * Send welcome email
 * @param {string} recipient_email - The email address of the recipient
 * @returns {Promise<object>}
*/
async function resend_sendWelcomeEmail(recipient_email) {
  try {
    const html = resend_template_Welcome();
    return await resend_sendEmail(recipient_email, 'Welcome to OmniVerifier', html);
  } catch (error) {
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
    const html = resend_template_OtpLogin(otp_link);
    return await resend_sendEmail(recipient_email, 'Sign In to OmniVerifier', html);
  } catch (error) {
    return { error };
  }
}

/**
 * Send password reset email
 * @param {string} recipient_email - The email address of the recipient
 * @param {string} resetLink - The link to reset the password
 * @returns {Promise<object>}
*/
async function resend_sendPasswordResetEmail(recipient_email, resetLink) {
  try {
    const html = resend_template_PasswordReset(resetLink);
    return await resend_sendEmail(recipient_email, 'Reset Your OmniVerifier Password', html);
  } catch (error) {
    return { error };
  }
}

/**
 * Send low credits warning email
 * @param {string} recipient_email - The email address of the recipient
 * @param {number} balance - The balance of the user
 * @returns {Promise<object>}
*/
async function resend_sendLowCreditsEmail(recipient_email, checkType, balance) {
  try {
    const html = resend_template_LowCredits(checkType, balance);
    return await resend_sendEmail(recipient_email, 'Your OmniVerifier credits are running low', html);
  } catch (error) {
    return { error };
  }
}

// Export
module.exports = {
    resend_sendWelcomeEmail,
    resend_sendOtpEmail,
    resend_sendPasswordResetEmail,
    resend_sendLowCreditsEmail,
};
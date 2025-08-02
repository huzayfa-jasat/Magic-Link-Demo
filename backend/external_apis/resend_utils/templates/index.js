// Template Imports
const { resend_template_Welcome } = require('./welcome');
const { resend_template_OtpLogin } = require('./otp_login');
const { resend_template_PasswordReset } = require('./pass_reset');
const { resend_template_PasswordResetFromSettings } = require('./pass_reset_settings');
const { resend_template_LowCredits } = require('./credits_low');
const { resend_template_BatchCompletion } = require('./batch_completion');

// Export
module.exports = {
  resend_template_Welcome,
  resend_template_OtpLogin,
  resend_template_PasswordReset,
  resend_template_PasswordResetFromSettings,
  resend_template_LowCredits,
  resend_template_BatchCompletion,
}
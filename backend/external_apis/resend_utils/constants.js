// Resend Email Constants
const LOGO_URL = 'https://app.omniverifier.com/logo192.png';
const FRONTEND_URL_PREFIX = process.env.FRONTEND_URL_PREFIX || 'https://app.omniverifier.com';
const DASHBOARD_URL = `${FRONTEND_URL_PREFIX}/`;
const CREDITS_VALIDATE_URL = `${FRONTEND_URL_PREFIX}/packages?p=validate`;
const CREDITS_CATCHALL_URL = `${FRONTEND_URL_PREFIX}/packages?p=catchall`;


// Export
module.exports = {
	LOGO_URL,
	FRONTEND_URL_PREFIX,
	DASHBOARD_URL,
	CREDITS_VALIDATE_URL, CREDITS_CATCHALL_URL,
};
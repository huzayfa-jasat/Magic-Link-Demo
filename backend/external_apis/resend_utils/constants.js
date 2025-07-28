// Resend Email Constants
const LOGO_URL = 'https://app.omniverifier.com/logo192.png';
const DASHBOARD_URL = `${process.env.FRONTEND_URL_PREFIX}/`;
const CREDITS_VALIDATE_URL = `${process.env.FRONTEND_URL_PREFIX}/packages?p=validate`;
const CREDITS_CATCHALL_URL = `${process.env.FRONTEND_URL_PREFIX}/packages?p=catchall`;


// Export
module.exports = {
	LOGO_URL,
	DASHBOARD_URL,
	CREDITS_VALIDATE_URL, CREDITS_CATCHALL_URL,
};
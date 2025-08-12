// --------------
// Constants
// --------------

// From https://emailregex.com/
const VALID_EMAIL_REGEX = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;


// --------------
// Functions
// --------------

/**
 * Remove invalid emails
 * @param {string[]} emails - Array of emails to remove invalid emails from
 * @returns {string[]} - Array of (remaining) valid emails
 */
function removeInvalidEmails(emails) {
	// Filter emails
	return emails.filter(email => VALID_EMAIL_REGEX.test(email));
}

/**
 * Strip characters that are incompatible with utf8mb3 charset
 * @param {string} email - Email to strip invalid characters from
 * @returns {string} - Email with non-utf8mb3 characters removed
 */
function stripEmailInvalidChars(email) {
	// Strip non-utf8mb3 characters (including emojis and other 4-byte UTF-8 characters)
	// This regex matches any character outside the Basic Multilingual Plane (BMP)
	// which includes emojis and other characters that require 4 bytes in UTF-8
	email = email.replace(/[\u{10000}-\u{10FFFF}]/gu, '');
	
	// Also remove any other potentially problematic characters that might not be compatible with utf8mb3
	// This includes various control characters and other non-standard characters
	email = email.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\uFEFF]/g, '');
	
	return email;
}

/**
 * Strip email modifiers
 * @param {string} email - Email to strip modifiers from
 * @returns {string} - Email with modifiers stripped (e.g. "john.doe+12345@example.com" -> "johndoe@example.com")
 */
function stripEmailModifiers(email) {
	// First, strip invalid UTF-8 characters
	email = stripEmailInvalidChars(email);
	
	// Split email into username and domain parts
	const [username, domain] = email.split('@');
	
	// Plus Addressing: Remove everything after (and including) the plus sign
	let cleanUsername = username.split('+')[0];
	
	// Periods: Remove all periods from the username
	// Update: Removed, since not all mail providers support (ex. Outlook)
	// cleanUsername = cleanUsername.replace(/\./g, '');
	
	// Reconstruct the email
	return cleanUsername + '@' + domain;
}


// --------------
// Export
// --------------
module.exports = {
	removeInvalidEmails,
	stripEmailModifiers,
	stripEmailInvalidChars,
}
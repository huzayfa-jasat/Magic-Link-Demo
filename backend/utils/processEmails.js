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
 * Strip email modifiers
 * @param {string} email - Email to strip modifiers from
 * @returns {string} - Email with modifiers stripped (e.g. "john.doe+12345@example.com" -> "johndoe@example.com")
 */
function stripEmailModifiers(email) {
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
}
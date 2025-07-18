/**
 * Strip email modifiers from an array of emails
 * - Removes all periods (.)
 * - Removes everything after and including plus sign (+)
 * 
 * @param {string[]} emails - Array of email addresses
 * @returns {string[]} Array of modified email addresses
 */
function stripEmailModifiers(emails) {
    if (!Array.isArray(emails)) {
        return [];
    }
    
    return emails.map(email => {
        if (!email || typeof email !== 'string') {
            return email;
        }
        
        // Remove all periods
        let modified = email.replace(/\./g, '');
        
        // Remove everything after and including plus sign
        const plusIndex = modified.indexOf('+');
        if (plusIndex !== -1) {
            modified = modified.substring(0, plusIndex);
        }
        
        return modified;
    });
}

module.exports = {
    stripEmailModifiers
}; 
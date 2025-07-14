// Dependencies
const HttpStatus = require('../../types/HttpStatus.js');

// DB Function Imports
const {
    db_getUserCredits,
    db_validateEmails,
    db_validateCatchall
} = require('./funs_db.js');

// Input validation helpers
const validateEmailArray = (emails) => {
    if (!Array.isArray(emails)) {
        return { valid: false, error: 'Emails must be an array' };
    }
    
    if (emails.length < 1) {
        return { valid: false, error: 'At least 1 email required' };
    }
    
    if (emails.length > 1000) {
        return { valid: false, error: 'Maximum 1000 emails allowed per request' };
    }
    
    // Validate email format and structure
    for (let i = 0; i < emails.length; i++) {
        const email = emails[i];
        
        if (!email || typeof email !== 'string') {
            return { valid: false, error: `Invalid email format at index ${i}` };
        }
        
        // Basic email validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return { valid: false, error: `Invalid email format: ${email}` };
        }
    }
    
    return { valid: true };
};

/**
 * Get user credits
 */
async function getCredits(req, res) {
    try {
        const [ok, credits] = await db_getUserCredits(req.apiUser.id);
        
        if (!ok) {
            return res.status(HttpStatus.FAILED_STATUS).send("Failed to retrieve credits");
        }

        return res.status(HttpStatus.SUCCESS_STATUS).json({
            credits: credits,
            user_id: req.apiUser.id
        });

    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

/**
 * Validate emails for valid/invalid status
 */
async function validateEmails(req, res) {
    try {
        const { emails } = req.body;
        
        // Validate emails array
        const emailValidation = validateEmailArray(emails);
        if (!emailValidation.valid) {
            return res.status(HttpStatus.FAILED_STATUS).send(emailValidation.error);
        }

        // Sanitize emails (trim and lowercase)
        const sanitizedEmails = emails.map(email => email.trim().toLowerCase());

        // Validate emails
        const [ok, result] = await db_validateEmails(req.apiUser.id, sanitizedEmails);
        
        if (!ok) {
            if (result && result.error === 'Insufficient credits') {
                return res.status(HttpStatus.FAILED_STATUS).send("Insufficient credits");
            }
            
            return res.status(HttpStatus.FAILED_STATUS).send("Failed to validate emails");
        }

        return res.status(HttpStatus.SUCCESS_STATUS).json({
            results: result,
            processed: sanitizedEmails.length,
            user_id: req.apiUser.id
        });

    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

/**
 * Validate emails for catchall detection
 */
async function validateCatchall(req, res) {
    try {
        const { emails } = req.body;
        
        // Validate emails array
        const emailValidation = validateEmailArray(emails);
        if (!emailValidation.valid) {
            return res.status(HttpStatus.FAILED_STATUS).send(emailValidation.error);
        }

        // Sanitize emails (trim and lowercase)
        const sanitizedEmails = emails.map(email => email.trim().toLowerCase());

        // Validate emails for catchall
        const [ok, result] = await db_validateCatchall(req.apiUser.id, sanitizedEmails);
        
        if (!ok) {
            if (result && result.error === 'Insufficient credits') {
                return res.status(HttpStatus.FAILED_STATUS).send("Insufficient credits");
            }
            
            return res.status(HttpStatus.FAILED_STATUS).send("Failed to validate emails for catchall");
        }

        return res.status(HttpStatus.SUCCESS_STATUS).json({
            results: result,
            processed: sanitizedEmails.length,
            user_id: req.apiUser.id
        });

    } catch (err) {
        console.log("MTE = ", err);
        return res.status(HttpStatus.MISC_ERROR_STATUS).send(HttpStatus.MISC_ERROR_MSG);
    }
}

// Export controllers
module.exports = {
    getCredits,
    validateEmails,
    validateCatchall
}; 
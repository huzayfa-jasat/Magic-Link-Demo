// Dependencies
const { metrics } = require('../../middleware/metrics');
const tokenService = require('../../services/token');
const db = require('../../db');
const { resend_sendOtpEmail } = require('../../external_apis/resend');
const HttpStatus = require('../../types/HttpStatus');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

/**
 * Send standardized error response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code
 * @param {string} clientMessage - Opaque message for client
 * @param {string} logMessage - Detailed message for logs
 * @param {Object} logData - Additional data for logging
 */
function sendErrorResponse(res, statusCode, clientMessage, logMessage, logData = {}) {
    // Log detailed error information
    console.error(`[${statusCode}] ${logMessage}`, logData);
    
    // Send opaque error to client
    res.status(statusCode).json({ 
        error: clientMessage,
        timestamp: new Date().toISOString()
    });
}

/**
 * Register new user
 */
async function registerUser(req, res) {
    try {
        const { email, password } = req.body;
        
        // Validate input
        if (!email || !password) {
            return sendErrorResponse(
                res, 
                HttpStatus.BAD_REQUEST_STATUS, 
                'Invalid request', 
                'Registration failed: Missing email or password',
                { email: !!email, password: !!password }
            );
        }
        
        // Create user
        const result = await db.query(
            'INSERT INTO users (email, password_hash, password_salt) VALUES ($1, $2, $3) RETURNING id',
            [email, 'hash', 'salt'] // You should properly hash the password
        );
        
        return res.status(HttpStatus.SUCCESS_STATUS).json({ 
            message: "Registration successful",
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        // Check for duplicate email error
        if (error.code === '23505') { // PostgreSQL unique violation
            return sendErrorResponse(
                res,
                HttpStatus.BAD_REQUEST_STATUS,
                'Email already exists',
                'Registration failed: Duplicate email',
                { email, error: error.message }
            );
        }
        
        return sendErrorResponse(
            res,
            HttpStatus.MISC_ERROR_STATUS,
            'Registration failed',
            'Registration error',
            { email, error: error.message, stack: error.stack }
        );
    }
}

/**
 * Request magic link
 */
async function requestMagicLink(req, res) {
    try {
        const { email } = req.body;
        metrics.magicLinkRequestsTotal.inc();

        // Validate input
        if (!email) {
            return sendErrorResponse(
                res,
                HttpStatus.BAD_REQUEST_STATUS,
                'Invalid request',
                'Magic link request failed: Missing email',
                { email: !!email }
            );
        }

        // Find user
        const user = await db.query('SELECT id FROM users WHERE email = $1', [email]);
        if (!user.rows[0]) {
            // Return success to prevent email enumeration
            return res.status(HttpStatus.SUCCESS_STATUS).json({ 
                message: 'If an account exists, a magic link has been sent',
                timestamp: new Date().toISOString()
            });
        }

        // TEMPORARILY DISABLED: Check for recent valid magic tokens
        // const recentToken = await db.query(`
        //     SELECT token_hash 
        //     FROM magic_tokens 
        //     WHERE user_id = $1 
        //     AND expires_at > NOW() 
        //     AND used = false
        //     AND created_at > NOW() - INTERVAL '5 minutes'
        //     ORDER BY created_at DESC 
        //     LIMIT 1
        // `, [user.rows[0].id]);

        // // If recent token exists, don't create a new one
        // if (recentToken.rows[0]) {
        //     return res.status(200).json({ 
        //         message: 'If an account exists, a magic link has been sent'
        //     });
        // }

        // Generate magic token and replay protection data
        const token = await tokenService.generateMagicToken();
        const { hash: tokenHash, salt: tokenSalt } = tokenService.hashToken(token);
        const nonce = tokenService.generateNonce();
        const deviceFingerprint = tokenService.generateDeviceFingerprint(req);

        // Store token with replay protection data
        const tokenResult = await db.query(
            'INSERT INTO magic_tokens (user_id, token_hash, token_salt, expires_at, nonce, device_fingerprint, ip_address, user_agent) VALUES ($1, $2, $3, NOW() + INTERVAL \'15 minutes\', $4, $5, $6, $7) RETURNING id',
            [user.rows[0].id, tokenHash, tokenSalt, nonce, deviceFingerprint, req.ip, req.headers['user-agent']]
        );
        const tokenId = tokenResult.rows[0].id;

        // Debug logging
        if (process.env.NODE_ENV !== 'production') {
            console.log('Generated tokenId:', tokenId);
            console.log('Generated token:', token);
        }

        // Create signed magic link with token_id
        const baseUrl = `${FRONTEND_URL}/index.html?token_id=${tokenId}&token=${token}`;
        const signedMagicLink = tokenService.signUrl(baseUrl);
        
        // Note: Never log raw tokens or links in production
        if (process.env.NODE_ENV !== 'production') {
            console.log('Generated signed magic link for:', email);
        }
        // Track email delivery latency
        const emailStartTime = Date.now();
        await resend_sendOtpEmail(email, signedMagicLink);
        const emailLatency = (Date.now() - emailStartTime) / 1000;
        
        // Record delivery metrics
        metrics.emailDeliveryLatency.observe({ provider: 'resend' }, emailLatency);
        metrics.magicLinkDeliveredTotal.inc();

        return res.status(HttpStatus.SUCCESS_STATUS).json({ 
            message: 'Magic link sent successfully',
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        metrics.magicLinkDeliveryFailuresTotal.inc();
        return sendErrorResponse(
            res,
            HttpStatus.MISC_ERROR_STATUS,
            'Failed to send magic link',
            'Magic link request error',
            { email, error: error.message, stack: error.stack }
        );
    }
}

/**
 * Verify magic link and issue tokens
 */
async function verifyMagicLink(req, res) {
    try {
        const { token_id, token, signature, url } = req.body;
        
        // Debug logging
        if (process.env.NODE_ENV !== 'production') {
            console.log('Verification request received:');
            console.log('  token_id:', token_id);
            console.log('  token:', token);
            console.log('  signature:', signature);
            console.log('  url:', url);
        }
        
        metrics.magicLinkVerificationAttemptsTotal.inc();
        metrics.magicLinkClickedTotal.inc();

        // Verify HMAC signature first
        if (signature && url) {
            if (process.env.NODE_ENV !== 'production') {
                console.log('Verifying signature for URL:', url);
                console.log('Signature provided:', signature);
            }
            
            // Try to fix double question mark issue
            let urlToVerify = url;
            if (url.includes('??')) {
                urlToVerify = url.replace('??', '?');
                if (process.env.NODE_ENV !== 'production') {
                    console.log('Fixed double question mark, verifying:', urlToVerify);
                }
            }
            
            if (!tokenService.verifySignature(urlToVerify, signature)) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log('Signature verification failed');
                }
                metrics.magicLinkVerificationFailuresTotal.inc();
                return res.status(401).json({ error: 'Invalid signature' });
            }
            if (process.env.NODE_ENV !== 'production') {
                console.log('Signature verification successful');
            }
        }

        // Get token by ID with replay protection data
        if (process.env.NODE_ENV !== 'production') {
            console.log('Looking for token_id:', token_id);
        }
        
        const result = await db.query(`
            SELECT mt.user_id, u.email, mt.token_hash, mt.token_salt, mt.device_fingerprint, mt.ip_address, mt.user_agent, mt.nonce, mt.used, mt.expires_at
            FROM magic_tokens mt 
            JOIN users u ON u.id = mt.user_id 
            WHERE mt.id = $1
        `, [token_id]);
        
        if (process.env.NODE_ENV !== 'production' && result.rows.length > 0) {
            const tokenData = result.rows[0];
            console.log('Token found:', {
                used: tokenData.used,
                expires_at: tokenData.expires_at,
                now: new Date().toISOString()
            });
        }

        if (!result.rows[0]) {
            metrics.magicLinkVerificationFailuresTotal.inc();
            return sendErrorResponse(
                res,
                HttpStatus.UNAUTHORIZED_STATUS,
                'Invalid or expired token',
                'Token not found in database',
                { token_id, token: token?.substring(0, 8) + '...' }
            );
        }

        const tokenData = result.rows[0];
        
        // Check if token is already used
        if (tokenData.used) {
            metrics.magicLinkVerificationFailuresTotal.inc();
            return sendErrorResponse(
                res,
                HttpStatus.UNAUTHORIZED_STATUS,
                'Token already used',
                'Token already used',
                { token_id, user_id: tokenData.user_id }
            );
        }
        
        // Check if token is expired
        if (new Date(tokenData.expires_at) < new Date()) {
            metrics.magicLinkVerificationFailuresTotal.inc();
            return sendErrorResponse(
                res,
                HttpStatus.UNAUTHORIZED_STATUS,
                'Token expired',
                'Token expired',
                { token_id, expires_at: tokenData.expires_at, user_id: tokenData.user_id }
            );
        }

        // Verify the token matches the stored hash
        if (!tokenService.verifyTokenHash(token, tokenData.token_hash, tokenData.token_salt)) {
            metrics.magicLinkVerificationFailuresTotal.inc();
            return sendErrorResponse(
                res,
                HttpStatus.UNAUTHORIZED_STATUS,
                'Invalid token',
                'Token hash verification failed',
                { token_id, user_id: tokenData.user_id }
            );
        }

        // Replay protection: Only check for actual replay attacks
        // Allow different devices to use the same magic link (this is normal behavior)
        // Only prevent if the same device tries to use the same token multiple times
        const currentFingerprint = tokenService.generateDeviceFingerprint(req);
        
        // Check if this specific device has already used this token
        const replayCheck = await db.query(
            'SELECT COUNT(*) as count FROM audit_logs WHERE user_id = $1 AND event_type = $2 AND metadata->>\'token_id\' = $3 AND metadata->>\'device_fingerprint\' = $4',
            [tokenData.user_id, 'magic_link_used', token_id, currentFingerprint]
        );
        
        if (replayCheck.rows[0].count > 0) {
            if (process.env.NODE_ENV !== 'production') {
                console.log('Replay attack detected: Same device trying to reuse token');
            }
            
            // Log security event
            await db.query(
                'INSERT INTO audit_logs (user_id, event_type, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)',
                [tokenData.user_id, 'replay_attack_detected', req.ip, req.headers['user-agent'], 
                 JSON.stringify({ 
                     device_fingerprint: currentFingerprint,
                     token_id: token_id,
                     reason: 'same_device_reuse'
                 })]
            );
            
            metrics.magicLinkVerificationFailuresTotal.inc();
            return sendErrorResponse(
                res,
                HttpStatus.UNAUTHORIZED_STATUS,
                'Token already used from this device',
                'Replay attack detected: Same device trying to reuse token',
                { 
                    token_id, 
                    user_id: tokenData.user_id,
                    device_fingerprint: currentFingerprint
                }
            );
        }

        const user = {
            id: tokenData.user_id,
            email: tokenData.email
        };

        // Mark token as used
        await db.query('UPDATE magic_tokens SET used = true WHERE id = $1', [token_id]);
        
        // Log successful magic link usage for replay protection
        await db.query(
            'INSERT INTO audit_logs (user_id, event_type, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)',
            [user.id, 'magic_link_used', req.ip, req.headers['user-agent'], 
             JSON.stringify({ 
                 token_id: token_id,
                 device_fingerprint: currentFingerprint
             })]
        );

        // Generate token pair
        const tokens = await tokenService.generateTokenPair(user);

        // Store refresh token with device fingerprint
        const { hash: refreshTokenHash, salt: refreshTokenSalt } = tokenService.hashToken(tokens.refreshToken);
        const refreshFingerprint = tokenService.generateDeviceFingerprint(req);
        await db.query(
            'INSERT INTO refresh_tokens (user_id, token_hash, token_salt, expires_at, device_fingerprint, ip_address, user_agent) VALUES ($1, $2, $3, NOW() + INTERVAL \'7 days\', $4, $5, $6)',
            [user.id, refreshTokenHash, refreshTokenSalt, refreshFingerprint, req.ip, req.headers['user-agent']]
        );

        // Record successful verification
        metrics.magicLinkVerifiedTotal.inc();

        return res.status(HttpStatus.SUCCESS_STATUS).json({
            ...tokens,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        metrics.magicLinkVerificationFailuresTotal.inc();
        return sendErrorResponse(
            res,
            HttpStatus.MISC_ERROR_STATUS,
            'Verification failed',
            'Magic link verification error',
            { token_id, error: error.message, stack: error.stack }
        );
    }
}

/**
 * Refresh access token
 */
async function refreshToken(req, res) {
    try {
        console.log('Refresh token request received');
        const { refreshToken } = req.body;
        
        if (!refreshToken) {
            return sendErrorResponse(
                res,
                HttpStatus.BAD_REQUEST_STATUS,
                'Invalid request',
                'Refresh token request failed: Missing refresh token',
                { refreshToken: !!refreshToken }
            );
        }

        // This will verify, rotate, and generate new tokens
        const tokens = await tokenService.rotateRefreshToken(refreshToken);

        // Get user info from the old token
        const decoded = await tokenService.verifyRefreshToken(tokens.refreshToken, true);
        
        // Store new refresh token
        const { hash: refreshTokenHash, salt: refreshTokenSalt } = tokenService.hashToken(tokens.refreshToken);
        await db.query(
            'INSERT INTO refresh_tokens (user_id, token_hash, token_salt, expires_at) VALUES ($1, $2, $3, NOW() + INTERVAL \'7 days\')',
            [decoded.sub, refreshTokenHash, refreshTokenSalt]
        );

        return res.status(HttpStatus.SUCCESS_STATUS).json({
            ...tokens,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        if (error.message === 'Invalid refresh token' || error.message === 'Token is blacklisted') {
            return sendErrorResponse(
                res,
                HttpStatus.UNAUTHORIZED_STATUS,
                'Invalid refresh token',
                'Token refresh failed: Invalid or blacklisted token',
                { error: error.message }
            );
        }
        
        return sendErrorResponse(
            res,
            HttpStatus.MISC_ERROR_STATUS,
            'Failed to refresh token',
            'Token refresh error',
            { error: error.message, stack: error.stack }
        );
    }
}

/**
 * Logout user
 */
async function logoutUser(req, res) {
    try {
        const accessToken = req.headers.authorization?.split(' ')[1];
        const { refreshToken } = req.body;

        // Invalidate tokens
        await tokenService.invalidateTokens(accessToken, refreshToken);

        return res.status(HttpStatus.SUCCESS_STATUS).json({ 
            message: 'Logged out successfully',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        return sendErrorResponse(
            res,
            HttpStatus.MISC_ERROR_STATUS,
            'Logout failed',
            'Logout error',
            { error: error.message, stack: error.stack }
        );
    }
}

module.exports = {
    registerUser,
    requestMagicLink,
    verifyMagicLink,
    refreshToken,
    logoutUser
};
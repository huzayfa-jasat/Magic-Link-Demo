const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { tokenBlacklist } = require('../config/redis');

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || crypto.randomBytes(32).toString('hex');
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || crypto.randomBytes(32).toString('hex');
const HMAC_SECRET = process.env.HMAC_SECRET || crypto.randomBytes(32).toString('hex');

const TOKEN_CONFIG = {
    access: {
        expiresIn: '15m',
        secret: JWT_ACCESS_SECRET
    },
    refresh: {
        expiresIn: '7d',
        secret: JWT_REFRESH_SECRET
    }
};

class TokenService {
    // Generate tokens for a user
    async generateTokenPair(user) {
        const accessToken = jwt.sign(
            { sub: user.id, email: user.email },
            TOKEN_CONFIG.access.secret,
            { expiresIn: TOKEN_CONFIG.access.expiresIn }
        );

        const refreshToken = jwt.sign(
            { sub: user.id, type: 'refresh' },
            TOKEN_CONFIG.refresh.secret,
            { expiresIn: TOKEN_CONFIG.refresh.expiresIn }
        );

        return { accessToken, refreshToken };
    }

    // Generate a magic link token
    async generateMagicToken() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Generate a nonce for replay protection
    generateNonce() {
        return crypto.randomBytes(16).toString('hex');
    }

    // Generate device fingerprint from request
    generateDeviceFingerprint(req) {
        const components = [
            req.headers['user-agent'] || '',
            req.headers['accept-language'] || '',
            req.headers['accept-encoding'] || '',
            req.ip || ''
        ];
        const fingerprint = crypto
            .createHash('sha256')
            .update(components.join('|'))
            .digest('hex');
        return fingerprint;
    }

    // Sign a URL with HMAC
    signUrl(url) {
        const hmac = crypto.createHmac('sha256', HMAC_SECRET);
        hmac.update(url);
        const signature = hmac.digest('hex');
        return `${url}&signature=${signature}`;
    }

    // Verify HMAC signature
    verifySignature(url, signature) {
        const hmac = crypto.createHmac('sha256', HMAC_SECRET);
        hmac.update(url);
        const expectedSignature = hmac.digest('hex');
        return crypto.timingSafeEqual(
            Buffer.from(signature, 'hex'),
            Buffer.from(expectedSignature, 'hex')
        );
    }

    // Generate a random salt
    generateSalt() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Hash a token with salt for storage
    hashToken(token, salt = null) {
        if (!salt) {
            salt = this.generateSalt();
        }
        const hash = crypto
            .createHash('sha256')
            .update(token + salt)
            .digest('hex');
        return { hash, salt };
    }

    // Verify a token against its hash and salt
    verifyTokenHash(token, hash, salt) {
        const computedHash = crypto
            .createHash('sha256')
            .update(token + salt)
            .digest('hex');
        return computedHash === hash;
    }

    // Verify an access token
    async verifyAccessToken(token) {
        try {
            // Check if token is blacklisted
            const isBlacklisted = await tokenBlacklist.isBlacklisted(token);
            if (isBlacklisted) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log('Token is blacklisted');
                }
                throw new Error('Token is blacklisted');
            }

            return jwt.verify(token, TOKEN_CONFIG.access.secret);
        } catch (error) {
            console.error('Access token verification error:', error.message);
            throw new Error('Invalid access token');
        }
    }

    // Verify a refresh token
    async verifyRefreshToken(token, skipBlacklistCheck = false) {
        try {
            if (process.env.NODE_ENV !== 'production') {
                console.log('Verifying refresh token...');
            }
            
            // First verify the JWT signature and expiration
            const decoded = jwt.verify(token, TOKEN_CONFIG.refresh.secret);
            if (process.env.NODE_ENV !== 'production') {
                console.log('JWT verification passed');
            }

            if (decoded.type !== 'refresh') {
                console.error('Invalid token type:', decoded.type);
                throw new Error('Invalid token type');
            }

            // Check if token is blacklisted (unless explicitly skipped)
            if (!skipBlacklistCheck) {
                const isBlacklisted = await tokenBlacklist.isBlacklisted(token);
                if (isBlacklisted) {
                    if (process.env.NODE_ENV !== 'production') {
                        console.error('Token is blacklisted');
                    }
                    throw new Error('Token is blacklisted');
                }
            }

            if (process.env.NODE_ENV !== 'production') {
                console.log('Refresh token verification successful');
            }
            return decoded;
        } catch (error) {
            console.error('Refresh token verification error:', error.message);
            throw new Error('Invalid refresh token');
        }
    }

    // Invalidate tokens
    async invalidateTokens(accessToken, refreshToken) {
        try {
            if (accessToken) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log('Blacklisting access token');
                }
                await tokenBlacklist.add(accessToken, 'logged_out', 900); // 15 minutes
            }
            if (refreshToken) {
                if (process.env.NODE_ENV !== 'production') {
                    console.log('Blacklisting refresh token');
                }
                await tokenBlacklist.add(refreshToken, 'logged_out', 604800); // 7 days
            }
        } catch (error) {
            console.error('Error invalidating tokens:', error);
            throw error;
        }
    }

    // Rotate refresh token
    async rotateRefreshToken(oldToken) {
        try {
            if (process.env.NODE_ENV !== 'production') {
                console.log('Starting refresh token rotation');
            }
            
            // Verify the old token first (including blacklist check)
            const decoded = await this.verifyRefreshToken(oldToken);
            if (process.env.NODE_ENV !== 'production') {
                console.log('Old token verified');
            }
            
            // Generate new tokens before blacklisting the old one
            const newTokens = await this.generateTokenPair({ id: decoded.sub });
            if (process.env.NODE_ENV !== 'production') {
                console.log('New tokens generated');
            }

            // Blacklist the old token
            await this.invalidateTokens(null, oldToken);
            if (process.env.NODE_ENV !== 'production') {
                console.log('Old token invalidated');
            }
            
            return newTokens;
        } catch (error) {
            console.error('Error rotating refresh token:', error);
            throw error;
        }
    }
}

module.exports = new TokenService();
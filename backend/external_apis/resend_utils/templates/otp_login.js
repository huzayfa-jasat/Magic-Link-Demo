function resend_template_OtpLogin(otp_link) {
    return `
    <!DOCTYPE html>
    <html>
    <head>
        <title>Magic Link Sign In</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
            }
            .container {
                background-color: #ffffff;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                padding: 30px;
                margin-top: 20px;
            }
            .header {
                text-align: center;
                margin-bottom: 30px;
            }
            .title {
                color: #1a73e8;
                font-size: 24px;
                font-weight: bold;
                margin: 0;
            }
            .button {
                display: inline-block;
                background-color: #1a73e8;
                color: white;
                text-decoration: none;
                padding: 12px 24px;
                border-radius: 4px;
                font-weight: 500;
                margin: 20px 0;
                text-align: center;
            }
            .button:hover {
                background-color: #1557b0;
            }
            .footer {
                text-align: center;
                font-size: 14px;
                color: #666;
                margin-top: 30px;
            }
            .note {
                font-size: 14px;
                color: #666;
                margin-top: 20px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1 class="title">Magic Link Sign In</h1>
            </div>
            
            <p>Hello!</p>
            
            <p>Click the button below to sign in to your account. This link will expire in 15 minutes for security.</p>
            
            <div style="text-align: center;">
                <a href="${otp_link}" class="button">Sign In to Your Account</a>
            </div>
            
            <p class="note">If you didn't request this sign-in link, you can safely ignore this email.</p>
            
            <div class="footer">
                <p>This is an automated message, please do not reply to this email.</p>
            </div>
        </div>
    </body>
    </html>
    `;
}

module.exports = {
    resend_template_OtpLogin,
};
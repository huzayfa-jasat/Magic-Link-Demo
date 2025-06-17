// testEmail.js
require('dotenv').config(); // Load .env

const { sendLowCreditsEmail } = require('./backend/external_apis/resend.js');

(async () => {
  try {
    // User 3: huzayfa@email.com, 0 credits
    const response = await sendLowCreditsEmail('huzayfajasat@gmail.com', 0);
    console.log('Low credits email sent:', response);
  } catch (err) {
    console.error('Error:', err);
  }
})();

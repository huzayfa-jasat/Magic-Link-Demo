const API_URL = 'http://localhost:11793/api/auth';

// Check if we're on a verification page (has token in URL)
const urlParams = new URLSearchParams(window.location.search);
const token = urlParams.get('token');
const token_id = urlParams.get('token_id');
const signature = urlParams.get('signature');

// Elements
const authCard = document.getElementById('authCard');
const form = document.getElementById('authForm');
const emailInput = document.getElementById('email');
const passwordGroup = document.getElementById('passwordGroup');
const passwordInput = document.getElementById('password');
const submitButton = document.getElementById('submitButton');
const btnText = document.getElementById('btnText');
const spinner = document.getElementById('spinner');
const title = document.getElementById('title');
const subtitle = document.getElementById('subtitle');
const toggleMode = document.getElementById('toggleMode');
const messageBox = document.getElementById('messageBox');

// Check if already logged in
const accessToken = localStorage.getItem('accessToken');
const refreshToken = localStorage.getItem('refreshToken');

if (token) {
    // We're verifying a token
    showVerificationUI();
    verifyToken(token);
} else if (accessToken && refreshToken && !window.location.pathname.includes('home.html')) {
    // Redirect to home if logged in and not already on home page
    window.location.href = '/home.html';
} else if (!accessToken && !refreshToken && window.location.pathname.includes('home.html')) {
    // Redirect to login if not logged in and trying to access home
    window.location.href = '/index.html';
} else {
    // Normal auth page setup
    setupAuthForm();
}

function showVerificationUI() {
    authCard.innerHTML = `
        <div class="auth-header">
            <h1>Verifying Magic Link...</h1>
        </div>
        <div id="verifyStatus" class="message">
            <div class="spinner"></div>
            <p>Please wait while we log you in...</p>
        </div>
    `;
}

async function verifyToken(token) {
    try {
        // Prepare verification data with new HMAC-signed format
        // Use the current URL but remove the signature parameter
        const currentUrl = window.location.href;
        const urlWithoutSignature = currentUrl.split('&signature=')[0];
        
        // Debug logging
        console.log('Current URL:', currentUrl);
        console.log('URL without signature:', urlWithoutSignature);
        console.log('Token ID:', token_id);
        console.log('Token:', token);
        console.log('Signature:', signature);
        
        const verificationData = { 
            token,
            token_id,
            signature,
            url: urlWithoutSignature
        };

        const response = await fetch(`${API_URL}/magic-link/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(verificationData)
        });

        const data = await response.json();

        if (response.ok) {
            // Store tokens
            localStorage.setItem('accessToken', data.accessToken);
            localStorage.setItem('refreshToken', data.refreshToken);

            // Show success message briefly
            document.getElementById('verifyStatus').innerHTML = `
                <div class="message success">
                    <p>✅ Login successful!</p>
                    <p>Redirecting to dashboard...</p>
                </div>
            `;

            // Redirect to homepage
            setTimeout(() => {
                window.location.href = '/home.html';
            }, 1000);
        } else {
            throw new Error(data.error || 'Verification failed');
        }
    } catch (error) {
        console.error('Verification error:', error);
        
        // Clear any existing tokens on verification failure
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        
        document.getElementById('verifyStatus').innerHTML = `
            <div class="message error">
                <p>❌ ${error.message || 'Invalid or expired link'}</p>
                <button onclick="window.location.href='/'" class="submit-btn">
                    Back to Login
                </button>
            </div>
        `;
    }
}

function setupAuthForm() {
    let isRegisterMode = false;

    // Toggle between register and login modes
    toggleMode.addEventListener('click', () => {
        isRegisterMode = !isRegisterMode;
        
        // Update UI
        title.textContent = isRegisterMode ? 'Create an account' : 'Welcome back!';
        toggleMode.textContent = isRegisterMode ? 'Login' : 'Create one';
        btnText.textContent = isRegisterMode ? 'Register' : 'Send Magic Link';
        subtitle.innerHTML = isRegisterMode 
            ? 'Already have an account? <span id="toggleMode" class="link">Login</span>'
            : 'Don\'t have an account? <span id="toggleMode" class="link">Create one</span>';
        
        // Show/hide password field with animation
        passwordGroup.style.display = isRegisterMode ? 'flex' : 'none';
        clearMessage();
    });

    // Handle form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearMessage();
        
        const email = emailInput.value;
        const password = passwordInput.value;

        // Validate email
        if (!email.match(/^\S+@\S+\.\S+$/)) {
            showMessage('Please enter a valid email address', 'error');
            return;
        }

        // Validate password in register mode
        if (isRegisterMode && password.length < 6) {
            showMessage('Password must be at least 6 characters', 'error');
            return;
        }

        setLoading(true);

        try {
            if (isRegisterMode) {
                // Register
                await fetch(`${API_URL}/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                showMessage('Registration successful! You can now request a magic link.', 'success');
                isRegisterMode = false;
                toggleMode.click(); // Switch to login mode
            } else {
                // Request magic link
                await fetch(`${API_URL}/magic-link/request`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                showMessage('If an account exists, a magic link has been sent to your email.', 'success');
            }
            
            form.reset();
        } catch (error) {
            console.error('Error:', error);
            showMessage('An error occurred. Please try again.', 'error');
        } finally {
            setLoading(false);
        }
    });
}

// Helper functions
function showMessage(text, type) {
    messageBox.className = `message ${type}`;
    messageBox.textContent = text;
    messageBox.style.display = 'block';
}

function clearMessage() {
    messageBox.style.display = 'none';
    messageBox.textContent = '';
}

function setLoading(isLoading) {
    submitButton.disabled = isLoading;
    spinner.style.display = isLoading ? 'block' : 'none';
    btnText.style.display = isLoading ? 'none' : 'block';
}
// Dependencies
import { useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";

// API Imports
import { verifyOtpCode } from "../../api/auth.js";

// UI Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle.jsx";

// Functional Component
export default function LoginOTP() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const email = searchParams.get('em');
    const otp = searchParams.get('otp');

    if (!email || !otp) {
      navigate('/login');
      return;
    }

    const verifyOTP = async () => {
      try {
        const resp = await verifyOtpCode(decodeURIComponent(email), decodeURIComponent(otp));
        if (resp.status === 200) {
          window.location.reload();
        } else {
          navigate('/login');
        }
      } catch (error) {
        console.error("OTP verification failed:", error);
        navigate('/login');
      }
    };

    verifyOTP();
  }, [searchParams, navigate]);

  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      height: '100vh',
      flexDirection: 'column',
      gap: '20px'
    }}>
      <LoadingCircle />
      <p>Verifying your login...</p>
    </div>
  );
}
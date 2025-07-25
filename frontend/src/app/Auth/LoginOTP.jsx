// Dependencies
import { useState, useEffect } from "react";
import { NavLink, useSearchParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";

// API Imports
import { sendOtpCode, verifyOtpCode } from "../../api/auth.js";

// Style Imports
import s from "./styles.module.css";

// Icon Imports
import {
  OMNI_LOGO, BACK_ICON,
  COMPLETE_CHECK_ICON, FAILED_ICON,
} from "../../assets/icons";

// Functional Component
export default function LoginOTP() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [isValidateFlow, setIsValidateFlow] = useState(false);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
  } = useForm();

  useEffect(() => {
    const urlEmail = searchParams.get('em');
    const urlOtp = searchParams.get('otp');
    
    if (urlEmail && urlOtp) {
      setIsValidateFlow(true);
      setEmail(decodeURIComponent(urlEmail));
      setOtp(decodeURIComponent(urlOtp));
      
      // Auto-validate when URL params are present
      const verifyOTP = async () => {
        try {
          const resp = await verifyOtpCode(decodeURIComponent(urlEmail), decodeURIComponent(urlOtp));
          if (resp.status === 200) {
            window.location.reload();
          } else {
            navigate('/login');
          }
        } catch (error) {
          navigate('/login');
        }
      };
      
      verifyOTP();
    }
  }, [searchParams, navigate]);

  // Request flow - send OTP email
  async function onRequestSubmit(data) {
    try {
      const resp = await sendOtpCode(data.email);
      if (resp.status !== 200) {
        setMessage("Something went wrong. Please try again.");
        setIsError(true);
      } else {
        setMessage("Check your email for your one-time password link!");
        setIsError(false);
        setIsSuccess(true);
      }
    } catch (error) {
      setMessage("Something went wrong. Please try again.");
      setIsError(true);
    }
  }

  // Return layout - if validate flow, show loading
  if (isValidateFlow) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        flexDirection: 'column',
        gap: '20px'
      }}>
        <div>Verifying your login...</div>
      </div>
    );
  }

  // Return layout - request flow
  return (
    <div className={s.container}>
      <form onSubmit={handleSubmit(onRequestSubmit)} className={s.form}>
        <NavLink to="/login" className={s.backToLogin}>
          {BACK_ICON}
          Back to Login
        </NavLink>
        <div className={s.logo}>
          {OMNI_LOGO}
        </div>
        
        <h1 className={s.title}>Sign in with a one-time password</h1>
        <h2 className={s.formSubtitle}>
          We'll email you a secure link to sign in instantly.
        </h2>
        <div className={s.section}>
          <h3 className={s.subtitle}>Email</h3>
          <input {...register("email", { required: true })} type="email" placeholder="you@omniverifier.com" disabled={isSuccess} />
        </div>
        
        {(message) && (
          <div className={`${s.section} ${s.txMessage} ${(isError) ? s.txError : s.txSuccess}`}>
            {(isError) ? FAILED_ICON : COMPLETE_CHECK_ICON}
            <p>{message}</p>
          </div>
        )}
        
        {!isSuccess && (
          <div className={s.buttons}>
            <button className={s.button} type="submit">
              Email me a One-Time Password
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
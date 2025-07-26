// Dependencies
import { useState, useEffect } from "react";
import { NavLink, useSearchParams, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";

// API Imports
import { sendOtpCode, verifyOtpCode } from "../../api/auth.js";

// Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle.jsx";

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

  // States
  const [isValidateFlow, setIsValidateFlow] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Form controls
  const {
    register,
    handleSubmit,
  } = useForm();
      
  // Auto-validate when URL params are present
  async function verifyOTP(email, code) {
    try {
      const resp = await verifyOtpCode(email, code);
      if (resp.status === 200) window.location.reload();
      else navigate('/login', { replace: true });
    } catch (error) {
      navigate('/login', { replace: true });
    }
  }
  useEffect(() => {
    const urlEmail = searchParams.get('email');
    const urlOtp = searchParams.get('code');
    if (urlEmail && urlOtp) {
      setIsValidateFlow(true);
      verifyOTP(decodeURIComponent(urlEmail), decodeURIComponent(urlOtp));
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

  // Render - Validation Flow
  if (isValidateFlow) return <LoadingCircle />

  // Render - Request Flow
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
        
        <h1 className={s.title}>One-Time Password</h1>
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
              Continue
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
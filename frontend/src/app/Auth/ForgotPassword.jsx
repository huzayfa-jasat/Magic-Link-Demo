// Dependencies
import { useState, useEffect } from "react";
import { NavLink, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";

// API Imports
import { sendForgotPasswordEmail, validateForgotPasswordReset } from "../../api/auth.js";

// Style Imports
import s from "./styles.module.css";

// Icon Imports
import {
  OMNI_LOGO, BACK_ICON,
  COMPLETE_CHECK_ICON, FAILED_ICON,
} from "../../assets/icons";

// Functional Component
export default function ForgotPassword() {
  const [searchParams] = useSearchParams();
  const [isUpdateFlow, setIsUpdateFlow] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
  } = useForm();

  useEffect(() => {
    const urlEmail = searchParams.get('email');
    const urlCode = searchParams.get('code');
    
    if (urlEmail && urlCode) {
      setIsUpdateFlow(true);
      setEmail(decodeURIComponent(urlEmail));
      setCode(decodeURIComponent(urlCode));
    }
  }, [searchParams]);

  // Request flow - send password reset email
  async function onRequestSubmit(data) {
    try {
      const resp = await sendForgotPasswordEmail(data.email);
      if (resp.status !== 200) {
        setMessage("Something went wrong. Please try again.");
        setIsError(true);
      } else {
        setMessage("Check your email for password reset instructions!");
        setIsError(false);
        setIsSuccess(true);
      }
    } catch (error) {
      setMessage("Something went wrong. Please try again.");
      setIsError(true);
    }
  }

  // Update flow - validate code and update password
  async function onUpdateSubmit(data) {
    if (data.newPassword !== data.confirmPassword) {
      setMessage("Passwords do not match.");
      setIsError(true);
      return;
    }

    try {
      const resp = await validateForgotPasswordReset(email, code, data.newPassword);
      if (resp.status !== 200) {
        setMessage("Invalid or expired password reset code. Please try again.");
        setIsError(true);
      } else {
        setMessage("Password successfully updated! You can now log in with your new password.");
        setIsError(false);
        setIsSuccess(true);
      }
    } catch (error) {
      setMessage("Invalid or expired password reset code. Please try again.");
      setIsError(true);
    }
  }

  // Return layout
  return (
    <div className={s.container}>
      <form onSubmit={handleSubmit(isUpdateFlow ? onUpdateSubmit : onRequestSubmit)} className={s.form}>
        <NavLink to="/login" className={s.backToLogin}>
          {BACK_ICON}
          Back to Login
        </NavLink>
        <div className={s.logo}>
          {OMNI_LOGO}
        </div>
        
        {isUpdateFlow ? (
          <>
            <h1 className={s.title}>Reset Your Password</h1>
            <h2 className={s.formSubtitle}>
              Enter your new password below.
            </h2>
            <div className={s.section}>
              <h3 className={s.subtitle}>New Password</h3>
              <input {...register("newPassword", { required: true })} type="password" placeholder="Enter new password" />
            </div>
            <div className={s.section}>
              <h3 className={s.subtitle}>Confirm New Password</h3>
              <input {...register("confirmPassword", { required: true })} type="password" placeholder="Confirm new password" />
            </div>
            <div className={s.buttons}>
              <button className={s.button} type="submit" disabled={isSuccess}>
                Update Password
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className={s.title}>Forgot your password?</h1>
            <h2 className={s.formSubtitle}>
              We'll send you a link to reset your password.
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
                  Send Reset Link
                </button>
              </div>
            )}
          </>
        )}
      </form>
    </div>
  );
}

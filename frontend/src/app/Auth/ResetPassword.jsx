// Dependencies
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";

// API Imports
import { validateResetPassword } from "../../api/auth.js";

// Style Imports
import s from "./styles.module.css";

// Icon Imports
import {
  OMNI_LOGO,
  COMPLETE_CHECK_ICON, FAILED_ICON,
} from "../../assets/icons";

// Functional Component
export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const [code, setCode] = useState("");
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
  } = useForm();

  useEffect(() => {
    const urlCode = searchParams.get('code');
    
    if (urlCode) {
      setCode(decodeURIComponent(urlCode));
    }
  }, [searchParams]);

  // Update password
  async function onUpdateSubmit(data) {
    if (data.newPassword !== data.confirmPassword) {
      setMessage("Passwords do not match.");
      setIsError(true);
      return;
    }

    try {
      const resp = await validateResetPassword(code, data.newPassword);
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
      <form onSubmit={handleSubmit(onUpdateSubmit)} className={s.form}>
        <div className={s.logo}>
          {OMNI_LOGO}
        </div>
        
        <h1 className={s.title}>Reset Password</h1>
        <h2 className={s.formSubtitle}>
          Enter your new password below.
        </h2>
        
        {(message) && (
          <div className={`${s.section} ${s.txMessage} ${(isError) ? s.txError : s.txSuccess}`}>
            {(isError) ? FAILED_ICON : COMPLETE_CHECK_ICON}
            <p>{message}</p>
          </div>
        )}
        
        {!isSuccess && (
          <>
            <div className={s.section}>
              <h3 className={s.subtitle}>New Password</h3>
              <input {...register("newPassword", { required: true })} type="password" placeholder="Enter new password" />
            </div>
            <div className={s.section}>
              <h3 className={s.subtitle}>Confirm New Password</h3>
              <input {...register("confirmPassword", { required: true })} type="password" placeholder="Confirm new password" />
            </div>
            <div className={s.buttons}>
              <button className={s.button} type="submit">
                Update Password
              </button>
            </div>
          </>
        )}
        
        {isSuccess && (
          <div className={s.buttons}>
            <a href="/validate" className={s.button}>
              Continue
            </a>
          </div>
        )}
      </form>
    </div>
  );
}
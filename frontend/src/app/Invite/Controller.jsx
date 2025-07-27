// Dependencies
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";

// Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle";

// Style Imports
import s from "./styles.module.css";

// Icon Imports
import {
  OMNI_LOGO, BACK_ICON,
  COMPLETE_CHECK_ICON, FAILED_ICON,
} from "../../assets/icons";

// Functional Component
export default function InviteCodeController() {
  const [searchParams] = useSearchParams();

  // States
  const [isCodeFlow, setIsCodeFlow] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Form controls
  const {
    register,
    handleSubmit,
  } = useForm();
      
  // Auto-process when URL code parameter is present
  useEffect(() => {
    const urlCode = searchParams.get('code');
    if (urlCode) {
      setIsCodeFlow(true);
      console.log('Invite code from URL:', urlCode);
      // TODO: Make API call to process the invite code
      setMessage("Invite code received! (Check console for details)");
      setIsSuccess(true);
    }
  }, [searchParams]);

  // Manual code submission flow
  async function onCodeSubmit(data) {
    try {
      console.log('Manual invite code:', data.code);
      // TODO: Make API call to process the invite code
      setMessage("Invite code submitted! (Check console for details)");
      setIsError(false);
      setIsSuccess(true);
    } catch (error) {
      setMessage("Something went wrong. Please try again.");
      setIsError(true);
    }
  }

  // Render
  return (
    <div className={s.container}>
      <form onSubmit={handleSubmit(onCodeSubmit)} className={s.form}>
        <div className={s.logo}>
          {OMNI_LOGO}
        </div>
        
        <h1 className={s.title}>Invite Code</h1>
        
        {!isCodeFlow && (
          <>
            <h2 className={s.formSubtitle}>
              Enter your invite code to get rewarded.
            </h2>
            <div className={s.section}>
              <h3 className={s.subtitle}>Invite Code</h3>
              <input 
                {...register("code", { required: true })} 
                type="text" 
                placeholder="Enter your invite code" 
                disabled={isSuccess} 
              />
            </div>
          </>
        )}
        
        {isCodeFlow && <LoadingCircle />}
        
        {(message) && (
          <div className={`${s.section} ${s.txMessage} ${(isError) ? s.txError : s.txSuccess}`}>
            {(isError) ? FAILED_ICON : COMPLETE_CHECK_ICON}
            <p>{message}</p>
          </div>
        )}
        
        {!isSuccess && !isCodeFlow && (
          <div className={s.buttons}>
            <button className={s.button} type="submit">
              Submit Code
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
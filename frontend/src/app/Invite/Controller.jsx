// Dependencies
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";

// API Imports
import { redeemReferralInviteCode } from "../../api/credits";

// Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle";

// Style Imports
import s from "./styles.module.css";

// Icon Imports
import {
  OMNI_LOGO,
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
      processInviteCode(urlCode);
    }
  }, [searchParams]);

  // Process invite code
  async function processInviteCode(code) {
    try {
      const response = await redeemReferralInviteCode(code);
      if (response.status === 200) {
        const data = response.data;
        if (data.status === 'approved') {
          setMessage("25,000 credits have been added to your account!");
        } else {
          let msg = "Your referral has been recorded. ";
          if (!data.referrer_eligible && !data.referred_eligible) {
            msg += "You'll both receive 25,000 credits once each of you has purchased at least 100,000 credits.";
          } else if (!data.referrer_eligible) {
            msg += "You'll both receive 25,000 credits once the referrer has purchased at least 100,000 credits.";
          } else {
            msg += "You'll both receive 25,000 credits once you've purchased at least 100,000 credits.";
          }
          setMessage(msg);
        }
        setIsError(false);
        setIsSuccess(true);
      } else {
        setMessage("That referral code is invalid or expired.");
        setIsError(true);
      }
    } catch (error) {
      setMessage("Something went wrong. Please try again.");
      setIsError(true);
    } finally {
      setIsCodeFlow(false);
    }
  }

  // Manual code submission flow
  async function onCodeSubmit(data) {
    processInviteCode(data.code);
  }

  // Render
  return (
    <div className={s.container}>
      <form onSubmit={handleSubmit(onCodeSubmit)} className={s.form}>
        <div className={s.logo}>
          {OMNI_LOGO}
        </div>
        
        {/* <h1 className={s.title}>Accept Invite</h1> */}
        
        {!isCodeFlow && (
          <>
            {/* <h2 className={s.formSubtitle}>
              Enter your invite code to get rewarded.
            </h2> */}
            <div className={s.section}>
              <h3 className={s.subtitle}>Referral Code</h3>
              <input 
                {...register("code", { required: true })} 
                type="text" 
                placeholder="Enter your referral code" 
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
              Continue
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
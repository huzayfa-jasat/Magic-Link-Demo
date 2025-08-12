// Dependencies
import { useContext, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";

// API Imports
import { loginUser, registerUser } from "../../api/auth.js";

// Context Imports
import { ErrorContext } from "../../ui/Context/ErrorContext";

// Style Imports
import s from "./styles.module.css";

// Icon Imports
import { OMNI_LOGO } from "../../assets/icons/omni_logo";

// Constants
const TOS_URL = "https://www.omniverifier.com/terms-of-service";
const PP_URL = "https://www.omniverifier.com/privacy-policy";

// Functional Component
export default function Register() {
  const navigate = useNavigate();
  const errorContext = useContext(ErrorContext);

  // States
  const [didAgree, setDidAgree] = useState(false);

  // Form Data
  const {
    register,
    handleSubmit,
  } = useForm();

  // Registration wrapper
  async function onSubmit(data) {
    if (data.email === "" || data.password === "" /*|| data.invite_code === ""*/ || !didAgree) return;
    try {
      await registerUser(data.email, data.password /*, "Name", data.invite_code*/);
      const loginSuccess = await loginUser(data.email, data.password);
      if (!loginSuccess) navigate("/login", { replace: true });
      else window.location.reload();
    } catch (error) {
      errorContext.showError();
    }
  }

  // Return layout
  return (
    <div className={s.container}>
      <form onSubmit={handleSubmit(onSubmit)} className={s.form}>
        <div className={s.logo}>
          {OMNI_LOGO}
        </div>
        <h1 className={s.title}>Join OmniVerifier</h1>
        <h2 className={s.betterThanSubtitle}>
          <span>
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />
            </svg>
            Better than
          </span>
          &nbsp;&nbsp;MillionVerifier, NeverBounce and everyone else.
        </h2>
        <div className={s.section}>
          <h3 className={s.subtitle}>Email</h3>
          <input {...register("email")} type="email" placeholder="you@omniverifier.com" />
        </div>
        <div className={s.section}>
          <h3 className={s.subtitle}>Password</h3>
          <input {...register("password")} type="password" placeholder="••••••••" />
        </div>
        {/* <div className={`${s.section} ${s.nmb}`}>
          <h3 className={s.subtitle}>Early Access Code</h3>
          <input {...register("invite_code")} type="text" placeholder="e.g. OMNI2025" />
        </div> */}
        <div className={s.agreeSection} onClick={()=>{setDidAgree((prev)=>(!prev))}}>
          <button className={`${s.agreeCheckbox} ${(didAgree) ? s.active : s.inactive}`}>
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </button>
          <p>I agree to the <a href={TOS_URL} target="_blank" rel="noopener noreferrer">Terms of Service</a> and <a href={PP_URL} target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>
        </div>
        <div className={s.buttons}>
          <button className={s.button} type="submit">
            Sign Up
          </button>
        </div>
        <NavLink to="/login" className={s.register}>
          Already have an account?&nbsp;<span>Sign In Now</span>
        </NavLink>
      </form>
    </div>
  );
}

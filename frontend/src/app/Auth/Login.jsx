// Dependencies
import { NavLink } from "react-router-dom";
import { useForm } from "react-hook-form";

// API Imports
import { loginUser } from "../../api/auth.js";

// Style Imports
import s from "./styles.module.css";

// Icon Imports
import { OMNI_LOGO } from "../../assets/icons/omni_logo";

// Functional Component
export default function Login() {
  // States
  const {
    register,
    handleSubmit,
  } = useForm();

  // Login wrapper
  async function onSubmit(data) {
    try {
      if (await loginUser(data.email, data.password)) window.location.reload();
      else {
        console.error("Login failed");
      }
    } catch (error) {
      console.log(error.message);
    }
  }

  // Return layout
  return (
    <div className={s.container}>
      <form onSubmit={handleSubmit(onSubmit)} className={s.form}>
        <div className={s.logo}>
          {OMNI_LOGO}
        </div>
        <h1 className={s.title}>Welcome back!</h1>
        <h2 className={s.formSubtitle}>Sign back in to your OmniVerifier account.</h2>
        <NavLink to="/register" className={s.registerv2}>
          <p>
            Don't have an account yet?
            <br/><span>Sign Up Now</span>
          </p>
          <div>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24">
              <path stroke="var(--white)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="m9 19 7-7-7-7"/>
            </svg>
          </div>
        </NavLink>
        <div className={s.section}>
          <h3 className={s.subtitle}>Email</h3>
          <input {...register("email")} type="text" placeholder="you@omniverifier.com" />
        </div>
        <div className={`${s.section} ${s.nmb}`}>
          <div className={s.top}>
            <h3 className={s.subtitle}>Password</h3>
            <NavLink to="/forgot-password" className={s.forgot}>Forgot?</NavLink>
          </div>
          <input {...register("password")} type="password" placeholder="••••••••" />
        </div>
        <div className={s.buttons}>
          <button className={s.button} type="submit">
            Sign In
          </button>
          <div className={s.or}>
            <span>or</span>
          </div>
          <button className={`${s.button} ${s.otp}`} type="button">
            Email me a One-Time Password
          </button>
        </div>
        {/* <NavLink to="/register" className={s.register}>Don't have an account? <span>Sign Up Now</span></NavLink> */}
      </form>
    </div>
  );
}

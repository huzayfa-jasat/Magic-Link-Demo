// Dependencies
import { NavLink } from "react-router-dom";
import { useForm } from "react-hook-form";

// API Imports
import { sendForgotPasswordEmail } from "../../api/auth.js";

// Style Imports
import s from "./styles.module.css";

// Icon Imports
import { OMNI_LOGO, BACK_ICON } from "../../assets/icons";

// Functional Component
export default function ForgotPassword() {
  const {
    register,
    handleSubmit,
  } = useForm();

  // Registration wrapper
  async function onSubmit(data) {
    try {
      const resp = await sendForgotPasswordEmail(data.email);
      if (resp.status !== 200) console.error("Failed to send forgot password email");
      else {
        // TODO: Success message
      }
    } catch (error) {
      console.log(error.message);
    }
  }

  // Return layout
  return (
    <div className={s.container}>
      <form onSubmit={handleSubmit(onSubmit)} className={s.form}>
        <NavLink to="/login" className={s.backToLogin}>
          {BACK_ICON}
          Back to Login
        </NavLink>
        <div className={s.logo}>
          {OMNI_LOGO}
        </div>
        <h1 className={s.title}>Forgot your password?</h1>
        <h2 className={s.formSubtitle}>
          We'll send you a link to reset your password.
        </h2>
        <div className={s.section}>
          <h3 className={s.subtitle}>Email</h3>
          <input {...register("email")} type="email" placeholder="you@omniverifier.com" />
        </div>
        <div className={s.buttons}>
          <button className={s.button} type="submit">
            Send Reset Link
          </button>
        </div>
      </form>
    </div>
  );
}

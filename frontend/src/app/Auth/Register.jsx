// Dependencies
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";

// API Imports
import { loginUser, registerUser } from "../../api/auth.js";

// Style Imports
import "./styles.css";

// Functional Component
export default function Register() {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
  } = useForm();

  // Registration wrapper
  async function onSubmit(data) {
    try {
      await registerUser(data.email, data.password, "Name", null);
      const loginSuccess = await loginUser(data.email, data.password);
      if (loginSuccess) navigate("/login", { replace: true });
      else window.location.reload();
    } catch (error) {
      console.log(error.message);
    }
  }

  // Return layout
  return (
    <div className="auth-cont">
      <form onSubmit={handleSubmit(onSubmit)} className="form">
        <label className="label">
          <h3 className="subtitle">Email</h3>
          <input {...register("email")} type="email" />
        </label>
        <label className="label">
          <h3 className="subtitle">Password</h3>
          <input {...register("password")} type="password" />
        </label>
       <button className="button" type="submit">
          Sign Up
        </ button>
      </form>
    </div>
  );
}

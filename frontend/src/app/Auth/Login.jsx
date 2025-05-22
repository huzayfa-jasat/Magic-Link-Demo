// Dependencies
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";

// API Imports
import { loginUser } from "../../api/auth.js";

// Style Imports
import "./styles.css";

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
    <div className="auth-cont">
      <form onSubmit={handleSubmit(onSubmit)} className="loginForm">
        <h1 className="title">Sign In</h1>
        <label className="label">
          <h3 className="subtitle">Email</h3>
          <input {...register("email")} type="text" />
        </label>
        <label className="label">
          <h3 className="subtitle">Password</h3>
          <input {...register("password")} type="password" />
        </label>
        <button className="button" type="submit">
          Sign In
        </button>
      </form>
    </div>
  );
}

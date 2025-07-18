// Dependencies
import { useState, useEffect } from "react";

// Context Imports
import { useUsersContext } from "../../context/useUsersContext.js";

// Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle.jsx";

// API Imports
import {
  getProfileDetails,
  updateProfileEmail,
  updateProfileName,
  updateProfileLogo
} from "../../api/settings.js";
import { logoutUser } from "../../api/auth.js";

// Style Imports
import styles from "./Settings.module.css";

// Constants
const PROFILE_FIELDS = ["Email", "Name" /* , "ProfileImage" */];
const UPDATE_FUNCTIONS = {
  Email: updateProfileEmail,
  Name: updateProfileName,
  ProfileImage: updateProfileLogo
};

// Main Component
export default function SettingsController() {
  const { onChangeUser } = useUsersContext();

  // States
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ Email: "", Name: "", ProfileImage: "" });
  const [activeField, setActiveField] = useState(null);
  const [inputValue, setInputValue] = useState("");

  // Load profile details
  async function loadProfile() {
    try {
      const { data } = await getProfileDetails();
      setProfile({
        Email: data?.data?.email || "",
        Name: data?.data?.name || "",
        ProfileImage: data?.data?.profileImage || ""
      });
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    loadProfile();
  }, []);

  // Handle edit click
  const handleEdit = (field) => {
    setActiveField(field);
    setInputValue(profile[field]);
  };

  // Handle save
  const handleSave = async (e) => {
    if (e.key !== "Enter" || !activeField) return;
    try {
      const updateFn = UPDATE_FUNCTIONS[activeField];
      const res = await updateFn(inputValue);
      if (res.status === 200) {
        setProfile((prev) => ({ ...prev, [activeField]: inputValue }));
        if (activeField === "Email") onChangeUser({ email: inputValue });
      }
    } catch (err) {
      console.error("Update error:", err);
    }
    setActiveField(null);
  };

  // Handle logout
  const handleLogout = async () => {
    await logoutUser();
    window.location.reload();
  };

  // Render
  if (loading) return <LoadingCircle />;
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Settings</h1>

      {PROFILE_FIELDS.map((field) => {
        const fieldLabels = {
          ProfileImage: "Profile Image",
          Name: "Name",
          Email: "Email"
        };
        
        return (
          <div key={field} className={styles.profileCard}>
            <h3 className={styles.fieldTitle}>{fieldLabels[field]}</h3>
            {activeField === field && field !== "Email" ? (
              <input
                className={styles.editInput}
                type={field === "Email" ? "email" : "text"}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleSave}
                onBlur={() => setActiveField(null)}
                autoFocus
                placeholder={`Enter ${fieldLabels[field].toLowerCase()}`}
              />
            ) : (
              <div 
                onClick={() => field !== "Email" && handleEdit(field)} 
                className={`${styles.fieldValue} ${!profile[field] ? styles.noValue : ''} ${field === "Email" ? styles.uneditable : ''}`}
                style={{ cursor: field === "Email" ? "default" : "pointer" }}
              >
                {profile[field] || `No ${fieldLabels[field].toLowerCase()} set`}
              </div>
            )}
          </div>
        );
      })}

      <button onClick={handleLogout} className={styles.signOutButton}>
        Sign Out
      </button>
    </div>
  );
}

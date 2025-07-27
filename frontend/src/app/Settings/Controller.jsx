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
  updateProfileLogo,
  getApiKey,
  generateApiKey,
  deleteApiKey
} from "../../api/settings.js";
import { logoutUser } from "../../api/auth.js";

// Style Imports
import styles from "./Settings.module.css";

// Icon Imports
import { COMPLETE_CHECK_ICON } from "../../assets/icons";

// Constants
const PROFILE_FIELDS = [
  "Email",
  // "Name",
  // "ProfileImage"
];
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
  
  // API Key states
  const [apiKey, setApiKey] = useState(null);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [newApiKey, setNewApiKey] = useState("");
  const [copySuccess, setCopySuccess] = useState(false);

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

  // Load API key
  async function loadApiKey() {
    try {
      const { data } = await getApiKey();
      setApiKey(data?.data?.apiKey || null);
    } catch (err) {
      console.error("API key fetch error:", err);
    }
  }

  useEffect(() => {
    loadProfile();
    loadApiKey();
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

  // Handle API key generation
  const handleGenerateApiKey = async () => {
    try {
      const { data } = await generateApiKey();
      setNewApiKey(data?.data?.apiKey || "");
      setShowApiKeyModal(true);
      // Refresh the masked API key
      loadApiKey();
    } catch (err) {
      console.error("API key generation error:", err);
    }
  };

  // Handle copy API key
  const handleCopyApiKey = async () => {
    try {
      await navigator.clipboard.writeText(newApiKey);
      setCopySuccess(true);
      setTimeout(() => {
        setCopySuccess(false);
      }, 3000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  // Handle close modal
  const handleCloseModal = () => {
    setShowApiKeyModal(false);
    setNewApiKey("");
    setCopySuccess(false);
  };

  // Handle delete API key
  const handleDeleteApiKey = async () => {
    if (!window.confirm("Are you sure you want to delete your API key? This action cannot be undone.")) {
      return;
    }
    
    try {
      await deleteApiKey();
      setApiKey(null);
    } catch (err) {
      console.error("API key deletion error:", err);
    }
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

      {/* API Key Section */}
      <div className={styles.profileCard}>
        <h3 className={styles.fieldTitle}>API Key</h3>
        <div className={styles.apiKeyContainer}>
          {apiKey ? (
            <>
              <div className={styles.fieldValue}>{apiKey}</div>
              <div className={styles.apiKeyActions}>
                <button onClick={handleGenerateApiKey} className={styles.regenerateButton}>
                  Regenerate
                </button>
                <button onClick={handleDeleteApiKey} className={styles.deleteButton}>
                  Delete
                </button>
              </div>
            </>
          ) : (
            <>
              {/* <div className={styles.fieldValue + ' ' + styles.noValue}>No API key generated</div> */}
              <button onClick={handleGenerateApiKey} className={styles.generateButton}>
                Generate API Key
              </button>
            </>
          )}
        </div>
      </div>

      <button onClick={handleLogout} className={styles.signOutButton}>
        Sign Out
      </button>

      {/* API Key Modal */}
      {showApiKeyModal && (
        <div className={styles.modalOverlay} onClick={handleCloseModal}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Your API Key</h2>
            <p className={styles.modalDescription}>
              Save this API key securely. You won't be able to see it again.
            </p>
            <div className={styles.apiKeyDisplay}>
              {newApiKey}
            </div>
            <div className={styles.modalActions}>
              <button onClick={handleCloseModal} className={styles.closeButton}>
                Close
              </button>
              <button 
                onClick={handleCopyApiKey} 
                className={`${styles.copyButton} ${copySuccess ? styles.copySuccess : ''}`}
              >
                {copySuccess && COMPLETE_CHECK_ICON}
                {copySuccess ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

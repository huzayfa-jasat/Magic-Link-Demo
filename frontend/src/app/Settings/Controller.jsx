// Dependencies
import { useState, useEffect } from "react";

// Context Imports
import { useUsersContext } from "../../context/useUsersContext.js";

// Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle.jsx";
import {
  ApiKeyModal,
  PasswordResetModal,
  EmailUpdateModal,
} from "./components";

// API Imports
import {
  getProfileDetails,
  getApiKey, generateApiKey, deleteApiKey
} from "../../api/settings.js";
import {
  logoutUser
} from "../../api/auth.js";

// Style Imports
import styles from "./Settings.module.css";

// Main Component
export default function SettingsController() {
  const { onChangeUser } = useUsersContext();

  // States
  const [loading, setLoading] = useState(true);
  const [profileEmail, setProfileEmail] = useState("");
  const [apiKey, setApiKey] = useState(null);
  const [newApiKey, setNewApiKey] = useState("");
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Load profile details
  async function loadProfile() {
    try {
      const { data } = await getProfileDetails();
      setProfileEmail(data?.data?.email || "");
    } catch (err) {
      console.error("Error loading profile:", err);
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

  // Load profile and API key on mount
  useEffect(() => {
    loadProfile();
    loadApiKey();
  }, []);

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

  // Handle close API key modal
  const handleCloseApiKeyModal = () => {
    setShowApiKeyModal(false);
    setNewApiKey("");
  };

  // Handle delete API key
  const handleDeleteApiKey = async () => {
    const message = "Are you sure you want to delete your API key? This action cannot be undone.";
    if (!window.confirm(message)) return;
    try {
      await deleteApiKey();
      setApiKey(null);
    } catch (err) {
      console.error("API key deletion error:", err);
    }
  };

  // Handle close password modal
  const handleClosePasswordModal = () => {
    setShowPasswordModal(false);
  };

  // Handle update email success
  const handleUpdateEmailSuccess = (newEmail) => {
    setProfileEmail(newEmail);
    onChangeUser({ email: newEmail });
  };

  // Handle close email modal
  const handleCloseEmailModal = () => {
    setShowEmailModal(false);
  };

  // Render
  if (loading) return <LoadingCircle />;
  return (
    <>
      {/* Modals */}
      {(showApiKeyModal) && <ApiKeyModal apiKey={newApiKey} onClose={handleCloseApiKeyModal} />}
      {(showPasswordModal) && <PasswordResetModal onClose={handleClosePasswordModal} />}
      {(showEmailModal) && <EmailUpdateModal onSuccess={handleUpdateEmailSuccess} onClose={handleCloseEmailModal} />}

      {/* Main Content */}
      <div className={styles.container}>
        <h1 className={styles.title}>Settings</h1>
        
        {/* Update Email Section */}
        <div className={styles.profileCard}>
          <h3 className={styles.fieldTitle}>Email</h3>
          <div className={styles.fieldValue}>{profileEmail}</div>
          <button onClick={() => setShowEmailModal(true)} className={styles.generateButton}>
            Update
          </button>
        </div>

        {/* API Key Section */}
        <div className={styles.profileCard}>
          <h3 className={styles.fieldTitle}>API Key</h3>
          <div className={styles.apiKeyContainer}>
            {(apiKey) ? (
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
                  Generate
                </button>
              </>
            )}
          </div>
        </div>

        {/* Reset Password Section */}
        <div className={styles.profileCard}>
          <h3 className={styles.fieldTitle}>Update Password</h3>
          <button onClick={() => setShowPasswordModal(true)} className={styles.generateButton}>
            Update
          </button>
        </div>

        {/* Sign Out Section */}
        <button onClick={handleLogout} className={styles.signOutButton}>
          Sign Out
        </button>
      </div>
    </>
  );
}

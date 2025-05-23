import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  getProfileDetails,
  updateProfileEmail,
  updateProfileName,
  updateProfileLogo
} from "../../api/settings.js";
import { logoutUser } from "../../api/auth.js";
import { useUsersContext } from "../../context/useUsersContext.js";

const updateFunctions = {
  Email: updateProfileEmail,
  Name: updateProfileName,
  ProfileImage: updateProfileLogo
};

export default function SettingsController() {
  const navigate = useNavigate();
  const { onChangeUser } = useUsersContext();
  const [profile, setProfile] = useState({ Email: "", Name: "", ProfileImage: "" });
  const [activeField, setActiveField] = useState(null);
  const [inputValue, setInputValue] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
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
    })();
  }, []);

  const handleEdit = (field) => {
    setActiveField(field);
    setInputValue(profile[field]);
  };

  const handleSave = async (e) => {
    if (e.key !== "Enter" || !activeField) return;
    try {
      const updateFn = updateFunctions[activeField];
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

  const handleLogout = async () => {
    await logoutUser();
    window.location.reload();
  };

  if (loading) return <div>Loading...</div>;

  return (
    <div style={{ maxWidth: 600, margin: "0 auto", padding: 20, color: "white" }}>
      <h1>Settings</h1>

      {["ProfileImage", "Name", "Email"].map((field) => (
        <div key={field} style={{ marginTop: 20, marginBottom: 20, border: "1px solid #ccc", borderRadius: 5, padding: 10 }}>
          <h3 style={{ margin: 0 }}>{field}</h3>
          
            <div onClick={() => handleEdit(field)} style={{ cursor: "pointer" }}>
              {profile[field] || `No ${field} set`}
            </div>
            {activeField === field && (
              <div style={{ marginTop: 10, border : "1px solid #ccc", borderRadius: 5, padding: 10 }}>

              <div>Edit {field}</div>
              <input
                type={field === "Email" ? "email" : "text"}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleSave}
                onBlur={() => setActiveField(null)}
                autoFocus
              />
              </div>
            )}
        </div>
      ))}

      <button onClick={handleLogout} style={{ background: "#dc3545", color: "white", padding: 10, border: "none" }}>
        Sign Out
      </button>

      <div style={{ marginTop: 40, paddingTop: 20 }}>
        <h3>Legal</h3>
        <div style={{ display: "flex", gap: 20 }}>
          <a href="https://example.com/terms" target="_blank" rel="noopener noreferrer">Terms</a>
          <a href="https://example.com/privacy" target="_blank" rel="noopener noreferrer">Privacy</a>
        </div>
      </div>
    </div>
  );
}

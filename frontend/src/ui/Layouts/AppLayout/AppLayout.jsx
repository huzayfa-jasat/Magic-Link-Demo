// Dependencies
import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";

// Context Imports
import { useUsersContext } from "../../../context/useUsersContext";

// API Imports
import { getBalance } from "../../../api/credits";

// Style Imports
import s from "./AppLayout.module.css";

// Icon Imports
import { OMNI_LOGO, UPLOAD_ICON, SETTINGS_ICON, SIDEBAR_OPEN, SIDEBAR_CLOSE, COINS_ICON, HOME_ICON, PACKAGE_ICON, REFERRAL_ICON } from "../../../assets/icons";

// Constants
const NAV_TABS = [
  { icon: HOME_ICON, text: "Validate", link: "/home" },
  { icon: UPLOAD_ICON, text: "Upload", link: "/upload" },
  { icon: COINS_ICON, text: "Credits", link: "/credits" },
  { icon: PACKAGE_ICON, text: "Packages", link: "/packages" },
  { icon: REFERRAL_ICON, text: "Referrals", link: "/referrals", badge: "EARN CREDITS" },
];


// Helper Components


// Functional Component
export default function AppLayout({ title, children }) {
  const { user } = useUsersContext();

  // States
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [creditBalance, setCreditBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  // Change document title
  useEffect(() => {
    if (title) document.title = `${title} | OmniVerifier`;
    else document.title = "OmniVerifier";
  }, [title]);

  // Get credit balance
  async function loadCreditBalance() {
    const response = await getBalance();
    if (response.status === 200) {
      setCreditBalance(response.data.credit_balance);
      setIsLoading(false);
    }
  }
  useEffect(() => {
    loadCreditBalance();
  }, []);

  // Return layout
  return (
    <>
      <main className={s.main}>
        <div className={s.topbar}>
          <div className={s.left}>
            <div className={s.logo}>
              {OMNI_LOGO}
            </div>
            <span className={s.divider}>/</span>
            <div className={s.userInfo}>
              <img src={user.pfp ?? "/defaults/u.webp"} alt="Profile Picture" />
              <p>{user.name ?? user.email}</p>
            </div>
          </div>
          <div className={s.right}>
            <NavLink to="/upload" className={s.upload}>
              {UPLOAD_ICON}
              Upload
            </NavLink>
            <NavLink to="/settings" className={s.settings}>
              {SETTINGS_ICON}
              Settings
            </NavLink>
          </div>
        </div>
        <div className={s.bottom}>
          <aside className={`${s.sidebar} ${(isCollapsed) ? s.collapsed : ""}`}>
            <div className={s.topSection}>
              {NAV_TABS.map((tab) => (
                <NavLink key={`al-nav-${tab.link}`} to={tab.link} className={({ isActive }) => `${s.navItem} ${(isActive) ? s.active : ""}`}>
                  <div className={s.navIcon}>
                    {tab.icon}
                  </div>
                  <span className={s.navItemText}>{tab.text}</span>
                  {(tab.badge) && (
                    <span className={s.navItemBadge}>{tab.badge}</span>
                  )}
                </NavLink>
              ))}

              {(!isLoading) && (
                <NavLink to="/packages" className={s.creditsPill}>
                  {/* <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 122.88 88.86"
                  >
                    <path d="M7.05,0H115.83a7.07,7.07,0,0,1,7,7.05V81.81a7,7,0,0,1-1.22,4,2.78,2.78,0,0,1-.66,1,2.62,2.62,0,0,1-.66.46,7,7,0,0,1-4.51,1.65H7.05a7.07,7.07,0,0,1-7-7V7.05A7.07,7.07,0,0,1,7.05,0Zm-.3,78.84L43.53,40.62,6.75,9.54v69.3ZM49.07,45.39,9.77,83.45h103L75.22,45.39l-11,9.21h0a2.7,2.7,0,0,1-3.45,0L49.07,45.39Zm31.6-4.84,35.46,38.6V9.2L80.67,40.55ZM10.21,5.41,62.39,47.7,112.27,5.41Z" />
                  </svg> */}
                  <div className={s.creditBalanceTop}>
                    {COINS_ICON}
                    <span className={s.creditBalanceLabel}>Credits</span>
                  </div>
                  <span className={s.creditBalanceAmount}>{creditBalance.toLocaleString()}</span>
                  <div className={s.highlight}>
                    Buy More
                  </div>
                </NavLink>
              )}
            </div>
            <div className={s.bottomSection}>
              <button className={s.collapseButton} onClick={() => setIsCollapsed((prev) => !prev)}>
                {(isCollapsed) ? SIDEBAR_OPEN : SIDEBAR_CLOSE}
              </button>
            </div>
          </aside>
          <div className={`${s.content} ${(isCollapsed) ? s.collapsed : ""}`}>{children}</div>
        </div>
      </main>
    </>
  );
}

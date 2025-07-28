// Dependencies
import { useEffect, useState } from "react";
import { NavLink, useParams } from "react-router-dom";

// Context Imports
import { useUsersContext } from "../../../context/useUsersContext";

// API Imports
import { getBalance, getCatchallBalance } from "../../../api/credits";

// Style Imports
import s from "./AppLayout.module.css";

// Icon Imports
import {
  OMNI_LOGO, UPLOAD_ICON, UPLOAD_ICON_VARIABLE, SETTINGS_ICON, SETTINGS_ICON_VARIABLE, SIDEBAR_OPEN, SIDEBAR_CLOSE, COINS_ICON,
  // HOME_ICON, PACKAGE_ICON, REFERRAL_ICON,
  CIRCLE_CHECK_ICON, MONEY_ICON, PERSON_ICON, WALLET_ICON,
  EMAIL_ICON, EMAIL_SHREDDER_ICON,
  MENU_ICON, MENU_CLOSE_ICON
} from "../../../assets/icons";

// Constants
const NAV_TABS = [
  { icon: CIRCLE_CHECK_ICON, text: "Validate", link: "/home" },
  { icon: <UPLOAD_ICON_VARIABLE strokeWidth={2} />, text: "Upload", link: "/upload" },
  { icon: WALLET_ICON, text: "Credits", link: "/credits" },
  { icon: MONEY_ICON, text: "Get Credits", link: "/packages" },
  { icon: PERSON_ICON, text: "Referrals", link: "/referrals", badge: "EARN CREDITS" },
  { icon: <SETTINGS_ICON_VARIABLE strokeWidth={2} />, text: "Settings", link: "/settings" },
];


// Helper Component
function CreditSidebarPill({ icon, label, balance, link }) {
  return (
    <NavLink to={link} className={s.creditsPill}>
      <div className={s.creditBalanceTop}>
        {icon}
        <span className={s.creditBalanceLabel}>{label}</span>
      </div>
      <span className={s.creditBalanceAmount}>{balance.toLocaleString()}</span>
      <div className={s.highlight}>
        Get More
      </div>
    </NavLink>
  );
}


// Functional Component
export default function AppLayout({ title, children }) {
  const { user } = useUsersContext();

  // States
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [emailBalance, setEmailBalance] = useState(0);
  const [catchallBalance, setCatchallBalance] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Change document title
  useEffect(() => {
    if (title) document.title = `${title} | OmniVerifier`;
    else document.title = "OmniVerifier";
  }, [title]);

  // Get credit balance
  async function loadSidebarBalances() {
    const [emailResponse, catchallResponse] = await Promise.all([getBalance(), getCatchallBalance()]);
    if (emailResponse.status === 200) setEmailBalance(emailResponse.data.credit_balance);
    if (catchallResponse.status === 200) setCatchallBalance(catchallResponse.data.credit_balance);
    setIsLoading(false);
  }
  useEffect(() => {
    loadSidebarBalances();
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
              {/* <img src={user.pfp ?? "/defaults/u.webp"} alt="Profile Picture" /> */}
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
          <div className={s.rightMobile}>
            <button className={s.menuButton} onClick={() => setMobileMenuOpen((prev) => !prev)}>
              {MENU_ICON}
            </button>
          </div>
        </div>
        {mobileMenuOpen && (
          <div className={s.mobileMenu}>
            <div className={s.mobileMenuContent}>
              <div className={s.mobileMenuHeader}>
                <div className={s.mobileMenuHeaderLeft}>
                  {OMNI_LOGO}
                </div>
                <button className={s.mobileMenuCloseButton} onClick={() => setMobileMenuOpen(false)}>
                  {MENU_CLOSE_ICON}
                </button>
              </div>
              <div className={s.mobileMenuItems}>
                {NAV_TABS.map((tab) => (
                  <NavLink key={`mobile-nav-${tab.link}`} to={tab.link} className={({ isActive }) => `${s.mobileNavItem} ${isActive ? s.active : ""}`} onClick={() => setMobileMenuOpen(false)}>
                    <div className={s.mobileNavIcon}>
                      {tab.icon}
                    </div>
                    <span className={s.mobileNavText}>{tab.text}</span>
                    {tab.badge && (
                      <span className={s.mobileNavBadge}>{tab.badge}</span>
                    )}
                  </NavLink>
                ))}
              </div>
              {!isLoading && (
                <div className={s.mobileMenuCredits}>
                  <CreditSidebarPill icon={EMAIL_ICON} label="Email Credits" balance={emailBalance} link="/packages?p=validate" />
                  <CreditSidebarPill icon={EMAIL_SHREDDER_ICON} label="Catchall Credits" balance={catchallBalance} link="/packages?p=catchall" />
                </div>
              )}
            </div>
          </div>
        )}
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
                <>
                  <CreditSidebarPill icon={EMAIL_ICON} label="Email Credits" balance={emailBalance} link="/packages?p=validate" />
                  <CreditSidebarPill icon={EMAIL_SHREDDER_ICON} label="Catchall Credits" balance={catchallBalance} link="/packages?p=catchall" />
                </>
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

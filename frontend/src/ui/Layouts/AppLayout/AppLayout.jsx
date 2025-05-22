// Dependencies
import { useEffect } from "react";
import { NavLink } from "react-router-dom";
// Style Imports
import s from "./AppLayout.module.css";

// Functional Component
export default function AppLayout({ title, children }) {
  // Change document title
  useEffect(() => {
    if (title) document.title = `${title} | OmniVerifier`;
    else document.title = "OmniVerifier";
  }, [title]);

  // Return layout
  return (
    <>
      <main className={s.main}>
        <aside className={s.sidebar}>
          <div className={s.topSection}>
            <div className={s.logo}>
              <svg
                width="32"
                height="14"
                viewBox="0 0 32 14"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M4.41283 0.720618C3.27119 1.54942 3.01436 1.98265 2.16188 4.51818L1.5413 6.36364H8.5189L8.96385 5.11051C9.21178 4.4128 9.75421 3.56694 10.1885 3.20142C10.9251 2.5816 11.1262 2.54545 13.8274 2.54545H16.6865L17.5005 0H5.40556L4.41283 0.720618ZM22.5673 8.63495C22.3193 9.33265 21.7769 10.1785 21.3427 10.544C20.6045 11.1649 20.408 11.2 17.665 11.2H14.767L14.4885 12.2342C14.3353 12.8029 14.1469 13.4329 14.0698 13.6342C13.9501 13.9455 14.7741 14 19.6033 14C24.8495 14 25.3609 13.9595 26.3829 13.4649C27.8188 12.7698 28.5315 11.7765 29.3326 9.35455L29.9852 7.38182H23.0122L22.5673 8.63495Z"
                  fill="white"
                />
                <path
                  d="M18.3067 0.647563C18.1712 1.00367 17.99 1.5764 17.9037 1.92029L17.7467 2.54545H20.5431C23.7934 2.54545 24.0528 2.69054 23.8448 4.39294C23.772 4.9868 23.6292 5.67662 23.5271 5.92557C23.354 6.34862 23.5722 6.37382 26.8487 6.30738L30.3553 6.23636L30.9515 4.46854C31.6853 2.29142 31.7052 1.28367 31.0283 0.557201C30.5228 0.0145099 30.3533 0 24.5311 0H18.5528L18.3067 0.647563ZM1.12383 7.7C-0.218642 11.366 -0.317151 12.4496 0.608631 13.3751L1.23329 14H12.9459L13.3374 12.6809C13.553 11.9557 13.7292 11.3257 13.7292 11.2809C13.7292 11.2364 12.4832 11.2 10.9602 11.2C7.74049 11.2 7.47856 11.0524 7.68627 9.35251C7.75907 8.75866 7.90059 8.0724 8.00114 7.82727C8.16965 7.41593 7.91816 7.38182 4.71216 7.38182C2.1667 7.38182 1.20936 7.46658 1.12383 7.7Z"
                  fill="#78D2FE"
                />
              </svg>
            </div>
            <nav className={s.navItem}>
              <NavLink to="/upload" className={s.uploadButton}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="24"
                  height="24"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke="#000"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.5"
                    d="M4 12v3.2c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311C6.28 20 7.12 20 8.8 20h6.4c1.68 0 2.52 0 3.162-.327a3 3 0 0 0 1.311-1.311C20 17.72 20 16.88 20 15.2V12m-8 2V4m0 0L8.25 7.873M12 4l3.75 3.873"
                  />
                </svg>
                Upload
              </NavLink>
              {
              }
              <NavLink to="/packages" className={s.packagesButton}>
                Buy Credits
              </NavLink>
              <NavLink to="/settings" className={s.settingsButton}>
                <svg
                  className={s.settingsIcon}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#91959c"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Settings
              </NavLink>
            </nav>
          </div>
          <div className={s.bottomSection}>
            <div className={s.creditsPill}>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 122.88 88.86"
              >
                <path d="M7.05,0H115.83a7.07,7.07,0,0,1,7,7.05V81.81a7,7,0,0,1-1.22,4,2.78,2.78,0,0,1-.66,1,2.62,2.62,0,0,1-.66.46,7,7,0,0,1-4.51,1.65H7.05a7.07,7.07,0,0,1-7-7V7.05A7.07,7.07,0,0,1,7.05,0Zm-.3,78.84L43.53,40.62,6.75,9.54v69.3ZM49.07,45.39,9.77,83.45h103L75.22,45.39l-11,9.21h0a2.7,2.7,0,0,1-3.45,0L49.07,45.39Zm31.6-4.84,35.46,38.6V9.2L80.67,40.55ZM10.21,5.41,62.39,47.7,112.27,5.41Z" />
              </svg>
              500 Credits Left
            </div>
            <NavLink to="/packages" className={s.packagesButtonBottom}>
              Buy Credits
            </NavLink>
          </div>
        </aside>
        <div className={s.content}>{children}</div>
      </main>
    </>
  );
}

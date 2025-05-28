// Dependencies
import { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Outlet,
  Navigate,
  useLocation,
} from "react-router-dom";

// Context Imports
import { UsersContextProvider } from "./context/usersContextProvider.jsx";
import { useUsersContext } from "./context/useUsersContext.js";

// Util Imports
import ScrollToTop from "./utils/ScrollToTop";

// Component Imports
import NotFound404 from "./ui/ErrorCodes/404";
import AppLayout from "./ui/Layouts/AppLayout/AppLayout.jsx";
// import LoadingCircle from "./ui/Components/LoadingCircle/LoadingCircle.jsx";

// API Imports
import { getAuthStatus } from "./api/auth.js";

// Pages
import {
  Login,
  Register,
  Settings,
  EmailsHome,
  EmailsUpload,
  EmailsBatchDetails,
  PackagesHome,
  CreditsHome,
} from "./app";

// Rule-based Router
function RulesRouter({ rule }) {
  const { onChangeUser } = useUsersContext();
  const [authStatus, setAuthStatus] = useState(-1);

  // Get auth status
  async function getStatus() {
    const resp = await getAuthStatus();
    if (resp.status !== 200) {
      setAuthStatus(0);
    } else {
      const data = resp.data;
      onChangeUser({ email: data.email });
      setAuthStatus(1);
    }
  }
  useEffect(() => {
    getStatus();
  }, []);

  // Return
  switch (authStatus) {
    case -1: // Loading
    // return <LoadingCircle />;
    case 0: // Not logged in
      if (rule === "public") return <Outlet />;
      else return <Navigate to="/login" />;
    case 1: // Logged in
      if (rule === "private") return <Outlet />;
      else return <Navigate to="/home" />;
    default: // Loading
      return <></>;
  }
}

// Functional Component
export default function App() {
  // Routing
  return (
    <UsersContextProvider>
      <Router>
        <ScrollToTop />
        <Routes>
          {/* Only non-logged-in users */}
          <Route element={<RulesRouter rule="public" />}>
            <Route exact path="/login" element={<Login />} />
            <Route exact path="/register" element={<Register />} />
            <Route exact path="/" element={<Navigate to="/login" />} />
          </Route>
          {/* Only logged-in users */}
          <Route element={<RulesRouter rule="private" />}>
            <Route
              exact
              path="/home"
              element={
                <AppLayout title="Home">
                  <EmailsHome />
                </AppLayout>
              }
            />
            <Route exact path="/" element={<Navigate to="/home" />} />
            <Route
              exact
              path="/upload"
              element={
                <AppLayout title="Upload">
                  <EmailsUpload />
                </AppLayout>
              }
            />
            <Route
              exact
              path="/:id/details"
              element={
                <AppLayout title="Batch Details">
                  <EmailsBatchDetails />
                </AppLayout>
              }
            />
            <Route
              exact
              path="/packages"
              element={
                <AppLayout title="Packages">
                  <PackagesHome />
                </AppLayout>
              }
            />
            <Route
              exact
              path="/settings"
              element={
                <AppLayout title="Settings">
                  <Settings />
                </AppLayout>
              }
            />
            <Route
              exact
              path="/credits"
              element={
                <AppLayout title="Credits">
                  <CreditsHome />
                </AppLayout>
              }
            />
          </Route>
          {/* Public to everyone */}
          <Route path="/*" element={<NotFound404 />} />
        </Routes>
      </Router>
    </UsersContextProvider>
  );
}

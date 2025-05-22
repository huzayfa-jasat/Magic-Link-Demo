// Dependencies
import React from 'react';
import { createRoot } from 'react-dom/client';

// Context Imports
import { ErrorProvider, default as ErrorDisplay } from "./ui/Context/ErrorContext";

// Component Imports
import App from './AppRouter';

// Style Imports
import './globals.css';

// Render app
const container = document.getElementById('root');
const root = createRoot(container);
root.render(
  // <React.StrictMode>
    <ErrorProvider>
      <App />
      <ErrorDisplay />
    </ErrorProvider>
  // </React.StrictMode>
);

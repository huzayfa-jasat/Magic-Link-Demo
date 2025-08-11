// Dependencies
import { useState, useContext, createContext } from "react";

// Style Imports
import "../styles/error_bar.css";

// Helper Functions
function getErrorText(errType, errMsg) {
	switch (errType) {
		case 0: return "Failed to load, please try again...";
		case 1: return "Failed to make changes, please try again...";
		case 2: return errMsg;
		default: return "Failed to load, please try again...";
	}
}

// Context API
export const ErrorContext = createContext();

export function ErrorProvider ({ children }) {
	const [errorShowing, setErrorShowing] = useState(false);
	const [errorTimeout, setErrorTimeout] = useState(null);
	const [errorType, setErrorType] = useState(0); // 0 - Fetch, 1 - Upload, 2 - Custom
	const [errorMessage, setErrorMessage] = useState("");

	function showError(errType=0, errMsg="") {
		clearTimeout(errorTimeout);
		setErrorShowing(true); 
		setErrorMessage(errMsg);
		setErrorType(errType);  
		setErrorTimeout(setTimeout(clearError, 8000)); // 8 seconds
	}
	function clearError() { clearTimeout(errorTimeout); setErrorShowing(false); }

	return (
		<ErrorContext.Provider value={{
			showError, clearError, errorShowing, errorType, errorMessage,
		}}>
			{children}
		</ErrorContext.Provider>
	);
};

export default function ErrorDisplay() {
	const errorContext = useContext(ErrorContext);

	// Render
	return (
		<>
			{(errorContext.errorShowing) &&
				<div className="app-err-cont">
					<div className="app-err-d">
						<h3>{getErrorText(errorContext.errorType, errorContext.errorMessage)}</h3>
						<div className="loader"></div>
						<div className="err-loader"><div /></div>
					</div>
				</div>
			}
		</>
	);
};
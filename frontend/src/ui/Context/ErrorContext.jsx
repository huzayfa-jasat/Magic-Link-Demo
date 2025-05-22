// Dependencies
import { useState, useContext, createContext } from "react";

// Style Imports
import "../styles/error_bar.css";

// Context API
export const ErrorContext = createContext();

export function ErrorProvider ({ children }) {
	const [errorShowing, setErrorShowing] = useState(false);
	const [errorTimeout, setErrorTimeout] = useState(null);
	const [errorType, setErrorType] = useState(0); // 0 - Fetch, 1 - Upload

	function showError(errType=0) {
		clearTimeout(errorTimeout);
		setErrorShowing(true); 
		setErrorType(errType);  
		setErrorTimeout(setTimeout(clearError, 8000)); // 8 seconds
	}
	function clearError() { clearTimeout(errorTimeout); setErrorShowing(false); }

	return (
		<ErrorContext.Provider value={{
			showError, clearError, errorShowing, errorType,
		}}>
			{children}
		</ErrorContext.Provider>
	);
};

export default function ErrorDisplay() {
	const errorContext = useContext(ErrorContext);
	return (
		<>
			{(errorContext.errorShowing) &&
				<div className="app-err-cont">
					<div className="app-err-d">
						<h3>{(errorContext.errorType === 0) ? "Failed to load, please try again..." : "Failed to make changes, please try again..."}</h3>
						<div className="loader"></div>
						<div className="err-loader"><div /></div>
					</div>
				</div>
			}
		</>
	);
};
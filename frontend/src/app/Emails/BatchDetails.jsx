// Dependencies
import { useCallback, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import Popup from "reactjs-popup";

// API Imports
import { getVerifyBatchResults, getCatchallBatchResults } from "../../api/batches";

// Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle";
import getMailServerDisplay from "./getMailServerDisplay";
import DetailStats from "./Components/DetailStats";
import ResultsTable from "./Components/ResultsTable";

// Hook Imports
import useBatchData from "./hooks/useBatchData";

// Icon Imports
import {
  BACK_ICON, EXPORT_ICON, SEARCH_ICON,
  VERIFY_VALID_ICON, VERIFY_INVALID_ICON, VERIFY_CATCHALL_ICON,
  EMAIL_ICON,
} from "../../assets/icons";

// Style Imports
import styles from "./Emails.module.css";

// Constants
const FILTER_MAP = {
  'valid': 'deliverable',
  'invalid': 'undeliverable', 
  'catch-all': 'catchall',
  'all': 'all'
};

// Main Component
export default function EmailsBatchDetailsController({
  checkTyp,
}) {
  const { id } = useParams();
  const navigate = useNavigate();

  // Use custom hook for all batch data management
  const {
    details,
    results,
    loading,
    resultsLoading,
    loadingMore,
    hasMore,
    error,
    searchQuery,
    setSearchQuery,
    loadMore,
  } = useBatchData(id, checkTyp);

  // Check if batch is completed and navigate back if not
  useEffect(() => {
    if (details && details.status !== 'completed' && details.status !== 'complete') {
      navigate('/home');
    }
  }, [details, navigate]);

  // Infinite scroll detection
  const handleScroll = () => {
    if (
      window.innerHeight + document.documentElement.scrollTop >= document.documentElement.offsetHeight - 500 && // 500px before bottom
      hasMore && !loadingMore && !resultsLoading
    ) loadMore();
  };
  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasMore, loadingMore, resultsLoading, loadMore]);

  // Export filtered results to CSV (fetches all pages for the filter)
  const handleExportFiltered = useCallback(
    async (filter) => {
      const ITEMS_PER_PAGE = 50;
      let allResults = [];
      let page = 1;
      let done = false;

      // Fetch all pages of filtered results
      while (!done) {
        // Get response (no search / sort)
        let response;
        if (checkTyp === 'verify') response = await getVerifyBatchResults(id, page, ITEMS_PER_PAGE, 'timehl', FILTER_MAP[filter] || 'all', '');
        else if (checkTyp === 'catchall') response = await getCatchallBatchResults(id, page, ITEMS_PER_PAGE, 'timehl', FILTER_MAP[filter] || 'all', '');
        const pageResults = response.data.results || [];
        allResults = [...allResults, ...pageResults];
        
        // Check if we have more pages using metadata
        if (!response.data.metadata?.has_more) done = true;
        else page++;
      }

      // Build CSV content from all filtered results
      const headers = ["Email", "Result", "Mail Server"];
      const csvContent = [
        headers.join(","),
        ...allResults.map((item) => {
          // Map result values: 1=deliverable, 2=catchall, 0=undeliverable
          let resultText;
          if (item.result === 1) resultText = "valid";
          else if (item.result === 2) resultText = "catch-all";
          else resultText = "invalid";
          
          // Return CSV row
          return [
            item.email,
            resultText,
            getMailServerDisplay(item.provider) || "",
          ].join(",");
        }),
      ].join("\n");

      // Create and trigger download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `email-results-${filter}-${id}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [id, checkTyp]
  );

  // Loading state
  if (loading) {
    return (
      <div className={styles.container}>
        <LoadingCircle relative={true} showBg={false} />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p className={styles.emptyText}>{error}</p>
          <p className={styles.emptySubtext}>Please try refreshing the page</p>
        </div>
      </div>
    );
  }

  // Not found state
  if (!details) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p className={styles.emptyText}>Not found</p>
          <p className={styles.emptySubtext}>
            The requested list could not be found.
          </p>
        </div>
      </div>
    );
  }

  // Main render - batch details page
  return (
    <div className={styles.detailsContainer}>
      {/* Navigation back to home */}
      <Link to="/home" className={styles.backLink}>
        {BACK_ICON}
        Go Back
      </Link>

      {/* Page header with title and export dropdown */}
      <div className={styles.detailsHeader}>
        <h1 className={styles.detailsTitle}>{details.title ?? "Details"}</h1>
        {(checkTyp === 'verify') && (
          <Popup
            position="bottom right"
            arrow={false}
            on={["click"]}
            closeOnDocumentClick
            trigger={
              <button className={`${styles.button} ${styles.buttonPrimary}`}>
                {EXPORT_ICON}
                Export
              </button>
            }
          >
            <div className={styles.exportMenu}>
            <button onClick={() => handleExportFiltered("all")}>
              {EMAIL_ICON}
              All Emails
            </button>
              {(details.stats.valid > 0) && (
                <button className={styles.valid} onClick={() => handleExportFiltered("valid")}>
                  {VERIFY_VALID_ICON}
                  Only Valid
                </button>
              )}
              {(details.stats.invalid > 0) && (
                <button className={styles.invalid} onClick={() => handleExportFiltered("invalid")}>
                  {VERIFY_INVALID_ICON}
                  Only Invalid
                </button>
              )}
              {(details.stats.catchall > 0) && (
                <button className={styles.catchall} onClick={() => handleExportFiltered("catch-all")}>
                  {VERIFY_CATCHALL_ICON}
                  Only Catch-All
                </button>
              )}
            </div>
          </Popup>
        )}
      </div>

      {/* Search input for filtering results */}
      <div className={styles.searchContainer}>
        <input
          type="text"
          placeholder="Search emails..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
        {SEARCH_ICON}
      </div>

      {/* Statistics cards showing batch summary */}
      {(checkTyp === 'verify') && (
        <DetailStats
          valid={details.stats.valid}
          invalid={details.stats.invalid}
          catchall={details.stats.catchall}
        />
      )}

      {/* Results table */}
      <div className={styles.tableContainer}>
        {resultsLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <LoadingCircle relative={true} />
          </div>
        ) : (
          <ResultsTable typ={checkTyp} results={results} />
        )}
      </div>

      {/* Infinite scroll loading indicator */}
      {(loadingMore) && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <LoadingCircle relative={true} />
        </div>
      )}
      
      {/* End of results indicator */}
      {/* {(!hasMore && results.length > 0) && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: '#666' }}>
          <p>No more results to load</p>
        </div>
      )} */}
    </div>
  );
}

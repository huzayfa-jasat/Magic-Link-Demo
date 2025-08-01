// Dependencies
import { useCallback, useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import Popup from "reactjs-popup";

// API Imports
import { getVerifyBatchResults, getCatchallBatchResults } from "../../api/batches";

// Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle";
import getMailServerDisplay from "./utils/getMailServerDisplay";
import DetailStats from "./components/DetailStats";
import ResultsTable from "./components/ResultsTable";
import ExportLoadingModal from "./components/ExportLoadingModal";

// Hook Imports
import useBatchData from "./hooks/useBatchData";

// Icon Imports
import {
  BACK_ICON, EXPORT_ICON, SEARCH_ICON,
  VERIFY_VALID_ICON, VERIFY_INVALID_ICON, VERIFY_CATCHALL_ICON,
  EMAIL_ICON,
} from "../../assets/icons";

// Style Imports
import styles from "./styles/Emails.module.css";

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
  
  // Export loading state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState({ current: 0, total: 0 });

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
      const ITEMS_PER_PAGE = 1000;
      let allResults = [];
      let page = 1;
      let done = false;
      
      // Show loading modal
      setIsExporting(true);
      setExportProgress({ current: 0, total: 0 });

      try {
        // Fetch all pages of filtered results
        while (!done) {
          // Get response (no search / sort)
          let response;
          if (checkTyp === 'verify') response = await getVerifyBatchResults(id, page, ITEMS_PER_PAGE, 'timehl', FILTER_MAP[filter] || 'all', '');
          else if (checkTyp === 'catchall') response = await getCatchallBatchResults(id, page, ITEMS_PER_PAGE, 'timehl', FILTER_MAP[filter] || 'all', '');
          const pageResults = response.data.results || [];
          allResults = [...allResults, ...pageResults];
          
          // Update progress based on metadata
          const metadata = response.data.metadata;
          if (metadata) {
            const totalPages = Math.ceil(metadata.total_count / ITEMS_PER_PAGE);
            setExportProgress({ current: page, total: totalPages });
          }
          
          // Check if we have more pages using metadata
          if (!response.data.metadata?.has_more) done = true;
          else page++;
        }
      } catch (error) {
        console.error('Export failed:', error);
        setIsExporting(false);
        return;
      }

      // Build CSV content from all filtered results
      const headers = ["Email", "Result", "Mail Server"];
      const csvContent = [
        headers.join(","),
        ...allResults.map((item) => {
          // Map result values: 1=deliverable, 2=catchall, 0=undeliverable
          let resultText;
          if (item.result === 1) resultText = "Valid";
          else if (item.result === 2) resultText = "Catch-All";
          else resultText = "Invalid";
          
          // Return CSV row
          return [
            item.email,
            resultText,
            item.provider || "",
          ].join(",");
        }),
      ].join("\n");

      // Create and trigger download
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      
      // Generate filename based on filter type
      const batchName = details.title || id;
      let prefix;
      if (filter === 'valid') prefix = 'Good_Only';
      else if (filter === 'invalid') prefix = 'Invalid_Only';
      else if (filter === 'catch-all') prefix = 'Catchall_Only';
      else prefix = 'All_Emails';
      
      const filename = `${prefix}_OmniVerifier_${batchName}.csv`;
      
      link.setAttribute("href", url);
      link.setAttribute("download", filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Hide loading modal
      setIsExporting(false);
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
      
      {/* Export Loading Modal */}
      <ExportLoadingModal 
        isOpen={isExporting} 
        progress={exportProgress} 
      />
    </div>
  );
}

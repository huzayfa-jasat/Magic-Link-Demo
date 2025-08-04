// Dependencies
import { useEffect, useState, useContext, useCallback, useRef } from "react";

// API Imports
import { getBatchesList, removeVerifyBatch, removeCatchallBatch, getBatchProgress } from "../../api/batches";
import { getOverviewStats } from "../../api/credits";

// Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle";
import EmptyBatchList from "./components/EmptyBatchList";
import BatchCard from "./components/BatchCard";
import DashboardOverviewStats from "./components/DashboardOverviewStats";
import ProcessingModal from "./components/ProcessingModal";
import RemoveModal from "./components/RemoveModal";

// Context Imports
import { ErrorContext } from "../../ui/Context/ErrorContext";

// Style Imports
import styles from "./styles/Emails.module.css";
import packageStyles from "../Packages/styles/Packages.module.css";


// Helper Component
function CategorySelectorButton({ title, category, setCategory, isActive }) {
  return (
    <button
      className={`${packageStyles.pageButton} ${(isActive) ? packageStyles.active : ""}`}
      onClick={() => setCategory(category)}
    >
      {title}
    </button>
  );
}

// Main Component
export default function HomeController() {
  const errorContext = useContext(ErrorContext);

  // States
  const [currFilter, setCurrFilter] = useState("all");
  const [requests, setRequests] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [processingModal, setProcessingModal] = useState({ isOpen: false, progress: 0 });
  const [removeModal, setRemoveModal] = useState({ isOpen: false, requestId: null, category: null });
  
  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const ITEMS_PER_PAGE = 25;
  
  // Ref to track current requests for polling
  const requestsRef = useRef(requests);
  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  // Load batches with pagination
  const fetchBatches = async (page = 1, append = false) => {
    if (append) setLoadingMore(true);
    else if (page === 1) setLoading(true);
    
    try {
      const response = await getBatchesList(page, ITEMS_PER_PAGE, 'timehl', currFilter, 'all');
      const batches = response.data.batches || [];
      
      // Add category for visual display if not filtering all
      const processedBatches = currFilter === "all" 
        ? batches 
        : batches.map((batch) => ({...batch, category: currFilter}));
      
      if (append) {
        // Gracefully merge results to handle updates
        setRequests(prev => {
          const existingIds = new Set(prev.map(b => `${b.id}-${b.category}`));
          const newBatches = processedBatches.filter(b => !existingIds.has(`${b.id}-${b.category}`));
          return [...prev, ...newBatches];
        });
      } else {
        setRequests(processedBatches);
      }
      
      // Check if there are more pages
      setHasMore(batches.length === ITEMS_PER_PAGE);
      
    } catch (err) {
      setError("Failed to load verify requests");
      console.error("Error fetching requests:", err);
      
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };
  useEffect(() => {
    setCurrentPage(1);
    setHasMore(true);
    fetchBatches(1, false);
  }, [currFilter]);

  // Load stats on mount
  const fetchStats = async () => {
    try {
      const response = await getOverviewStats();
      setStats(response.data);
    } catch (err) {
      setError("Failed to load overview stats");
      console.error("Error fetching stats:", err);
    }
  };
  useEffect(() => {
    fetchStats();
  }, []);

  // Handle processing batch click
  const handleProcessingClick = (batch) => {
    setProcessingModal({ isOpen: true, progress: batch.progress || 0 });
  };

  // Handle remove batch click
  const handleRemoveClick = (batchId, category) => {
    setRemoveModal({ isOpen: true, requestId: batchId, category: category });
  };

  // Handle pause confirmation (update batch status)
  const handleConfirmPause = async (requestId, category) => {
    setRequests((prev) => prev.map((batch) => (batch.id === requestId && batch.category === category) ? { ...batch, status: 'paused' } : batch));
  };

  // Handle resume confirmation (update batch status)
  const handleConfirmResume = async (requestId, category) => {
    setRequests((prev) => prev.map((batch) => (batch.id === requestId && batch.category === category) ? { ...batch, status: 'processing' } : batch));
  };

  // Handle deleting batch
	const handleConfirmRemove = async (requestId, category) => {
		try {
			let resp;
			if (category === 'deliverable') resp = await removeVerifyBatch(requestId);
			else if (category === 'catchall') resp = await removeCatchallBatch(requestId);

			// Handle response
			if (resp.status === 200) {
        setRequests((prev) => prev.filter((batch) => !(batch.id === requestId && batch.category === category)));
        setRemoveModal((prev) => ({ ...prev, isOpen: false }));
      } else errorContext.showError(1);

		} catch (error) {
			console.error('Failed to remove batch:', error);
		}
	};

  // Load more function for pagination
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      fetchBatches(nextPage, true);
    }
  }, [currentPage, hasMore, loadingMore, currFilter]);
  
  // Infinite scroll handler
  const handleScroll = useCallback(() => {
    const scrollTop = (document.documentElement && document.documentElement.scrollTop) || document.body.scrollTop;
    const scrollHeight = (document.documentElement && document.documentElement.scrollHeight) || document.body.scrollHeight;
    const clientHeight = document.documentElement.clientHeight || window.innerHeight;
    const scrolledToBottom = Math.ceil(scrollTop + clientHeight) >= scrollHeight - 500;
    
    if (scrolledToBottom && hasMore && !loadingMore && !loading) {
      loadMore();
    }
  }, [hasMore, loadingMore, loading, loadMore]);
  
  // Function to update processing batch progress
  const updateProcessingBatches = useCallback(async (requestsRef, setRequests) => {
    // Get all processing batches from the ref
    const currentRequests = requestsRef.current;
    const processingBatches = currentRequests.filter(batch => batch.status === 'processing');
    
    if (processingBatches.length === 0) return;
    
    // Update progress for each processing batch
    const updates = processingBatches.map(async (batch) => {
      try {
        // For deliverable batches, use the progress endpoint
        if (batch.category === 'deliverable') {
          const response = await getBatchProgress('deliverable', batch.id);
          if (response.status === 200) {
            return { 
              id: batch.id, 
              category: batch.category,
              progress: response.data.progress,
              status: response.data.progress === 100 ? 'completed' : 'processing'
            };
          }
        } else if (batch.category === 'catchall') {
          // For catchall batches, we'll use getBatchDetails instead
          // This avoids fetching entire pages and is more efficient
          try {
            const response = await getBatchProgress('catchall', batch.id);
            // Even if the endpoint doesn't fully support catchall,
            // it might return basic status info
            if (response.status === 200) {
              return {
                id: batch.id,
                category: batch.category,
                progress: response.data.progress || batch.progress || 0,
                status: batch.status // Keep current status for catchall
              };
            }
          } catch (err) {
            // If progress endpoint fails for catchall, keep current values
            console.log('Progress endpoint not available for catchall batch:', batch.id);
          }
        }
      } catch (error) {
        console.error(`Error updating progress for batch ${batch.id}:`, error);
      }
      return null;
    });
    
    // Wait for all updates and apply them
    const results = await Promise.all(updates);
    const validUpdates = results.filter(update => update !== null);
    
    if (validUpdates.length > 0) {
      setRequests(prev => prev.map(batch => {
        const update = validUpdates.find(u => u.id === batch.id && u.category === batch.category);
        if (update) {
          return { ...batch, progress: update.progress, status: update.status };
        }
        return batch;
      }));
    }
  }, []);

  // Add scroll event listener
  useEffect(() => {
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  // Poll for progress updates for processing batches
  useEffect(() => {
    // Set up interval for periodic updates
    const intervalId = setInterval(() => {
      updateProcessingBatches(requestsRef, setRequests);
    }, 10000); // Update every 10 seconds
    
    // Cleanup
    return () => clearInterval(intervalId);
  }, [currFilter, updateProcessingBatches]); // Only recreate when filter changes

  // Render
  if (loading) {
    return (
      <div className={styles.container}>
        <LoadingCircle relative={true} showBg={false} />
      </div>
    );
  }
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
  return (
    <>
      <ProcessingModal 
        isOpen={processingModal.isOpen} 
        progress={processingModal.progress}
        onClose={() => setProcessingModal({ isOpen: false, progress: 0 })}
      />
      <RemoveModal
        isOpen={removeModal.isOpen}
        onClose={() => setRemoveModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={() => handleConfirmRemove(removeModal.requestId, removeModal.category)}
      />
      <div className={styles.container}>
        <h1 className={styles.title}>Welcome back!</h1>
        {(stats !== null && (stats.bounced > 0 || stats.mins > 0 || stats.cost > 0)) && <>
          <DashboardOverviewStats stats={stats} />
          <br/>
        </>}
        <div className={packageStyles.pageSelector}>
          <CategorySelectorButton title={<>All <span className={packageStyles.hideMobile}>Requests</span></>} category="all" setCategory={setCurrFilter} isActive={currFilter === "all"} />
          <CategorySelectorButton title={<>Email <span className={packageStyles.hideMobile}>Validation</span></>} category="deliverable" setCategory={setCurrFilter} isActive={currFilter === "deliverable"} />
          <CategorySelectorButton title={<>Catchall <span className={packageStyles.hideMobile}>Validation</span></>} category="catchall" setCategory={setCurrFilter} isActive={currFilter === "catchall"} />
        </div>
        <br/>
        {(requests.length > 0) ?
          <>
            <div className={styles.grid}>
              {requests.map((request) => (
                <BatchCard
                  key={`${request.id}-${request.category}`} 
                  request={request}
                  onProcessingClick={handleProcessingClick}
                  onRemoveClick={handleRemoveClick}
                  onBatchPause={handleConfirmPause}
                  onBatchResume={handleConfirmResume}
                />
              ))}
            </div>
            
            {/* Loading more indicator */}
            {loadingMore && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
                <LoadingCircle relative={true} />
              </div>
            )}
            
            {/* End of results indicator */}
            {/* {!hasMore && requests.length > 0 && (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem', color: '#666' }}>
                <p>No more results to load</p>
              </div>
            )} */}
          </>
          :
          <EmptyBatchList />
        }
      </div>
    </>
  );
}

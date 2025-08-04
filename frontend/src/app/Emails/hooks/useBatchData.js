// Dependencies
import { useState, useEffect, useCallback } from "react";

// API Imports
import {
  getVerifyBatchDetails,
  getVerifyBatchResults,
  getCatchallBatchDetails,
  getCatchallBatchResults,
} from "../../../api/batches";

// Hook Imports
import useDebounce from "./useDebounce";

// Constants
const ITEMS_PER_PAGE = 100;

/**
 * Custom hook for managing batch data, pagination, and search
 * @param {string} id - The batch ID
 * @param {string} checkType - The type of check (verify or catchall)
 * @returns {object} - Object containing state and handlers
 */

export default function useBatchData(id, checkType) {
  // State
  const [details, setDetails] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Debounced search query (0.5 second delay as per user preference)
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // Fetch batch details
  const fetchDetails = useCallback(async () => {
    try {
      let response;
      if (checkType === 'verify') response = await getVerifyBatchDetails(id);
      else if (checkType === 'catchall') response = await getCatchallBatchDetails(id);
      setDetails(response.data);
      return true;

    } catch (err) {
      setError("Failed to load batch details");
      console.error("Error fetching details:", err);
      return false;
    }
  }, [id, checkType]);

  // Load details on mount
  const loadDetails = async () => {
    setLoading(true);
    setError(null);
    const success = await fetchDetails();
    if (!success) setLoading(false);
  };
  useEffect(() => {
    loadDetails();
  }, [fetchDetails]);

  // Fetch paginated results
  const fetchResults = useCallback(
    async (page, search = "", append = false) => {
      if (!details) return;
      if (append) setLoadingMore(true);
      else setResultsLoading(true);
      
      try {
        // Get response
        let response;
        if (checkType === 'verify') response = await getVerifyBatchResults(id, page, ITEMS_PER_PAGE, 'timehl', 'all', search);
        else if (checkType === 'catchall') response = await getCatchallBatchResults(id, page, ITEMS_PER_PAGE, 'timehl', 'all', search);

        // Get results
        const resultData = response.data.results || [];

        // Set results
        if (append) {
          setResults(prev => [...prev, ...resultData]);
        } else {
          setResults(resultData);
        }
        
        // Use metadata from new API for pagination
        if (response.data.metadata) {
          setTotalPages(response.data.metadata.total_pages);
          setHasMore(response.data.metadata.has_more);
        } else {
          // Fallback calculation
          const totalPages = Math.ceil(details.emails / ITEMS_PER_PAGE);
          setTotalPages(totalPages);
          setHasMore(page < totalPages);
        }

        // Return success
        return true;

      } catch (err) {
        setError("Failed to load results");
        console.error("Error fetching results:", err);
        if (!append) setResults([]);
        return false;

      } finally {
        setResultsLoading(false);
        setLoadingMore(false);
        setLoading(false);
      }
    },
    [id, details, checkType]
  );

  // Load more results for infinite scroll
  const loadMore = useCallback(() => {
    if (!loadingMore && hasMore && !resultsLoading) {
      const nextPage = currentPage + 1;
      setCurrentPage(nextPage);
      fetchResults(nextPage, debouncedSearchQuery, true);
    }
  }, [currentPage, debouncedSearchQuery, fetchResults, hasMore, loadingMore, resultsLoading]);

  // Reset page and results when search changes
  useEffect(() => {
    setCurrentPage(1);
    setResults([]);
    setHasMore(true);
  }, [debouncedSearchQuery]);

  // Load initial results when details are loaded or search changes
  useEffect(() => {
    if (details && !error) {
      fetchResults(1, debouncedSearchQuery, false);
    }
  }, [details, debouncedSearchQuery, fetchResults, error]);

  // Return hooks
  return {
    // State
    details,
    results,
    loading,
    resultsLoading,
    loadingMore,
    hasMore,
    error,
    currentPage,
    totalPages,
    searchQuery,
    
    // Handlers
    setCurrentPage,
    setSearchQuery,
    loadMore,
    
    // Functions for potential external use
    refetchDetails: fetchDetails,
    refetchResults: () => fetchResults(currentPage, debouncedSearchQuery),
  };
}

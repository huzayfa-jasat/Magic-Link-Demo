import { useState, useEffect, useCallback } from "react";
import {
  getVerifyBatchDetails,
  getVerifyBatchResults,
} from "../../../api/batches";
import  useDebounce  from "./useDebounce";

const ITEMS_PER_PAGE = 50;

/**
 * Custom hook for managing batch data, pagination, and search
 * @param {string} id - The batch ID
 * @returns {object} - Object containing state and handlers
 */

export default function useBatchData(id) {
  // State
  const [details, setDetails] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Debounced search query (0.5 second delay as per user preference)
  const debouncedSearchQuery = useDebounce(searchQuery, 500);

  // Fetch batch details
  const fetchDetails = useCallback(async () => {
    try {
      const response = await getVerifyBatchDetails(id);
      setDetails(response.data);
      return true;
    } catch (err) {
      setError("Failed to load batch details");
      console.error("Error fetching details:", err);
      return false;
    }
  }, [id]);

  // Fetch paginated results
  const fetchResults = useCallback(
    async (page, search = "") => {
      if (!details) return;

      try {
        // Note: Search functionality is not available in new API
        // Filtering by email content would need to be done client-side if needed
        const response = await getVerifyBatchResults(
          id,
          page,
          ITEMS_PER_PAGE,
          'timehl',
          'all'
        );
        
        let resultData = response.data.results || [];
        
        // Apply client-side search filtering if search query exists
        if (search && search.trim()) {
          resultData = resultData.filter(item => 
            item.email.toLowerCase().includes(search.toLowerCase())
          );
        }
        
        setResults(resultData);
        
        // Use metadata from new API for pagination
        if (response.data.metadata) {
          setTotalPages(response.data.metadata.total_pages);
        } else {
          // Fallback calculation
          setTotalPages(Math.ceil(details.emails / ITEMS_PER_PAGE));
        }
        
        return true;
      } catch (err) {
        setError("Failed to load results");
        console.error("Error fetching results:", err);
        setResults([]);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [id, details]
  );

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchQuery]);

  // Load details on mount
  useEffect(() => {
    const loadDetails = async () => {
      setLoading(true);
      setError(null);
      const success = await fetchDetails();
      if (!success) {
        setLoading(false);
      }
    };
    loadDetails();
  }, [fetchDetails]);

  // Load results when details are loaded and page or search changes
  useEffect(() => {
    if (details && !error) {
      fetchResults(currentPage, debouncedSearchQuery);
    }
  }, [details, currentPage, debouncedSearchQuery, fetchResults, error]);

  // Calculate result statistics
  const stats = (results || []).reduce(
    (acc, item) => {
      // Map new result format: 1=deliverable, 2=catchall, 0=undeliverable
      if (item.result === 1) {
        acc.valid = (acc.valid || 0) + 1;
      } else if (item.result === 2) {
        acc.catchall = (acc.catchall || 0) + 1;
      } else if (item.result === 0) {
        acc.invalid = (acc.invalid || 0) + 1;
      } else {
        acc.pending = (acc.pending || 0) + 1;
      }
      return acc;
    },
    {
      valid: 0,
      invalid: 0,
      catchall: 0,
      pending: 0,
    }
  );

  return {
    // State
    details,
    results,
    loading,
    error,
    currentPage,
    totalPages,
    searchQuery,
    stats,
    
    // Handlers
    setCurrentPage,
    setSearchQuery,
    
    // Functions for potential external use
    refetchDetails: fetchDetails,
    refetchResults: () => fetchResults(currentPage, debouncedSearchQuery),
  };
}

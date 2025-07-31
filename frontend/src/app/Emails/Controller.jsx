// Dependencies
import { useEffect, useState } from "react";

// API Imports
import { getBatchesList } from "../../api/batches";

// Component Imports
import { LoadingCircle } from "../../ui/components/LoadingCircle";
import EmptyBatchList from "./components/EmptyBatchList";
import BatchCard from "./components/BatchCard";

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
  // States
  const [currFilter, setCurrFilter] = useState("all");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load batches on mount
  const fetchBatches = async () => {
    try {
      const response = await getBatchesList(1, 100, 'timehl', currFilter, 'all');
      const batches = response.data.batches;
      // Set batches - filtered doesn't return category, so add for visual display
      if (currFilter === "all") setRequests(batches);
      else setRequests(batches.map((batch) => ({...batch, category: currFilter})));

    } catch (err) {
      setError("Failed to load verify requests");
      console.error("Error fetching requests:", err);

    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    fetchBatches();
  }, [currFilter]);

  // TODO: Pagination

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
    <div className={styles.container}>
      <h1 className={styles.title}>Validate</h1>
      <br/>
      <div className={packageStyles.pageSelector}>
        <CategorySelectorButton title={<>All <span className={packageStyles.hideMobile}>Requests</span></>} category="all" setCategory={setCurrFilter} isActive={currFilter === "all"} />
        <CategorySelectorButton title={<>Email <span className={packageStyles.hideMobile}>Validation</span></>} category="deliverable" setCategory={setCurrFilter} isActive={currFilter === "deliverable"} />
        <CategorySelectorButton title={<>Catchall <span className={packageStyles.hideMobile}>Validation</span></>} category="catchall" setCategory={setCurrFilter} isActive={currFilter === "catchall"} />
      </div>
      <br/><br/>
      {(requests.length > 0) ?
        <div className={styles.grid}>
          {requests.map((request) => (
            <BatchCard key={request.id} request={request} />
          ))}
        </div>
        :
        <EmptyBatchList />
      }
    </div>
  );
}

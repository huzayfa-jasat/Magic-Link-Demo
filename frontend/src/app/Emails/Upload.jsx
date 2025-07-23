// Dependencies
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// API Imports
import { createVerifyBatch } from '../../api/batches';

// Icon Imports
import { UPLOAD_ICON } from '../../assets/icons/upload_icon.jsx';

// Style Imports
import styles from './Emails.module.css';

// Main Component
export default function EmailsUploadController() {
  const navigate = useNavigate();

  // States
  const [file, setFile] = useState(null);
  const [emails, setEmails] = useState([]);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // Handle parsing CSV
  const parseCSV = useCallback((text) => {
    try {
      // Split by newlines and filter out empty lines
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      
      // Validate each line is a valid email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const parsedEmails = lines.map(line => line.trim());
      
      // Validate all emails
      const invalidEmails = parsedEmails.filter(email => !emailRegex.test(email));
      if (invalidEmails.length > 0) {
        throw new Error(`Invalid email format found: ${invalidEmails.join(', ')}`);
      }

      return parsedEmails;
    } catch (err) {
      throw new Error('Failed to parse CSV file. Please ensure it contains one email per line.');
    }
  }, []);

  // Handle file change
  const handleFileChange = useCallback(async (event) => {
    const selectedFile = event.target.files[0];
    if (!selectedFile) return;

    if (selectedFile.type !== 'text/csv') {
      setError('Please upload a CSV file');
      return;
    }

    try {
      const text = await selectedFile.text();
      const parsedEmails = parseCSV(text);
      
      if (parsedEmails.length === 0) {
        throw new Error('No valid emails found in the file');
      }

      if (parsedEmails.length > 10000) {
        throw new Error('Maximum of 10,000 emails allowed per batch. Please reduce the number of emails and try again.');
      }

      setFile(selectedFile);
      setEmails(parsedEmails);
      setError(null);
    } catch (err) {
      setError(err.message);
      setFile(null);
      setEmails([]);
    }
  }, [parseCSV]);

  // Handle drag over
  const handleDragOver = useCallback((event) => {
    event.preventDefault();
    setIsDragging(true);
  }, []);

  // Handle drag leave
  const handleDragLeave = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  // Handle drop
  const handleDrop = useCallback((event) => {
    event.preventDefault();
    setIsDragging(false);
    
    const droppedFile = event.dataTransfer.files[0];
    if (!droppedFile) return;

    // Create a synthetic event to reuse the file change handler
    const syntheticEvent = {
      target: {
        files: [droppedFile]
      }
    };
    handleFileChange(syntheticEvent);
  }, [handleFileChange]);

  // Handle upload
  const handleUpload = async () => {
    if (!emails.length || !file) return;

    setIsUploading(true);
    setError(null);

    try {
      const response = await createVerifyBatch(emails, file.name);
      const batchId = response.data.id;
      navigate(`/${batchId}/details`);
    } catch (err) {
      setError('Failed to upload emails. Please try again.');
      console.error('Upload error:', err);
    } finally {
      setIsUploading(false);
    }
  };

  // Handle remove file
  const handleRemoveFile = () => {
    setFile(null);
    setEmails([]);
    setError(null);
  };

  // Render
  return (
    <div className={styles.uploadContainer}>
      <h1 className={styles.title}>Upload Emails</h1>
      <br/>
      <div
        className={`${styles.uploadArea} ${isDragging ? styles.uploadAreaActive : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => document.getElementById('fileInput').click()}
      >
        <div className={styles.uploadIcon}>
          {UPLOAD_ICON}
        </div>
        <p className={styles.uploadText}>
          {file ? file.name : 'Drag and drop your CSV file here'}
        </p>
        <p className={styles.uploadSubtext}>
          {file ? 'Click to change file' : 'or click to browse'}
        </p>
        <input
          id="fileInput"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {emails.length > 0 && (
        <div className={styles.previewContainer}>
          <div className={styles.previewHeader}>
            <h2 className={styles.subtitle}>Preview</h2>
            <span className={styles.previewCount}>
              {emails.length} {emails.length === 1 ? 'email' : 'emails'}
            </span>
          </div>
          <div className={styles.previewList}>
            {emails.slice(0, 10).map((email, index) => (
              <div key={index} className={styles.previewItem}>
                {email}
              </div>
            ))}
            {emails.length > 10 && (
              <div className={styles.previewItem}>
                ... and {emails.length - 10} more
              </div>
            )}
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
            <button
              className={`${styles.button} ${styles.buttonPrimary} ${isUploading ? styles.buttonDisabled : ''}`}
              onClick={handleUpload}
              disabled={isUploading}
            >
              {isUploading ? 'Uploading...' : 'Upload and Verify'}
            </button>
            <button
              className={`${styles.button} ${styles.buttonSecondary}`}
              onClick={handleRemoveFile}
              disabled={isUploading}
            >
              Remove File
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
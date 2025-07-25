// Dependencies
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// API Imports
import { createVerifyBatch, createCatchallBatch } from '../../api/batches';

// Component Imports
import { LoadingCircle } from '../../ui/components/LoadingCircle';
import UploadStageFileUpload from './UploadStages/FileUpload';
import UploadStagePreview from './UploadStages/Preview';
import UploadStageFinalize from './UploadStages/Finalize';

// Style Imports
import styles from './Emails.module.css';

// Main Component
export default function EmailsUploadController() {
  const navigate = useNavigate();

  // States
  const [page, setPage] = useState('upload');
  const [file, setFile] = useState(null);
  const [emails, setEmails] = useState([]);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  // Handle parsing CSV
  const parseCSV = useCallback((text) => {
    try {
      // Split by newlines and filter out empty lines
      const lines = text.split(/\r?\n/).filter(line => line.trim());
      
      // Parse CSV format and extract first column (email column)
      const parsedEmails = lines.map(line => {
        // Handle CSV format - split by comma and get first column
        const columns = line.split(',');
        // Remove quotes if present
        const email = columns[0].replace(/^["']|["']$/g, '').trim();
        return email;
      }).filter(email => email); // Filter out empty emails

      return parsedEmails;
    } catch (err) {
      console.log("ERR = ", err);
      throw new Error('Failed to parse CSV file. Please ensure it contains emails in the first column.');
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
      setPage('preview');

    } catch (err) {
      setError(err.message);
      setFile(null);
      setEmails([]);
    }
  }, [parseCSV]);

  // Handle upload
  const handleUpload = async (checkTyp) => {
    if (!emails.length || !file) return;

    setIsUploading(true);
    setError(null);

    try {
      const fileName = file.name || "New Upload";

      // Make request
      let response;
      if (checkTyp === 'verify') response = await createVerifyBatch(emails, fileName);
      else if (checkTyp === 'catchall') response = await createCatchallBatch(emails, fileName);
      else throw new Error('Invalid upload type');

      // Handle response
      if (response.status !== 200) throw new Error(response.data.message);
      else {
        // const batchId = response.data.id;
        // navigate(`/${checkTyp}/${batchId}/details`);
        navigate(`/home`);
      }

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
    setPage('upload');
  };

  // Render
  return (
    <>
      {(isUploading) && <LoadingCircle showBg={true} /> }
      <div className={styles.uploadContainer}>
        <h1 className={styles.title}>
          {(page === 'upload') && 'Upload CSV'}
          {(page === 'preview') && 'Preview'}
          {(page === 'finalize') && 'Choose Validation'}
        </h1>
        <br/>
        {(page === 'upload') && (
          <UploadStageFileUpload
            error={error}
            handleFileChange={handleFileChange}
          />
        )}
        {(page === 'preview') && (
          <UploadStagePreview
            fileName={file.name || "New Upload"}
            emailCount={emails.length}
            emailSlice={emails.slice(0, 10)}
            handleCancel={handleRemoveFile}
            handleContinue={()=>{setPage('finalize')}}
          />
        )}
        {(page === 'finalize') && (
          <UploadStageFinalize
            emailCount={emails.length}
            handleVerifyUpload={()=>{handleUpload('verify')}}
            handleCatchallUpload={()=>{handleUpload('catchall')}}
          />
        )}
      </div>
    </>
  );
}
// Dependencies
import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// API Imports
import { 
  createVerifyBatch, 
  createCatchallBatch,
  addToVerifyBatch,
  addToCatchallBatch,
  startVerifyBatchProcessing,
  startCatchallBatchProcessing 
} from '../../api/batches';

// Component Imports
import { LoadingCircle } from '../../ui/components/LoadingCircle';
import CreditsModal from '../../ui/components/CreditsModal';
import UploadStageFileUpload from './UploadStages/FileUpload';
import UploadStagePreview from './UploadStages/Preview';
import UploadStageFinalize from './UploadStages/Finalize';

// Style Imports
import styles from './Emails.module.css';

// Constants
const CHUNK_SIZE = 10000;

// Main Component
export default function EmailsUploadController() {
  const navigate = useNavigate();

  // States
  const [page, setPage] = useState('upload');
  const [file, setFile] = useState(null);
  const [emails, setEmails] = useState([]);
  const [error, setError] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showCreditsModal, setShowCreditsModal] = useState(false);
  const [creditsModalType, setCreditsModalType] = useState('verify');

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
      throw err;
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

    // Check file size (10MB limit)
    const maxFileSize = 10 * 1024 * 1024; // 10MB in bytes
    if (selectedFile.size > maxFileSize) {
      setError('File size must be less than 10MB. Please reduce the file size and try again.');
      return;
    }

    try {
      const text = await selectedFile.text();
      const parsedEmails = parseCSV(text);
      
      if (parsedEmails.length === 0) {
        throw new Error('No valid emails found in the file');
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

  // Handle upload with chunked progressive uploads
  const handleUpload = async (checkTyp) => {
    if (!emails.length || !file) return;

    setIsUploading(true);
    setError(null);

    try {
      const fileName = file.name || "New Upload";
      let batchId = null;

      // Process emails in chunks of 10k
      for (let i = 0; i < emails.length; i += CHUNK_SIZE) {
        const chunk = emails.slice(i, i + CHUNK_SIZE);
        
        try {
          if (batchId === null) {
            // First chunk: create new batch
            let createResponse;
            if (checkTyp === 'verify') {
              createResponse = await createVerifyBatch(chunk, fileName);
            } else if (checkTyp === 'catchall') {
              createResponse = await createCatchallBatch(chunk, fileName);
            } else throw new Error('Invalid upload type');

            if (createResponse.status !== 200) throw createResponse;
            
            batchId = createResponse.data.id;
            
          } else {
            // Subsequent chunks: add to existing batch
            let addResponse;
            if (checkTyp === 'verify') {
              addResponse = await addToVerifyBatch(batchId, chunk);
            } else {
              addResponse = await addToCatchallBatch(batchId, chunk);
            }

            if (addResponse.status !== 200) throw addResponse;
          }
        } catch (chunkError) {
          // If this is a 402 status code (insufficient credits), show credits modal
          if (chunkError.response && chunkError.response.status === 402) {
            setCreditsModalType(checkTyp);
            setShowCreditsModal(true);
            return;
          }
          // Re-throw other errors to be handled by outer catch
          throw chunkError;
        }
      }

      // Step 2: Start batch processing after all chunks uploaded
      let startResponse;
      if (checkTyp === 'verify') {
        startResponse = await startVerifyBatchProcessing(batchId);
      } else {
        startResponse = await startCatchallBatchProcessing(batchId);
      }

      if (startResponse.status !== 200) throw startResponse;

      // Navigate to home after successful upload and start
      navigate(`/home`);

    } catch (err) {
      // Check if it's a 402 status code (insufficient credits)
      if (err.response && err.response.status === 402) {
        setCreditsModalType(checkTyp);
        setShowCreditsModal(true);
      } else {
        // Other errors show generic message
        setError(err.message || 'Failed to upload emails. Please try again.');
      }

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
      <CreditsModal 
        isOpen={showCreditsModal}
        onClose={() => setShowCreditsModal(false)}
        checkType={creditsModalType}
      />
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
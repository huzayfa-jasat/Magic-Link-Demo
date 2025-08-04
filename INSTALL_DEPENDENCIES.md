# S3 Enrichment Feature - Required Dependencies

The S3 enrichment feature requires the following npm packages to be installed in the backend:

## Required Packages

### AWS SDK v3 (Recommended)
```bash
cd backend
npm install @aws-sdk/client-s3 @aws-sdk/lib-storage @aws-sdk/s3-request-presigner
```

### CSV/Excel Processing
```bash
npm install csv-parse csv-stringify xlsx
```

## Alternative: Using Existing AWS SDK v2

If you prefer to keep using the existing AWS SDK v2 (already installed), the S3 functions in `backend/routes/batches/funs_s3.js` would need to be modified to use the v2 API. The current implementation uses AWS SDK v3 for better streaming support and smaller bundle size.

## Environment Variables

Add the following to your `.env` file in the backend:

```env
S3_BUCKET=your-email-verification-bucket
S3_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
```

## Running the Migration

After installing dependencies, run the database migration:

```bash
# The migration file is located at: db/migrations/001_add_s3_metadata_columns.sql
# Run this SQL file against your database to add the required columns and tables
```

## Testing

To test the S3 upload functionality:
1. Create a new batch via the frontend
2. The file should be uploaded to S3 after batch creation
3. When the batch completes, exports will be generated automatically
4. Check the exports via the API: `GET /api/batches/:checkType/batch/:batchId/exports`
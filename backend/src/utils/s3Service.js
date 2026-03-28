// src/utils/s3Service.js
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const bucketName = process.env.S3_BUCKET_NAME;
const cloudFrontDomain = process.env.CLOUDFRONT_DOMAIN; // Optional: for direct CF access

/**
 * Upload buffer to S3
 */
async function uploadToS3(fileBuffer, key, mimeType) {
  const command = new PutObjectCommand({
    Bucket: bucketName,
    Key: key,
    Body: fileBuffer,
    ContentType: mimeType,
  });
  return s3Client.send(command);
}

/**
 * Generate a presigned URL for S3 access (valid for 1 hour by default)
 */
async function getPresignedUrl(key, expiresIn = 3600) {
  // If CloudFront is configured, use its domain for CDN acceleration
  if (cloudFrontDomain) {
    return `https://${cloudFrontDomain}/${key}`;
  }
  
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: key,
  });
  return getSignedUrl(s3Client, command, { expiresIn });
}

module.exports = {
  uploadToS3,
  getPresignedUrl,
  s3Client
};

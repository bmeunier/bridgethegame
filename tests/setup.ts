// Test setup file
import * as dotenv from "dotenv";

// Load test environment variables
dotenv.config({ path: ".env.test" });

// Set test environment defaults if not provided
process.env.NODE_ENV = "test";
process.env.DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || "test-api-key";
process.env.S3_BUCKET_NAME = process.env.S3_BUCKET_NAME || "test-bucket";
process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";

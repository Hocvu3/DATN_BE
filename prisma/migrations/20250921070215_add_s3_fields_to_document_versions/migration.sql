-- AlterTable
ALTER TABLE "public"."document_versions" ADD COLUMN     "s3_key" TEXT,
ADD COLUMN     "s3_url" TEXT;

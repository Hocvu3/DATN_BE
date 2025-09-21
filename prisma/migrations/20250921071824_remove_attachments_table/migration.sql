/*
  Warnings:

  - You are about to drop the `attachments` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "public"."attachments" DROP CONSTRAINT "attachments_document_id_fkey";

-- DropForeignKey
ALTER TABLE "public"."attachments" DROP CONSTRAINT "attachments_uploader_id_fkey";

-- DropTable
DROP TABLE "public"."attachments";

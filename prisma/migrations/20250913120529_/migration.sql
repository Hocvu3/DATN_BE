/*
  Warnings:

  - Added the required column `department_id` to the `documents` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."documents" ADD COLUMN     "department_id" TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

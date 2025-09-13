-- DropForeignKey
ALTER TABLE "public"."documents" DROP CONSTRAINT "documents_department_id_fkey";

-- AlterTable
ALTER TABLE "public"."documents" ALTER COLUMN "department_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

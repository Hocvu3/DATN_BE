/*
  Warnings:

  - A unique constraint covering the columns `[user_avatar_id]` on the table `assets` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."assets" ADD COLUMN     "user_avatar_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "assets_user_avatar_id_key" ON "public"."assets"("user_avatar_id");

-- AddForeignKey
ALTER TABLE "public"."assets" ADD CONSTRAINT "assets_user_avatar_id_fkey" FOREIGN KEY ("user_avatar_id") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

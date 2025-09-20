/*
  Warnings:

  - A unique constraint covering the columns `[invitation_token]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "public"."users" ADD COLUMN     "invitation_expires" TIMESTAMP(3),
ADD COLUMN     "invitation_token" TEXT,
ADD COLUMN     "invited_at" TIMESTAMP(3),
ADD COLUMN     "invited_by" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_invitation_token_key" ON "public"."users"("invitation_token");

-- AddForeignKey
ALTER TABLE "public"."users" ADD CONSTRAINT "users_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "AppLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "description" TEXT,
    "emoji" TEXT,
    "sortOrder" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppLink_userId_sortOrder_idx" ON "AppLink"("userId", "sortOrder");

-- AddForeignKey
ALTER TABLE "AppLink" ADD CONSTRAINT "AppLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


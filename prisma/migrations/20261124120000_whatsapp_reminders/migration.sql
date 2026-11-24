-- AlterTable
ALTER TABLE "Notification" ADD COLUMN     "whatsappSent" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "whatsappCodeAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "whatsappCodeExpires" TIMESTAMP(3),
ADD COLUMN     "whatsappCodeHash" TEXT,
ADD COLUMN     "whatsappNumber" TEXT,
ADD COLUMN     "whatsappReminders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "whatsappVerified" BOOLEAN NOT NULL DEFAULT false;


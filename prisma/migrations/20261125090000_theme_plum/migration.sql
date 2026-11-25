-- MyDiary theme: Plum is the default accent. Accounts still on the old default move to it;
-- accounts that picked their own accent keep it.
ALTER TABLE "UserSettings" ALTER COLUMN "accentColor" SET DEFAULT '#993399';
UPDATE "UserSettings" SET "accentColor" = '#993399' WHERE upper("accentColor") = '#635BFF';

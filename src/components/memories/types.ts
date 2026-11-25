import type { Media } from "@/lib/upload";

/** A memory as returned by /api/memories (see serializeMemory in src/lib/memories.ts). */
export type MemoryItem = {
  id: string;
  title: string;
  caption: string | null;
  date: string;
  /** yyyy-MM-dd in the user's timezone */
  day: string;
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  albumId: string | null;
  album: { id: string; title: string } | null;
  favorite: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  media: Media[];
  cover: Media | null;
  hasVideo: boolean;
  yearsAgo?: number;
};

export type AlbumItem = {
  id: string;
  title: string;
  description: string | null;
  coverMediaId: string | null;
  cover: Media | null;
  count: number;
  createdAt: string;
  updatedAt: string;
};

export type MonthCount = { key: string; count: number };

export type MemoryPage = { items: MemoryItem[]; nextCursor: string | null; months?: MonthCount[]; total?: number };

export type PhotoItem = {
  id: string;
  mediaId: string;
  media: Media;
  caption: string | null;
  tags: string[];
  takenOn: string;
  collectionId: string | null;
  collection: { id: string; title: string } | null;
  favorite: boolean;
  deletedAt: string | null;
  title: string;
  createdAt: string;
  updatedAt: string;
  yearsAgo?: number;
};

export type PhotoPage = { items: PhotoItem[]; nextCursor: string | null; months?: MonthCount[]; tags?: { tag: string; count: number }[]; total?: number };

export type CollectionItem = { id: string; title: string; description: string | null; count: number; cover: Media | null; createdAt: string; updatedAt: string };

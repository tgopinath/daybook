export type NoteTagRef = { id: string; name: string };
export type NoteCategoryRef = { id: string; name: string; color: string };

export type NoteListItem = {
  id: string;
  title: string;
  excerpt: string;
  pinned: boolean;
  favorite: boolean;
  categoryId: string | null;
  category: NoteCategoryRef | null;
  tags: NoteTagRef[];
  archivedAt: string | null;
  deletedAt: string | null;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoteFull = NoteListItem & { content: Record<string, unknown> };

export type NotesMeta = {
  categories: (NoteCategoryRef & { kind: string })[];
  tags: (NoteTagRef & { count: number })[];
};

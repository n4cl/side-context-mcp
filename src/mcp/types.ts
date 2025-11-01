export type EntryStatus = 'todo' | 'doing' | 'done';

export interface EntryRecord {
  readonly entryId: string;
  readonly title: string;
  readonly note: string;
  readonly status: EntryStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

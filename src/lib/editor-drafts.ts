export const DRAFT_KEY_PREFIX = 'cruz-lab-editor-draft:';
export const LEGACY_NEW_DRAFT_KEY = `${DRAFT_KEY_PREFIX}new`;
export const LOCAL_DRAFT_KEY_PREFIX = `${DRAFT_KEY_PREFIX}draft:`;

export function createLocalDraftKey(draftId: string): string {
  return `${LOCAL_DRAFT_KEY_PREFIX}${draftId}`;
}

export function isCreateModeDraftKey(draftKey: string): boolean {
  return draftKey === LEGACY_NEW_DRAFT_KEY || draftKey.startsWith(LOCAL_DRAFT_KEY_PREFIX);
}

export interface EditorDraftPayload {
  title?: string;
  description?: string;
  content?: string;
  tags?: string[];
  slug?: string;
  heroImage?: string;
  isPublic?: boolean;
  updatedDate?: string;
  readingTime?: number;
}

export interface StoredEditorDraft {
  id: string;
  draftKey: string;
  title: string;
  description: string;
  tags: string[];
  slug: string;
  updatedDate: Date;
  readingTime?: number;
}

export function saveEditorDraft(storage: Storage, draftKey: string, draft: EditorDraftPayload) {
  storage.setItem(draftKey, JSON.stringify(draft));
}

export function removeEditorDraft(storage: Storage, draftKey: string) {
  storage.removeItem(draftKey);
}

export function hasDraftContent(draft: EditorDraftPayload): boolean {
  return Boolean(
    draft.title?.trim() ||
      draft.description?.trim() ||
      draft.content?.trim() ||
      draft.slug?.trim() ||
      draft.heroImage?.trim() ||
      typeof draft.isPublic === 'boolean' ||
      draft.tags?.length
  );
}

export function getStoredEditorDrafts(storage: Storage): StoredEditorDraft[] {
  return Object.keys(storage)
    .filter((key) => key.startsWith(DRAFT_KEY_PREFIX))
    .map((draftKey) => {
      const raw = storage.getItem(draftKey);
      if (!raw) return null;

      try {
        const draft = JSON.parse(raw) as EditorDraftPayload;
        const fallbackSlug = draftKey.replace(DRAFT_KEY_PREFIX, '');
        const slug = draft.slug || (fallbackSlug === 'new' ? '' : fallbackSlug);
        const updatedDate = draft.updatedDate ? new Date(draft.updatedDate) : new Date();

        return {
          id: draftKey,
          draftKey,
          title: draft.title?.trim() || '제목 없는 로컬 초안',
          description: draft.description?.trim() || '',
          tags: Array.isArray(draft.tags) ? draft.tags.filter(Boolean) : [],
          slug,
          updatedDate,
          readingTime: draft.readingTime,
        } satisfies StoredEditorDraft;
      } catch {
        return null;
      }
    })
    .filter((draft): draft is StoredEditorDraft => draft !== null)
    .sort((a, b) => b.updatedDate.getTime() - a.updatedDate.getTime());
}

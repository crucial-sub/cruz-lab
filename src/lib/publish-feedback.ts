export interface PublishFeedback {
  slug: string;
  title: string;
  filePath: string;
  publicUrl: string;
  githubFileUrl: string;
  githubCommitUrl?: string;
  githubCommitSha?: string;
  publishedAt: string;
}

export const LAST_PUBLISH_FEEDBACK_KEY = 'cruz-lab:last-publish-feedback';

export function saveLastPublishFeedback(storage: Storage, feedback: PublishFeedback) {
  storage.setItem(LAST_PUBLISH_FEEDBACK_KEY, JSON.stringify(feedback));
}

export function readLastPublishFeedback(storage: Storage): PublishFeedback | null {
  const raw = storage.getItem(LAST_PUBLISH_FEEDBACK_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as PublishFeedback;
  } catch {
    return null;
  }
}

export function clearLastPublishFeedback(storage: Storage) {
  storage.removeItem(LAST_PUBLISH_FEEDBACK_KEY);
}

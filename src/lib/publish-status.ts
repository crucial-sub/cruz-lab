export interface PublishStatusCheck {
  id: string;
  label: string;
  ready: boolean;
  detail: string;
  kind: 'active' | 'config';
}

export interface PublishStatusPayload {
  ready: boolean;
  verifiedAt: string;
  checks: PublishStatusCheck[];
  target: {
    publishMode: 'firestore-direct';
    repository: string;
    branch: string;
    backupPath: string;
    siteUrl: string;
    currentOrigin: string;
  };
}

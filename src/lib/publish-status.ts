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
    repository: string;
    branch: string;
    postsPath: string;
    siteUrl: string;
    currentOrigin: string;
  };
}

export interface PublishStatusCheck {
  id: string;
  label: string;
  ready: boolean;
  detail: string;
}

export interface PublishStatusPayload {
  ready: boolean;
  checks: PublishStatusCheck[];
  target: {
    repository: string;
    branch: string;
    postsPath: string;
    siteUrl: string;
  };
}

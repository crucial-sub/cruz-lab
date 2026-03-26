export interface PublishVerificationCheck {
  id: string;
  label: string;
  ready: boolean;
  detail: string;
}

export interface PublishVerificationPayload {
  ready: boolean;
  verifiedAt: string;
  slug: string;
  filePath?: string;
  publicUrl: string;
  checks: PublishVerificationCheck[];
}

export interface Secret {
  id: string;
  key: string;
  description?: string;
  date_created: string;
  date_updated?: string;
}

export interface CreateSecretRequest {
  key: string;
  value: string;
  description?: string;
}

export interface UpdateSecretRequest {
  value?: string;
  description?: string;
}

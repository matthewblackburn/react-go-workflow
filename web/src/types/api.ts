export interface APIError {
  code: string;
  message: string;
  details?: Record<string, string>;
}

export interface ListResponse<T> {
  data: T[];
  pagination: PageResponse;
}

export interface PageResponse {
  next_cursor?: string;
  has_more: boolean;
  limit: number;
}

export type HttpHeaders = Readonly<Record<string, string | readonly string[]>>;

export interface HttpRequestSnapshot {
  method: string;
  url: string;
  headers: HttpHeaders;
  body?: unknown;
}

export interface HttpResponseSnapshot {
  status: number;
  headers: HttpHeaders;
  body?: unknown;
}

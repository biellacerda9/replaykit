export type HttpHeaders = Readonly<Record<string, string | readonly string[]>>;

export interface HttpRequestSnapshot {
  readonly method: string;
  readonly url: string;
  readonly headers: HttpHeaders;
  readonly body?: unknown;
}

export interface HttpResponseSnapshot {
  readonly status: number;
  readonly headers: HttpHeaders;
  readonly body?: unknown;
}

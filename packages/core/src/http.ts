export type HttpHeaders = Readonly<Record<string, string | readonly string[]>>;

export interface BodyOmission {
  readonly reason: "size-limit";
  readonly sizeBytes: number;
}

export interface HttpRequestSnapshot {
  readonly method: string;
  readonly url: string;
  readonly headers: HttpHeaders;
  readonly body?: unknown;
  readonly bodyOmitted?: BodyOmission;
}

export interface HttpResponseSnapshot {
  readonly status: number;
  readonly headers: HttpHeaders;
  readonly body?: unknown;
  readonly bodyOmitted?: BodyOmission;
}

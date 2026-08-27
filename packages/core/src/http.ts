export type HttpHeaders = Readonly<Record<string, string | readonly string[]>>;

export interface BodyOmissionSize {
  readonly reason: "size-limit";
  readonly sizeBytes: number;
}

export interface BodyOmissionNotJson {
  readonly reason: "unsupported-content-type";
  readonly contentType: string;
}

export type BodyOmission = BodyOmissionSize | BodyOmissionNotJson;

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

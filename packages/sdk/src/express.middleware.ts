import { randomUUID } from "node:crypto";

import {
  finishExecution,
  startExecution,
  type BodyOmission,
  type Execution,
} from "@replaykit/core";
import type { NextFunction, Request, Response } from "express";

const sensitiveHeaderNames = [
  "authorization",
  "proxy-authorization",
  "cookie",
  "set-cookie",
  "x-api-key",
];

const sensitiveHeaderKeywords = ["token", "secret", "password", "key"];
const defaultMaxBodySizeBytes = 100 * 1024;

export interface ReplayKitMiddlewareOptions {
  readonly onExecutionFinished: (execution: Execution) => void;
  //ignora rotas
  readonly ignorePaths?: readonly string[];

  //ignora rotas e suas subrotas
  readonly ignorePathPrefixes?: readonly string[];

  readonly sensitiveBodyFields?: readonly string[];
  readonly maxBodySizeBytes?: number;
}

interface CapturedBody {
  readonly body?: unknown;
  readonly bodyOmitted?: BodyOmission;
}

function getPathname(url: string): string {
  return new URL(url, "http://localhost").pathname;
}

function shouldIgnorePath(
  pathname: string,
  options: ReplayKitMiddlewareOptions,
): boolean {
  if (options.ignorePaths?.includes(pathname)) {
    return true;
  }

  return (
    options.ignorePathPrefixes?.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    ) ?? false
  );
}

function sanitizeHeaders(
  headers: Record<string, string | string[] | number | undefined>,
) {
  const safeHeaders: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();

    if (
      sensitiveHeaderNames.includes(lowerKey) ||
      sensitiveHeaderKeywords.some((keyword) => lowerKey.includes(keyword))
    ) {
      if (lowerKey === "authorization" || lowerKey === "proxy-authorization") {
        const authorizationValue = Array.isArray(value) ? value[0] : value;
        const scheme = String(authorizationValue ?? "").split(" ")[0];

        safeHeaders[key] = scheme ? `${scheme} [REDACTED]` : "[REDACTED]";
      } else {
        safeHeaders[key] = "[REDACTED]";
      }
    } else {
      safeHeaders[key] = Array.isArray(value)
        ? value.join(", ")
        : String(value ?? "");
    }
  }
  return safeHeaders;
}

//unknown porque o json pode ser qualquer coisa
function sanitizeBody(
  body: unknown,
  sensitiveBodyFields: readonly string[] | undefined,
): unknown {
  if (body === null || body === undefined) {
    return body;
  }

  if (Array.isArray(body)) {
    return body.map((item) => sanitizeBody(item, sensitiveBodyFields));
  }

  if (typeof body === "object" && body !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      const lowerKey = key.toLowerCase();
      if (
        sensitiveHeaderKeywords.some((keyword) => lowerKey.includes(keyword)) ||
        sensitiveHeaderNames.includes(lowerKey) ||
        sensitiveBodyFields?.some((field) => field.toLowerCase() === lowerKey)
      ) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeBody(value, sensitiveBodyFields);
      }
    }

    return sanitized;
  }

  return body;
}

function isJson(contentType: string | undefined): boolean {
  return contentType?.toLowerCase().includes("application/json") ?? false;
}

function captureBody(
  body: unknown,
  sensitiveBodyFields: readonly string[] | undefined,
  maxBodySizeBytes: number,
  contentType: string | undefined,
): CapturedBody {
  if (body === undefined) {
    return {};
  }

  if (contentType !== undefined && !isJson(contentType)) {
    return {
      bodyOmitted: {
        reason: "unsupported-content-type",
        contentType,
      },
    };
  }

  const sanitizedBody = sanitizeBody(body, sensitiveBodyFields);
  const serializedBody = JSON.stringify(sanitizedBody);
  const sizeBytes = Buffer.byteLength(serializedBody ?? "", "utf8");

  if (sizeBytes > maxBodySizeBytes) {
    return {
      bodyOmitted: {
        reason: "size-limit",
        sizeBytes,
      },
    };
  }

  return sanitizedBody === undefined ? {} : { body: sanitizedBody };
}

//cria um middleware básico que registra uma requisição e resposta HTTP, e chama a função onExecutionFinished quando a execução termina
export function replayKitMiddleware(options: ReplayKitMiddlewareOptions) {
  const maxBodySizeBytes = options.maxBodySizeBytes ?? defaultMaxBodySizeBytes;

  if (!Number.isInteger(maxBodySizeBytes) || maxBodySizeBytes < 0) {
    throw new Error("maxBodySizeBytes must be a non-negative integer");
  }

  return function middleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
    if (shouldIgnorePath(getPathname(req.originalUrl), options)) {
      next();
      return;
    }
    const contentType = req.get("Content-Type");

    const requestBody = captureBody(
      req.body,
      options.sensitiveBodyFields,
      maxBodySizeBytes,
      contentType,
    );

    const execution = startExecution({
      //o sdk gera o id e o horario porque vai ser ele quem vai lidar com o mundo real -> o core não faz isso porque ele só recebe os dados e aplica as regras

      // -> sdk = contato com user
      // -> core = regras de negocio
      id: randomUUID(),
      startedAt: new Date().toISOString(),
      request: {
        method: req.method,
        url: req.originalUrl,
        headers: sanitizeHeaders(req.headers),
        ...requestBody,
      },
    });

    // on é um ouvinte de eventos
    let responseBody: CapturedBody = {};

    res.on("finish", () => {
      const finishedExecution = finishExecution(
        execution,
        {
          status: res.statusCode,
          headers: sanitizeHeaders(res.getHeaders()),
          ...responseBody,
        },
        new Date().toISOString(),
      );

      options.onExecutionFinished(finishedExecution);
    });

    //aqui faço uma copia do json original, e sobrescrevo o json do express para interceptar a resposta e sanitizar o body antes de enviar para o core
    const originalJson = res.json;

    res.json = function (body: unknown) {
      responseBody = captureBody(
        body,
        options.sensitiveBodyFields,
        maxBodySizeBytes,
        "application/json",
      );
      return originalJson.call(this, body);
    };

    next();
  };
}

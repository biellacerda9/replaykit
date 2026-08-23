import { randomUUID } from "node:crypto";

import {
  finishExecution,
  startExecution,
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

export interface ReplayKitMiddlewareOptions {
  readonly onExecutionFinished: (execution: Execution) => void;
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
function sanitizeBody(body: unknown): unknown {
  if (body === null || body === undefined) {
    return body;
  }

  if (Array.isArray(body)) {
    return body.map(sanitizeBody);
  }

  if (typeof body === "object" && body !== null) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      const lowerKey = key.toLowerCase();
      if (
        sensitiveHeaderKeywords.some((keyword) => lowerKey.includes(keyword)) ||
        sensitiveHeaderNames.includes(lowerKey)
      ) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeBody(value);
      }
    }
    return sanitized;
  }

  return body;
}

//cria um middleware básico que registra uma requisição e resposta HTTP, e chama a função onExecutionFinished quando a execução termina
export function replayKitMiddleware(options: ReplayKitMiddlewareOptions) {
  return function middleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): void {
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
        body: sanitizeBody(req.body),
      },
    });

    // on é um ouvinte de eventos
    res.on("finish", () => {
      const finishedExecution = finishExecution(
        execution,
        {
          status: res.statusCode,
          headers: sanitizeHeaders(res.getHeaders()),
          body: responseBody,
        },
        new Date().toISOString(),
      );

      options.onExecutionFinished(finishedExecution);
    });

    //aqui faço uma copia do json original, e sobrescrevo o json do express para interceptar a resposta e sanitizar o body antes de enviar para o core
    const originalJson = res.json;

    let responseBody: unknown;
    res.json = function (body: unknown) {
      responseBody = sanitizeBody(body);
      return originalJson.call(this, body);
    };

    next();
  };
}

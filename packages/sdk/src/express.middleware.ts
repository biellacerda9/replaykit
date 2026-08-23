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
      if (
        lowerKey === "authorization" ||
        lowerKey === "proxy-authorization"
      ) {
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
      },
    });

    // on é um ouvinte de eventos
    res.on("finish", () => {
      const finishedExecution = finishExecution(
        execution,
        {
          status: res.statusCode,
          headers: sanitizeHeaders(res.getHeaders()),
        },
        new Date().toISOString(),
      );

      options.onExecutionFinished(finishedExecution);
    });

    next();
  };
}

import { randomUUID } from "node:crypto";

import {
  finishExecution,
  startExecution,
  type Execution,
} from "@replaykit/core";
import type { NextFunction, Request, Response } from "express";

export interface ReplayKitMiddlewareOptions {
  readonly onExecutionFinished: (execution: Execution) => void;
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
        headers: {},
      },
    });

    // on é um ouvinte de eventos
    res.on("finish", () => {
      const finishedExecution = finishExecution(
        execution,
        {
          status: res.statusCode,
          headers: {},
        },
        new Date().toISOString(),
      );

      options.onExecutionFinished(finishedExecution);
    });

    next();
  };
}

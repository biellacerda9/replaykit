# ReplayKit

Capture uma execução HTTP de uma aplicação Node.js e reproduza-a sem repetir suas chamadas externas.

## Estado atual

O projeto está sendo construído do zero. A primeira etapa é definir o domínio central de uma execução antes de instrumentar qualquer framework.

## Estrutura

```text
packages/
└── core/       Tipos e regras independentes de framework
```

## Desenvolvimento

Requisitos:

- Node.js 22 ou superior
- pnpm 11.22.0

```bash
pnpm install
pnpm check
```

Comandos disponíveis:

| Comando          | Responsabilidade                     |
| ---------------- | ------------------------------------ |
| `pnpm build`     | Compila todos os pacotes             |
| `pnpm typecheck` | Verifica os tipos sem gerar arquivos |
| `pnpm lint`      | Analisa problemas estáticos          |
| `pnpm format`    | Formata o repositório                |
| `pnpm test`      | Executa os testes                    |
| `pnpm check`     | Executa toda a validação local       |

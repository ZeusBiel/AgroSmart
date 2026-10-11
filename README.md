# AgroSmart

Plataforma web que monitora uma fazenda irrigada e automatiza a irrigação a partir de dados de sensores (Fase 6).

**Fluxo:** sensores IoT (simulados) → processamento → análise → automação → painel.

| Requisito | Como é atendido |
|---|---|
| Coleta de dados | 21 sensores simulados (clima e solo de 4 talhões) enviam leituras a cada 10 min, com ruído e falhas. |
| Processamento | Validação, correção de leituras inválidas, suavização e série temporal de 72 h. |
| Automação inteligente | Previsão da umidade do solo e 9 regras que abrem/fecham válvulas e emitem alertas, com o motivo registrado. |
| Visualização | Painel com indicadores, mapa, gráficos, recomendações e log de decisões. |

## Como rodar

Requer Node.js 22.12+.

```bash
npm install
npm run dev
```

Entre com qualquer e-mail válido e senha de 6+ caracteres, ou use **Entrar em modo demonstração**. Tudo roda no navegador, sem backend.

```bash
npm test        # testes automatizados
npm run build   # build de produção
```

## Estrutura

```
src/
  iot/         simulador dos sensores
  pipeline/    validação e série temporal
  analytics/   previsões, indicadores e recomendações
  automation/  regras de irrigação e alertas
  screens/     telas da interface
```

## Integrante

Gabriel Oliveira - RM 98565

# Lunar H2O Rover

Protótipo web mobile-first para monitorar uma missão lunar fictícia de extração de água em gelo no polo sul lunar. O app usa dados mockados no front-end e simula o painel de um operador de missão.

## Stack

- React
- TypeScript
- Vite
- Lucide React

## Telas

- Login com validação de e-mail e senha mínima de 6 caracteres.
- Dashboard da missão com volume coletado, temperatura, gelo detectado, bateria e progresso de coleta.
- Status do rover com telemetria, sensores IoT e ações simuladas.
- Histórico de relatórios com volume, qualidade do gelo e resultado da operação.

## Integrantes

- Israel Igarashi - RM 98359
- Leonardo Bernardes - RM 99788
- Matheus Medeiros - RM 97774
- Ryan Aquino - RM 550422
- Gabriel Oliveira - RM 98565

## Como rodar

```bash
npm install
npm run dev
```

Para build de produção:

```bash
npm run build
```

## Autenticação mockada

O login aceita qualquer e-mail em formato válido e qualquer senha com 6 ou mais caracteres. Não há backend real nem persistência de sessão.

## Dados mockados

Os modelos estão em `src/types.ts` e os dados iniciais em `src/data/mockData.ts`.

## Asset visual

A imagem `public/shackleton-crater.jpeg` vem da NASA:
https://www.nasa.gov/missions/lro/nasa-moon-camera-mosaic-sheds-light-on-lunar-south-pole/

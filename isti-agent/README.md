# IstiAgent

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.1.7.

## Introducing

IstiAgent is a Claude-based agent that I’m developing using the Claude Messages API. I try to use AI-generated code for most development tasks, except for the parts that help me learn and understand the Claude messaging protocol itself.

## Cloudflare Worker

Le backend est versionné dans `worker/src/index.ts` et sa configuration dans `wrangler.jsonc`.

1. Installer les dépendances : `bun install`.
2. Créer le secret local : `cp .dev.vars.example .dev.vars`, puis renseigner `ANTHROPIC_API_KEY`.
3. Lancer le backend local : `bun run worker:dev` (par défaut : `http://localhost:8787`).
4. Lancer Angular dans un autre terminal : `bun start` (port 4200). Depuis `localhost`, le frontend cible automatiquement `http://localhost:8787`; ailleurs il cible le Worker publié.

Pour le premier déploiement manuel, s'authentifier avec `bunx wrangler login`, enregistrer le secret de production avec `bunx wrangler secret put ANTHROPIC_API_KEY`, puis lancer `bun run worker:deploy`.

Le workflow GitHub Actions `.github/workflows/deploy-worker.yml` déploie le Worker à chaque push sur `main` qui modifie le backend. Dans les secrets GitHub du dépôt, ajouter :

- `CLOUDFLARE_API_TOKEN` : token Cloudflare limité à la permission **Workers Scripts:Edit** du compte visé ;
- `CLOUDFLARE_ACCOUNT_ID` : identifiant du compte Cloudflare.

`ANTHROPIC_API_KEY` n'est pas un secret GitHub : il est stocké chiffré côté Worker via `wrangler secret put`, et reste présent lors des déploiements de code. Pour autoriser une URL de frontend de production, remplacer la valeur de `ALLOWED_ORIGIN` dans `wrangler.jsonc`, puis redéployer.

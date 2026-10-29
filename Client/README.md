# Client (Angular 22 + Angular Material)

- `npm start` — dev server on :4200, proxies `/api` and `/uploads` to `localhost:3000` (`proxy.conf.json`)
- `npm run build` — production build into `dist/Client/browser`
- `npm test` — unit tests (Vitest)

Theme and palette tokens live in `src/styles.scss`. See the root README for the full project.

## Component structure

Every component lives in its own folder with separate files — no inline templates or styles:

```
src/app/pages/cart/
├── cart.ts     # class, inputs, signals, logic
├── cart.html   # template
└── cart.css    # component styles (global tokens/theme: src/styles.scss)
```

Folders: `core/` (services, guards, interceptor, models), `shared/` (header, footer, product-card, dialogs), `pages/` (routed screens; admin screens under `pages/admin/`).

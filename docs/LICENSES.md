# Third-Party License Inventory

Licenses of the direct dependencies used by the VRXE Repair Ticket System. Versions and license fields were read from the installed `node_modules` (see [regenerating](#regenerating-this-list) to reproduce authoritatively, including transitive dependencies).

**Summary:** all dependencies are **permissive** (MIT / ISC). One package (`jszip`) is dual-licensed and is used under its **MIT** option. No copyleft (GPL/AGPL) obligations apply to the shipped product.

## Runtime dependencies (shipped to users)
| Package | Version | License |
|---|---|---|
| @supabase/supabase-js | 2.107.0 | MIT |
| date-fns | 3.6.0 | MIT |
| exceljs | 4.4.0 | MIT |
| jspdf | 4.2.1 | MIT |
| jspdf-autotable | 5.0.8 | MIT |
| jszip | 3.10.1 | MIT OR GPL-3.0-or-later → **used under MIT** |
| lucide-react | 0.383.0 | ISC |
| react | 18.3.1 | MIT |
| react-dom | 18.3.1 | MIT |
| react-router-dom | 6.30.4 | MIT |

### Backend (Edge Functions, Deno)
| Package | Version | License |
|---|---|---|
| web-push | 3.6.7 | MIT |
| @supabase/supabase-js (npm:) | 2.x | MIT |

## Dev / build dependencies (not shipped to end users)
| Package | Version | License |
|---|---|---|
| @testing-library/jest-dom | 6.9.1 | MIT |
| @testing-library/react | 16.3.2 | MIT |
| @testing-library/user-event | 14.6.1 | MIT |
| @types/react | 18.3.30 | MIT |
| @types/react-dom | 18.3.7 | MIT |
| @vitejs/plugin-react | 4.7.0 | MIT |
| autoprefixer | 10.5.0 | MIT |
| eslint | 9.39.4 | MIT |
| eslint-plugin-react-hooks | 5.2.0 | MIT |
| eslint-plugin-react-refresh | 0.4.26 | MIT |
| jsdom | 29.1.1 | MIT |
| postcss | 8.5.15 | MIT |
| supabase (CLI) | 2.108.0 | MIT |
| tailwindcss | 3.4.19 | MIT |
| vite | 7.3.5 | MIT |
| vite-plugin-pwa | 1.3.0 | MIT |
| vitest | 4.1.9 | MIT |
| workbox-core / -expiration / -precaching / -routing / -strategies | 7.4.1 | MIT |

## Hosted services (separate terms of service, not software licenses)
| Service | Terms |
|---|---|
| **Supabase** | Database/Edge Functions/Storage — governed by Supabase's plan terms |
| **Vercel** | Hosting — governed by Vercel's plan terms |
| **Web Push services** (browser vendors' push endpoints) | Used via the standard Web Push protocol |

## Regenerating this list
The table above covers **direct** dependencies. For a full, authoritative report including all **transitive** dependencies, run one of:

```bash
# Quick summary of all licenses in the dependency tree:
npx license-checker --summary

# Full per-package detail:
npx license-checker --production --json > licenses-full.json
```

Run after `npm install` so the tree is complete. Re-run whenever dependencies change.

> Compliance note: MIT and ISC permit commercial use, modification, and distribution, and only require preserving the copyright/permission notice. No action is needed for normal hosted operation of this app; if you redistribute the source or a bundled build, retain the upstream license notices.

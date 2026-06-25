# NV Automation

Local-only tool for NV Rev2 survey cloning. Everything is stored as files under `projects/` — no database, no cloud.

## Project folder layout

```
projects/
  ACTIVE/                        # one folder per project (slug = folder name)
    meta.json                    # settings, LOI, links, timestamps
    project.json                 # worker-compatible config (auto-synced)
    Definition.json              # questionnaire structure
    Data.json                    # active dataset snapshot (auto-synced)
    explore-runs.json            # explore history
    datasets/
      manifest.json              # which dataset is active
      default.json               # interview rows
      {id}.sav                   # optional source SAV
    explore-cache/               # screenshots from explore/discovery
```

The UI reads and writes these files directly. Playwright workers use the synced `project.json`, `Definition.json`, and `Data.json`.

## Setup

```bash
npm install
npm run playwright:install
pip install pyreadstat
npm run dev          # http://localhost:3000
```

## Workflow

1. **New project** — sidebar or dashboard
2. **Setup** — live link (NV login page), test link (explore preview), LOI, workers
3. **Datasets** — upload `.sav` (stored in `projects/{slug}/datasets/`)
4. **Definition** — review questions, fix gaps from data
5. **Explore** — parse test link into `Definition.json`
6. **Run** — start Playwright workers

## CLI

```bash
npm run fix-gaps -- ACTIVE
npm run parity-test -- ACTIVE
npm run run-interview -- ACTIVE 0 worker-1
```

## Why filesystem-only?

For a personal local tool this is simpler than SQLite or Supabase:

- Open `projects/ACTIVE/` in your editor and see everything
- Easy to back up (copy the folder)
- No `data/nv.db` or seed step
- Workers already expect JSON files in `projects/`

Multiple datasets per project are supported via `datasets/manifest.json`.

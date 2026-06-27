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
    explore-cache/               # screenshots and trail from explore
```

The UI reads and writes these files directly. Playwright workers use the synced `project.json`, `Definition.json`, and `Data.json`.

## Setup

```bash
npm install
npm run dev          # installs Playwright Chromium on first run, then http://localhost:3000
pip install pyreadstat   # for SAV import
```

## Workflow

1. **New project** — sidebar or dashboard
2. **Setup** — live link (NV login page), test link (explore preview), LOI, workers
3. **Datasets** — upload `.sav` (stored in `projects/{slug}/datasets/`)
4. **Definition** — review questions, fix gaps from data
5. **Explore** — parse test link into `Definition.json`
6. **Run** — configure caller profiles in Setup, then start live workers from the Run tab

```bash
npm run explore -- ACTIVE
```

## Answer policy (explore + live runs)

Each question in `Definition.json` has an answer policy:

| Situation | Policy |
|-----------|--------|
| **In dataset** | `Maintain` — use each row's SAV value (explore uses the seed row) |
| **In dataset** | `Split` — weighted random across codes (explore uses a deterministic seed per row) |
| **Not in dataset · Open** | Fixed open text (`FixedAnswer`) — required |
| **Not in dataset · Coded** | Fixed code **or** Split weights |

Guided explore **blocks** when a question has no configured policy (no silent fallbacks). After explore, newly discovered questions missing configuration appear in Definition review.

Legacy `ExploreOverride` fields are migrated to `FixedAnswer` on read.

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

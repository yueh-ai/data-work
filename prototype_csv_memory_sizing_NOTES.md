# Prototype Notes: CSV Memory Sizing

This is the durable note for the throwaway prototype in `prototype_csv_memory_sizing.py`.

## Question

What CSV row counts, column counts, and version counts can the hosted Companion Website reasonably support before storage, backend parse memory, or browser preview memory becomes risky?

Source handoff:

`/var/folders/_n/wfz8q8rs0tzg58ytwt0kyd600000gn/T/csv-data-work-handoff.md`

## Run Commands

Preset profiles:

```sh
python3 prototype_csv_memory_sizing.py
```

Custom profile:

```sh
python3 prototype_csv_memory_sizing.py --rows 500000 --cols 500 --versions 10 --preview-rows 10000
```

Custom backend cache profile:

```sh
python3 prototype_csv_memory_sizing.py --rows 500000 --cols 500 --versions 10 --preview-rows 10000 --backend-cached-versions 10
```

## First Observations

- Full backend parse memory scales with the entire CSV and becomes risky around the larger profiles.
- Browser preview memory scales with preview rows x columns, not total rows, as long as the Companion Website never loads the full CSV into browser state.
- Version history mostly multiplies storage, not browser memory, if the Companion Website stores compressed CSV objects and keeps preview artifacts bounded.
- A 1,000,000 x 100 dataset estimates at about 1.3 GiB raw CSV, 2.7 GiB pandas default memory, and 4.8 GiB backend full-parse peak.
- A 500,000 x 500 dataset estimates at about 3.2 GiB raw CSV, 6.7 GiB pandas default memory, and 11.9 GiB backend full-parse peak.
- At 10,000 preview rows, the 500,000 x 500 profile estimates about 346 MiB in browser preview state, which argues for lower preview caps, column virtualization, or paginated/windowed preview.

## Backend Service Consumption

Backend consumption is not the same as browser consumption unless the backend service keeps preview data resident in process memory.

Separate the backend into three buckets:

- Durable object storage: compressed Working CSV Versions. This scales with retained versions and full dataset size.
- Durable metadata and preview artifacts: schema, profile summaries, and bounded preview rows per version. This scales with retained versions and preview rows x columns.
- Resident service memory: upload buffers, active parser/profiler state, metadata, and a bounded cache of preview artifacts. This should not include full CSV versions.

The bad design is to keep every retained Working CSV Version as dataframe-like service memory. In the prototype, 10 retained versions of a 500,000 x 500 dataset estimate at about 67 GiB of backend RAM in that design.

For the same 500,000 x 500 dataset with 10 retained versions and 10,000 preview rows:

- Caching one backend preview artifact estimates at about 115 MiB steady backend RAM.
- Caching all 10 backend preview artifacts estimates at about 1.0 GiB steady backend RAM.
- Full backend parse peak still estimates at about 11.9 GiB, so full parse should be avoided.

For a 1,000,000 x 100 dataset with 10 retained versions and 10,000 preview rows:

- Caching all 10 preview artifacts estimates at about 212 MiB steady backend RAM.
- Storing all 10 versions as dataframe-like service memory estimates at about 27 GiB.

So the backend service should store versions as compressed objects, store bounded preview/profiling artifacts, and cache at most a small number of active preview artifacts in RAM.

## Early Architecture Signal

The likely v1 shape is object storage for uploaded Working CSV Versions, compressed at rest, with bounded preview/profiling artifacts per version. The backend should stream or sample uploaded CSVs for metadata whenever full parse memory would enter GiB scale. The browser should render metadata plus a sampled or paginated preview, never the full dataset.

This is still evidence for the version-history decision, not the decision itself.

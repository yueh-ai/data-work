#!/usr/bin/env python3
"""
THROWAWAY PROTOTYPE: CSV memory and storage sizing.

Question:
What CSV row counts, column counts, and version counts can the hosted
Companion Website reasonably support before storage, backend parse memory,
or browser preview memory becomes risky?

Run:
python3 prototype_csv_memory_sizing.py
python3 prototype_csv_memory_sizing.py --rows 250000 --cols 80 --versions 10 --preview-rows 2000

This is a deliberately simple estimator. It is meant to make scale effects
visible during architecture discussion, then be deleted or replaced.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from math import floor
from typing import Iterable


MIB = 1024**2
GIB = 1024**3


@dataclass(frozen=True)
class DataMix:
    numeric: float = 0.60
    categorical: float = 0.25
    boolean_or_small_int: float = 0.10
    text: float = 0.05


@dataclass(frozen=True)
class Assumptions:
    numeric_csv_bytes: int = 10
    categorical_csv_bytes: int = 12
    boolean_csv_bytes: int = 1
    text_csv_bytes: int = 64
    header_name_bytes: int = 12
    csv_string_quote_overhead_ratio: float = 0.05
    compression_low_ratio: float = 2.0
    compression_high_ratio: float = 5.0
    object_string_overhead_bytes: int = 49
    object_pointer_bytes: int = 8
    pandas_numeric_bytes: int = 8
    pandas_bool_default_bytes: int = 8
    pandas_bool_optimized_bytes: int = 1
    category_cardinality_per_column: int = 100
    category_code_bytes: int = 1
    parser_peak_dataframe_multiplier: float = 1.30
    streaming_backend_floor_bytes: int = 64 * MIB
    streaming_backend_ceiling_bytes: int = 512 * MIB
    streaming_backend_file_fraction: float = 0.02
    backend_preview_payload_overhead_ratio: float = 1.60
    backend_metadata_fixed_per_version_bytes: int = 32 * 1024
    backend_metadata_per_column_bytes: int = 2 * 1024
    backend_service_base_session_bytes: int = 64 * 1024
    browser_cell_overhead_bytes: int = 48
    browser_utf16_multiplier: int = 2
    browser_column_metadata_bytes: int = 512


@dataclass(frozen=True)
class Scenario:
    name: str
    rows: int
    cols: int
    versions: int = 5
    preview_rows: int = 1_000
    backend_cached_versions: int = 1


@dataclass(frozen=True)
class Estimate:
    scenario: Scenario
    columns: dict[str, int]
    raw_csv_bytes: float
    compressed_low_bytes: float
    compressed_high_bytes: float
    pandas_default_bytes: float
    pandas_optimized_bytes: float
    backend_full_parse_peak_bytes: float
    backend_streaming_peak_bytes: float
    backend_preview_artifact_bytes: float
    backend_metadata_per_version_bytes: float
    backend_preview_artifacts_storage_bytes: float
    backend_metadata_storage_bytes: float
    backend_service_steady_ram_bytes: float
    backend_service_upload_peak_bytes: float
    backend_bad_full_state_ram_bytes: float
    browser_preview_bytes: float


PRESETS = [
    Scenario("Small", 10_000, 30),
    Scenario("Medium", 100_000, 100),
    Scenario("Large", 1_000_000, 100),
    Scenario("Wide ML", 500_000, 500),
    Scenario("Very large", 10_000_000, 200),
]


def fmt_int(value: int | float) -> str:
    return f"{int(round(value)):,}"


def fmt_bytes(value: float) -> str:
    units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]
    size = float(value)
    for unit in units:
        if abs(size) < 1024 or unit == units[-1]:
            if unit == "B":
                return f"{size:,.0f} {unit}"
            return f"{size:,.1f} {unit}"
        size /= 1024
    return f"{size:,.1f} PiB"


def fmt_range(low: float, high: float) -> str:
    return f"{fmt_bytes(low)} to {fmt_bytes(high)}"


def split_columns(cols: int, mix: DataMix) -> dict[str, int]:
    weights = {
        "numeric": mix.numeric,
        "categorical": mix.categorical,
        "boolean": mix.boolean_or_small_int,
        "text": mix.text,
    }
    total = sum(weights.values())
    normalized = {key: value / total for key, value in weights.items()}
    raw = {key: cols * value for key, value in normalized.items()}
    counts = {key: floor(value) for key, value in raw.items()}
    remainder = cols - sum(counts.values())

    by_fraction = sorted(raw, key=lambda key: raw[key] - counts[key], reverse=True)
    for key in by_fraction[:remainder]:
        counts[key] += 1

    return counts


def estimate(scenario: Scenario, mix: DataMix, assumptions: Assumptions) -> Estimate:
    columns = split_columns(scenario.cols, mix)
    string_csv_bytes = (
        columns["categorical"] * assumptions.categorical_csv_bytes
        + columns["text"] * assumptions.text_csv_bytes
    )
    row_cell_bytes = (
        columns["numeric"] * assumptions.numeric_csv_bytes
        + columns["categorical"] * assumptions.categorical_csv_bytes
        + columns["boolean"] * assumptions.boolean_csv_bytes
        + columns["text"] * assumptions.text_csv_bytes
    )
    delimiter_bytes = max(scenario.cols - 1, 0)
    quote_overhead = string_csv_bytes * assumptions.csv_string_quote_overhead_ratio
    bytes_per_row = row_cell_bytes + delimiter_bytes + quote_overhead + 1
    header_bytes = (
        scenario.cols * assumptions.header_name_bytes
        + max(scenario.cols - 1, 0)
        + 1
    )
    raw_csv_bytes = header_bytes + scenario.rows * bytes_per_row

    compressed_low_bytes = raw_csv_bytes / assumptions.compression_high_ratio
    compressed_high_bytes = raw_csv_bytes / assumptions.compression_low_ratio

    pandas_string_cell_bytes = (
        assumptions.object_pointer_bytes + assumptions.object_string_overhead_bytes
    )
    pandas_default_bytes = (
        scenario.rows * columns["numeric"] * assumptions.pandas_numeric_bytes
        + scenario.rows * columns["boolean"] * assumptions.pandas_bool_default_bytes
        + scenario.rows
        * columns["categorical"]
        * (pandas_string_cell_bytes + assumptions.categorical_csv_bytes)
        + scenario.rows
        * columns["text"]
        * (pandas_string_cell_bytes + assumptions.text_csv_bytes)
        + scenario.rows * 8
    )

    category_dictionary_bytes = (
        columns["categorical"]
        * assumptions.category_cardinality_per_column
        * (assumptions.object_string_overhead_bytes + assumptions.categorical_csv_bytes)
    )
    pandas_optimized_bytes = (
        scenario.rows * columns["numeric"] * assumptions.pandas_numeric_bytes
        + scenario.rows * columns["boolean"] * assumptions.pandas_bool_optimized_bytes
        + scenario.rows
        * columns["categorical"]
        * assumptions.category_code_bytes
        + category_dictionary_bytes
        + scenario.rows
        * columns["text"]
        * (pandas_string_cell_bytes + assumptions.text_csv_bytes)
        + scenario.rows * 8
    )

    backend_full_parse_peak_bytes = (
        raw_csv_bytes
        + pandas_default_bytes * assumptions.parser_peak_dataframe_multiplier
    )
    backend_streaming_peak_bytes = min(
        assumptions.streaming_backend_ceiling_bytes,
        max(
            assumptions.streaming_backend_floor_bytes,
            raw_csv_bytes * assumptions.streaming_backend_file_fraction,
        ),
    )

    preview_rows = min(scenario.rows, scenario.preview_rows)
    average_cell_csv_bytes = row_cell_bytes / scenario.cols if scenario.cols else 0
    raw_preview_payload_bytes = preview_rows * (
        row_cell_bytes + delimiter_bytes + quote_overhead + 1
    )
    backend_preview_artifact_bytes = (
        raw_preview_payload_bytes * assumptions.backend_preview_payload_overhead_ratio
        + scenario.cols * assumptions.backend_metadata_per_column_bytes
    )
    backend_metadata_per_version_bytes = (
        assumptions.backend_metadata_fixed_per_version_bytes
        + scenario.cols * assumptions.backend_metadata_per_column_bytes
    )
    backend_preview_artifacts_storage_bytes = (
        backend_preview_artifact_bytes * scenario.versions
    )
    backend_metadata_storage_bytes = backend_metadata_per_version_bytes * scenario.versions
    cached_versions = min(scenario.versions, scenario.backend_cached_versions)
    backend_service_steady_ram_bytes = (
        assumptions.backend_service_base_session_bytes
        + backend_metadata_storage_bytes
        + backend_preview_artifact_bytes * cached_versions
    )
    backend_service_upload_peak_bytes = (
        backend_service_steady_ram_bytes + backend_streaming_peak_bytes
    )
    backend_bad_full_state_ram_bytes = pandas_default_bytes * scenario.versions

    browser_preview_bytes = (
        preview_rows
        * scenario.cols
        * (
            assumptions.browser_cell_overhead_bytes
            + average_cell_csv_bytes * assumptions.browser_utf16_multiplier
        )
        + scenario.cols * assumptions.browser_column_metadata_bytes
    )

    return Estimate(
        scenario=scenario,
        columns=columns,
        raw_csv_bytes=raw_csv_bytes,
        compressed_low_bytes=compressed_low_bytes,
        compressed_high_bytes=compressed_high_bytes,
        pandas_default_bytes=pandas_default_bytes,
        pandas_optimized_bytes=pandas_optimized_bytes,
        backend_full_parse_peak_bytes=backend_full_parse_peak_bytes,
        backend_streaming_peak_bytes=backend_streaming_peak_bytes,
        backend_preview_artifact_bytes=backend_preview_artifact_bytes,
        backend_metadata_per_version_bytes=backend_metadata_per_version_bytes,
        backend_preview_artifacts_storage_bytes=backend_preview_artifacts_storage_bytes,
        backend_metadata_storage_bytes=backend_metadata_storage_bytes,
        backend_service_steady_ram_bytes=backend_service_steady_ram_bytes,
        backend_service_upload_peak_bytes=backend_service_upload_peak_bytes,
        backend_bad_full_state_ram_bytes=backend_bad_full_state_ram_bytes,
        browser_preview_bytes=browser_preview_bytes,
    )


def backend_signal(full_parse_peak_bytes: float) -> str:
    if full_parse_peak_bytes < 1 * GIB:
        return "full parse plausible"
    if full_parse_peak_bytes < 4 * GIB:
        return "stream preferred"
    if full_parse_peak_bytes < 16 * GIB:
        return "stream/sample"
    return "metadata/sample only"


def browser_signal(preview_bytes: float) -> str:
    if preview_bytes < 50 * MIB:
        return "preview ok"
    if preview_bytes < 200 * MIB:
        return "cap/window rows"
    return "too much for one view"


def backend_service_signal(service_ram_bytes: float) -> str:
    if service_ram_bytes < 128 * MIB:
        return "bounded"
    if service_ram_bytes < 512 * MIB:
        return "watch cache"
    return "cache cap needed"


def storage_signal(raw_csv_bytes: float) -> str:
    if raw_csv_bytes < 100 * MIB:
        return "small"
    if raw_csv_bytes < 1 * GIB:
        return "watch upload"
    if raw_csv_bytes < 5 * GIB:
        return "large upload"
    return "v1 cap likely"


def print_assumptions(
    mix: DataMix,
    assumptions: Assumptions,
    preview_rows: int,
    backend_cached_versions: int,
) -> None:
    print("THROWAWAY PROTOTYPE: CSV memory and storage sizing")
    print()
    print("Question")
    print(
        "  What CSV scale can a hosted preview-only Companion Website support before "
        "storage, backend parse memory, or browser preview memory becomes risky?"
    )
    print()
    print("Core assumptions")
    print(
        "  Data mix: "
        f"{mix.numeric:.0%} numeric, "
        f"{mix.categorical:.0%} categorical/short string, "
        f"{mix.boolean_or_small_int:.0%} boolean/small int, "
        f"{mix.text:.0%} longer text."
    )
    print(
        "  CSV cell bytes: "
        f"numeric={assumptions.numeric_csv_bytes}, "
        f"categorical={assumptions.categorical_csv_bytes}, "
        f"boolean={assumptions.boolean_csv_bytes}, "
        f"text={assumptions.text_csv_bytes}."
    )
    print(
        "  Compression: CSV stored compressed at roughly "
        f"{assumptions.compression_low_ratio:.0f}x to "
        f"{assumptions.compression_high_ratio:.0f}x."
    )
    print(
        "  Pandas default strings model object dtype overhead; optimized model "
        "uses categories for categorical columns but keeps free text as strings."
    )
    print(
        "  Browser estimate is based on preview rows, not total rows. "
        f"Preview rows for this run: {fmt_int(preview_rows)}."
    )
    print(
        "  Backend service model separates durable object storage from resident RAM. "
        f"It caches preview artifacts for up to {fmt_int(backend_cached_versions)} version(s)."
    )
    print()


def print_summary(estimates: Iterable[Estimate]) -> None:
    headers = [
        "Profile",
        "Shape",
        "Raw CSV/version",
        "Compressed/version",
        "Pandas default",
        "Backend full peak",
        "Svc steady RAM",
        "Browser preview",
        "Signals",
    ]
    rows = []
    for item in estimates:
        scenario = item.scenario
        rows.append(
            [
                scenario.name,
                f"{fmt_int(scenario.rows)} x {fmt_int(scenario.cols)}",
                fmt_bytes(item.raw_csv_bytes),
                fmt_range(item.compressed_low_bytes, item.compressed_high_bytes),
                fmt_bytes(item.pandas_default_bytes),
                fmt_bytes(item.backend_full_parse_peak_bytes),
                fmt_bytes(item.backend_service_steady_ram_bytes),
                fmt_bytes(item.browser_preview_bytes),
                f"{storage_signal(item.raw_csv_bytes)}; "
                f"{backend_signal(item.backend_full_parse_peak_bytes)}; "
                f"{backend_service_signal(item.backend_service_steady_ram_bytes)}; "
                f"{browser_signal(item.browser_preview_bytes)}",
            ]
        )
    print_table(headers, rows)
    print()


def print_version_storage(estimates: Iterable[Estimate], versions: list[int]) -> None:
    print("Compressed storage impact by retained Working CSV Versions")
    headers = ["Profile"] + [f"{version} ver" for version in versions]
    rows = []
    for item in estimates:
        rows.append(
            [
                item.scenario.name,
                *[
                    fmt_range(
                        item.compressed_low_bytes * version,
                        item.compressed_high_bytes * version,
                    )
                    for version in versions
                ],
            ]
        )
    print_table(headers, rows)
    print()


def print_backend_service_state(estimates: Iterable[Estimate]) -> None:
    print("Backend service state for each scenario's retained version count")
    headers = [
        "Profile",
        "Versions",
        "Object storage",
        "Preview artifacts",
        "Metadata",
        "Svc steady RAM",
        "Svc upload peak",
        "Bad RAM state",
    ]
    rows = []
    for item in estimates:
        scenario = item.scenario
        rows.append(
            [
                scenario.name,
                fmt_int(scenario.versions),
                fmt_range(
                    item.compressed_low_bytes * scenario.versions,
                    item.compressed_high_bytes * scenario.versions,
                ),
                fmt_bytes(item.backend_preview_artifacts_storage_bytes),
                fmt_bytes(item.backend_metadata_storage_bytes),
                fmt_bytes(item.backend_service_steady_ram_bytes),
                fmt_bytes(item.backend_service_upload_peak_bytes),
                fmt_bytes(item.backend_bad_full_state_ram_bytes),
            ]
        )
    print_table(headers, rows)
    print()
    print("  Bad RAM state = storing each retained version as full dataframe-like service memory.")
    print("  Intended service RAM = metadata plus bounded cached preview artifacts.")
    print()


def print_detail(item: Estimate, versions: list[int]) -> None:
    scenario = item.scenario
    print(f"Details: {scenario.name}")
    print(f"  Shape: {fmt_int(scenario.rows)} rows x {fmt_int(scenario.cols)} columns")
    print(
        "  Column split: "
        f"{item.columns['numeric']} numeric, "
        f"{item.columns['categorical']} categorical, "
        f"{item.columns['boolean']} boolean/small int, "
        f"{item.columns['text']} text"
    )
    print(f"  Raw CSV per version: {fmt_bytes(item.raw_csv_bytes)}")
    print(
        "  Compressed per version: "
        f"{fmt_range(item.compressed_low_bytes, item.compressed_high_bytes)}"
    )
    print(f"  Pandas default dataframe: {fmt_bytes(item.pandas_default_bytes)}")
    print(f"  Pandas optimized dataframe: {fmt_bytes(item.pandas_optimized_bytes)}")
    print(f"  Backend full parse peak: {fmt_bytes(item.backend_full_parse_peak_bytes)}")
    print(
        "  Backend stream/sample peak: "
        f"{fmt_bytes(item.backend_streaming_peak_bytes)}"
    )
    print(f"  Backend preview artifact per version: {fmt_bytes(item.backend_preview_artifact_bytes)}")
    print(f"  Backend metadata per version: {fmt_bytes(item.backend_metadata_per_version_bytes)}")
    print(f"  Backend service steady RAM: {fmt_bytes(item.backend_service_steady_ram_bytes)}")
    print(f"  Backend service upload peak: {fmt_bytes(item.backend_service_upload_peak_bytes)}")
    print(
        "  Bad design RAM if service stores every retained version as dataframes: "
        f"{fmt_bytes(item.backend_bad_full_state_ram_bytes)}"
    )
    print(
        f"  Browser preview model ({fmt_int(min(scenario.rows, scenario.preview_rows))} rows): "
        f"{fmt_bytes(item.browser_preview_bytes)}"
    )
    print("  Version storage:")
    for version in versions:
        print(
            f"    {version:>2} versions compressed: "
            f"{fmt_range(item.compressed_low_bytes * version, item.compressed_high_bytes * version)}"
        )
    print()


def print_policy_signals() -> None:
    print("Policy signals to discuss")
    print("  Backend should store uploaded CSVs as compressed objects, not process memory.")
    print("  Backend durable state is object storage plus small metadata and preview artifacts.")
    print("  Backend resident RAM should hold only bounded preview/cache state and upload buffers.")
    print("  Full in-memory backend parsing becomes risky once peak memory reaches GiB scale.")
    print("  Browser preview risk is mostly rows x columns in the preview window, not total rows.")
    print("  Version history multiplies storage and metadata, but should not multiply service RAM much.")
    print("  Very large CSVs should degrade to metadata plus sampled/paginated preview.")
    print()


def print_table(headers: list[str], rows: list[list[str]]) -> None:
    widths = [
        max(len(str(row[index])) for row in [headers, *rows])
        for index in range(len(headers))
    ]
    print("  " + "  ".join(header.ljust(widths[index]) for index, header in enumerate(headers)))
    print("  " + "  ".join("-" * width for width in widths))
    for row in rows:
        print("  " + "  ".join(str(value).ljust(widths[index]) for index, value in enumerate(row)))


def parse_versions(value: str) -> list[int]:
    versions = [int(item.strip()) for item in value.split(",") if item.strip()]
    if not versions:
        raise argparse.ArgumentTypeError("at least one version count is required")
    if any(version <= 0 for version in versions):
        raise argparse.ArgumentTypeError("version counts must be positive")
    return versions


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Throwaway CSV memory/storage sizing prototype."
    )
    parser.add_argument("--rows", type=int, help="Rows for a custom scenario.")
    parser.add_argument("--cols", type=int, help="Columns for a custom scenario.")
    parser.add_argument("--versions", type=int, default=5, help="Versions for custom detail.")
    parser.add_argument(
        "--versions-list",
        type=parse_versions,
        default=parse_versions("1,5,10,20"),
        help="Comma-separated version counts to print in storage tables.",
    )
    parser.add_argument(
        "--preview-rows",
        type=int,
        default=1_000,
        help="Rows held/rendered by the browser preview model.",
    )
    parser.add_argument(
        "--backend-cached-versions",
        type=int,
        default=1,
        help="Retained versions whose preview artifacts are resident in backend service RAM.",
    )
    parser.add_argument("--numeric", type=float, default=0.60)
    parser.add_argument("--categorical", type=float, default=0.25)
    parser.add_argument("--boolean", type=float, default=0.10)
    parser.add_argument("--text", type=float, default=0.05)
    parser.add_argument(
        "--detail-all",
        action="store_true",
        help="Print per-profile details for all preset scenarios.",
    )
    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()

    if args.rows is not None and args.cols is None:
        parser.error("--cols is required when --rows is provided")
    if args.cols is not None and args.rows is None:
        parser.error("--rows is required when --cols is provided")
    if args.rows is not None and (args.rows <= 0 or args.cols <= 0):
        parser.error("--rows and --cols must be positive")
    if args.preview_rows <= 0:
        parser.error("--preview-rows must be positive")
    if args.backend_cached_versions <= 0:
        parser.error("--backend-cached-versions must be positive")

    mix = DataMix(
        numeric=args.numeric,
        categorical=args.categorical,
        boolean_or_small_int=args.boolean,
        text=args.text,
    )
    assumptions = Assumptions()
    preview_rows = args.preview_rows

    if args.rows is None:
        scenarios = [
            Scenario(
                preset.name,
                preset.rows,
                preset.cols,
                preset.versions,
                preview_rows,
                args.backend_cached_versions,
            )
            for preset in PRESETS
        ]
    else:
        scenarios = [
            Scenario(
                "Custom",
                args.rows,
                args.cols,
                args.versions,
                preview_rows,
                args.backend_cached_versions,
            )
        ]

    estimates = [estimate(scenario, mix, assumptions) for scenario in scenarios]

    print_assumptions(mix, assumptions, preview_rows, args.backend_cached_versions)
    print("Scenario summary")
    print_summary(estimates)
    print_version_storage(estimates, args.versions_list)
    print_backend_service_state(estimates)

    if args.rows is not None or args.detail_all:
        for item in estimates:
            print_detail(item, args.versions_list)

    print_policy_signals()


if __name__ == "__main__":
    main()

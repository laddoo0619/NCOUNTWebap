#!/usr/bin/env python3
"""
NCOUNT Narcotic DIN Reconciliation Pipeline

Merges Health Canada DPD extracts, BC PharmaCare formulary, and Drug Shortages
Canada data to produce a clean CSV of active narcotic DINs for database import.

Usage:
    python reconcile_narcotic_dins.py \
        --dpd-dir ./data/dpd_extracts/ \
        --pharmacare ./data/bc_pharmacare_formulary.csv \
        --shortages ./data/drug_shortages_canada.csv \
        --output narcotic_dins_import.csv \
        --verbose
"""

import sys
import argparse
import logging
from pathlib import Path

import pandas as pd

# ---------------------------------------------------------------------------
# Health Canada DPD file schemas (headerless, comma-separated, latin-1)
# ---------------------------------------------------------------------------
DPD_FILES = {
    "drug.txt": [
        "DRUG_CODE", "CLASS", "DRUG_IDENTIFICATION_NUMBER", "BRAND_NAME",
        "DESCRIPTOR", "PEDIATRIC_FLAG", "ACCESSION_NUMBER", "NUMBER_OF_AIS",
        "LAST_UPDATE_DATE", "AI_GROUP_NO", "CLASS_F", "BRAND_NAME_F",
        "DESCRIPTOR_F",
    ],
    "status.txt": [
        "DRUG_CODE", "CURRENT_STATUS_FLAG", "STATUS", "HISTORY_DATE",
    ],
    "schedule.txt": [
        "DRUG_CODE", "SCHEDULE", "SCHEDULE_F",
    ],
    "form.txt": [
        "DRUG_CODE", "PHARM_FORM_CODE", "PHARMACEUTICAL_FORM",
        "PHARMACEUTICAL_FORM_F",
    ],
    "ingred.txt": [
        "DRUG_CODE", "ACTIVE_INGREDIENT_CODE", "INGREDIENT",
        "INGREDIENT_SUPPLIED_IND", "STRENGTH", "STRENGTH_UNIT",
        "STRENGTH_TYPE", "DOSAGE_VALUE", "DOSAGE_UNIT",
        "INGREDIENT_F", "STRENGTH_TYPE_F",
    ],
}

logger = logging.getLogger("reconcile")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def normalize_din(series: pd.Series) -> pd.Series:
    """Zero-pad DINs to 8 digits and strip whitespace."""
    return series.astype(str).str.strip().str.zfill(8)


def strip_strings(df: pd.DataFrame) -> pd.DataFrame:
    """Strip leading/trailing whitespace from all object columns."""
    for col in df.select_dtypes(include="object").columns:
        df[col] = df[col].str.strip()
    return df


def find_din_column(df: pd.DataFrame, source_name: str) -> str | None:
    """Auto-detect the DIN column by name heuristic."""
    for col in df.columns:
        upper = col.upper().strip()
        if upper in ("DIN", "DIN/PIN", "DIN_PIN", "DRUG IDENTIFICATION NUMBER"):
            return col
        if "DIN" in upper and len(upper) < 30:
            return col
    logger.warning("Could not identify DIN column in %s. Columns: %s",
                   source_name, list(df.columns))
    return None


# ---------------------------------------------------------------------------
# Loaders
# ---------------------------------------------------------------------------
def load_dpd_files(dpd_dir: Path) -> dict[str, pd.DataFrame]:
    """Load all DPD extract files from the given directory."""
    missing = [f for f in DPD_FILES if not (dpd_dir / f).exists()]
    if missing:
        logger.error("Missing DPD files in %s: %s", dpd_dir, missing)
        sys.exit(1)

    frames: dict[str, pd.DataFrame] = {}
    for filename, columns in DPD_FILES.items():
        filepath = dpd_dir / filename
        try:
            df = pd.read_csv(
                filepath,
                header=None,
                names=columns,
                encoding="latin-1",
                dtype=str,
                on_bad_lines="warn",
            )
            df = strip_strings(df)
            frames[filename] = df
            logger.info("Loaded %s: %d rows, %d columns",
                        filename, len(df), len(df.columns))
        except Exception as exc:
            logger.error("Failed to parse %s: %s", filepath, exc)
            sys.exit(2)

    return frames


def load_csv(filepath: Path, source_name: str) -> pd.DataFrame:
    """Load a CSV with headers, trying utf-8 then latin-1."""
    for enc in ("utf-8", "latin-1"):
        try:
            df = pd.read_csv(filepath, dtype=str, encoding=enc)
            df = strip_strings(df)
            logger.info("Loaded %s (%s): %d rows", source_name, enc, len(df))
            return df
        except UnicodeDecodeError:
            continue
        except Exception as exc:
            logger.error("Failed to parse %s: %s", source_name, exc)
            sys.exit(2)
    logger.error("Could not decode %s with utf-8 or latin-1", source_name)
    sys.exit(2)


# ---------------------------------------------------------------------------
# Pipeline stages
# ---------------------------------------------------------------------------
def extract_active_narcotics(dpd: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """Filter DPD for active drugs with Narcotic schedule, enrich with
    ingredient and dosage-form data."""
    drug_df = dpd["drug.txt"]
    status_df = dpd["status.txt"]
    schedule_df = dpd["schedule.txt"]
    form_df = dpd["form.txt"]
    ingred_df = dpd["ingred.txt"]

    counts: dict[str, int] = {}
    counts["dpd_total"] = len(drug_df)

    # Active drugs only
    active_codes = status_df.loc[
        status_df["CURRENT_STATUS_FLAG"] == "A", "DRUG_CODE"
    ]
    counts["dpd_active"] = active_codes.nunique()

    # Narcotic schedule only
    narcotic_codes = schedule_df.loc[
        schedule_df["SCHEDULE"].str.lower() == "narcotic", "DRUG_CODE"
    ]

    # Intersection: active AND narcotic
    active_narcotic_codes = set(active_codes) & set(narcotic_codes)
    counts["active_narcotic"] = len(active_narcotic_codes)
    logger.info("Active narcotic DRUG_CODEs: %d", len(active_narcotic_codes))

    if not active_narcotic_codes:
        logger.error("Zero active narcotic DRUG_CODEs found. Check your DPD "
                     "files and ensure schedule.txt contains 'Narcotic' entries.")
        sys.exit(3)

    # Filter drug table
    result = drug_df[drug_df["DRUG_CODE"].isin(active_narcotic_codes)].copy()
    result = result[["DRUG_CODE", "DRUG_IDENTIFICATION_NUMBER", "BRAND_NAME"]]

    # Aggregate ingredients (multi-ingredient drugs)
    ingred_df = ingred_df[ingred_df["DRUG_CODE"].isin(active_narcotic_codes)].copy()
    ingred_df["STRENGTH_COMBINED"] = (
        ingred_df["STRENGTH"].fillna("") + " " + ingred_df["STRENGTH_UNIT"].fillna("")
    ).str.strip()

    ingred_agg = ingred_df.groupby("DRUG_CODE", as_index=False).agg(
        Generic_Name=("INGREDIENT", lambda x: " / ".join(x.dropna().unique())),
        Strength=("STRENGTH_COMBINED", lambda x: " / ".join(x.dropna().unique())),
    )

    # Dosage form (take first per DRUG_CODE)
    form_filtered = form_df[form_df["DRUG_CODE"].isin(active_narcotic_codes)].copy()
    form_dedup = form_filtered.drop_duplicates(subset="DRUG_CODE", keep="first")
    form_dedup = form_dedup[["DRUG_CODE", "PHARMACEUTICAL_FORM"]]

    # Merge everything
    result = result.merge(ingred_agg, on="DRUG_CODE", how="left")
    result = result.merge(form_dedup, on="DRUG_CODE", how="left")

    # Normalize DIN
    result["DIN"] = normalize_din(result["DRUG_IDENTIFICATION_NUMBER"])

    # Deduplicate on DIN (keep first)
    result = result.drop_duplicates(subset="DIN", keep="first")

    # Validate DINs (must be exactly 8 digits)
    valid_mask = result["DIN"].str.match(r"^\d{8}$")
    invalid_count = (~valid_mask).sum()
    if invalid_count > 0:
        logger.warning("Dropped %d rows with invalid DINs", invalid_count)
    result = result[valid_mask].copy()

    counts["after_enrichment"] = len(result)
    return result, counts


def cross_reference_pharmacare(
    narcotics: pd.DataFrame, pharmacare_path: Path
) -> tuple[pd.DataFrame, int]:
    """Left-join narcotic DINs with BC PharmaCare formulary."""
    pharmacare_df = load_csv(pharmacare_path, "BC PharmaCare Formulary")
    din_col = find_din_column(pharmacare_df, "BC PharmaCare Formulary")

    if din_col is None:
        logger.warning("Skipping PharmaCare cross-reference (no DIN column).")
        return narcotics, 0

    pharmacare_df["_PC_DIN"] = normalize_din(pharmacare_df[din_col])

    # Keep useful PharmaCare columns (auto-detect what's available)
    keep_cols = ["_PC_DIN"]
    for candidate in pharmacare_df.columns:
        upper = candidate.upper()
        if any(kw in upper for kw in [
            "COVERAGE", "PLAN", "LCA", "RDP", "MAX PRICE", "BENEFIT",
            "SPECIAL AUTH", "FORMULARY",
        ]):
            keep_cols.append(candidate)

    pc_subset = pharmacare_df[keep_cols].drop_duplicates(subset="_PC_DIN")

    merged = narcotics.merge(
        pc_subset, left_on="DIN", right_on="_PC_DIN", how="left"
    )
    match_count = merged["_PC_DIN"].notna().sum()
    merged = merged.drop(columns=["_PC_DIN"], errors="ignore")

    logger.info("PharmaCare matches: %d / %d", match_count, len(narcotics))
    return merged, match_count


def exclude_shortages(
    df: pd.DataFrame, shortages_path: Path
) -> tuple[pd.DataFrame, int]:
    """Remove DINs that appear on the Drug Shortages Canada list."""
    shortages_df = load_csv(shortages_path, "Drug Shortages Canada")
    din_col = find_din_column(shortages_df, "Drug Shortages Canada")

    if din_col is None:
        logger.warning("Skipping shortage exclusion (no DIN column found).")
        return df, 0

    shortage_dins = set(normalize_din(shortages_df[din_col]))
    before = len(df)
    df = df[~df["DIN"].isin(shortage_dins)].copy()
    excluded = before - len(df)

    logger.info("Shortage exclusions: %d", excluded)
    return df, excluded


def build_output(df: pd.DataFrame) -> pd.DataFrame:
    """Select and rename columns for the final NCOUNT import CSV."""
    output = pd.DataFrame({
        "DIN": df["DIN"],
        "Brand_Name": df.get("BRAND_NAME", pd.Series(dtype=str)),
        "Generic_Name": df.get("Generic_Name", pd.Series(dtype=str)),
        "Strength": df.get("Strength", pd.Series(dtype=str)),
        "Form": df.get("PHARMACEUTICAL_FORM", pd.Series(dtype=str)),
        "Expected_Count": 0,
    })
    # Fill any NaN with empty string (except Expected_Count)
    for col in ["Brand_Name", "Generic_Name", "Strength", "Form"]:
        output[col] = output[col].fillna("")
    return output


# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
def print_summary(counts: dict[str, int], output_path: str) -> None:
    """Print a human-readable reconciliation summary to stderr."""
    print("\n" + "=" * 55, file=sys.stderr)
    print("  NCOUNT Narcotic DIN Reconciliation Summary", file=sys.stderr)
    print("=" * 55, file=sys.stderr)
    labels = [
        ("dpd_total", "DPD total products loaded"),
        ("dpd_active", "DPD active products"),
        ("active_narcotic", "DPD active + Narcotic schedule"),
        ("after_enrichment", "After enrichment & validation"),
        ("pharmacare_matches", "PharmaCare matches found"),
        ("shortage_exclusions", "Shortage exclusions applied"),
        ("final_output", "Final output DINs"),
    ]
    for key, label in labels:
        if key in counts:
            print(f"  {label + ':':<40} {counts[key]:>8,}", file=sys.stderr)
    print(f"\n  Output written to: {output_path}", file=sys.stderr)
    print("=" * 55 + "\n", file=sys.stderr)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Reconcile narcotic DINs from Health Canada DPD, "
                    "BC PharmaCare, and Drug Shortages Canada."
    )
    parser.add_argument(
        "--dpd-dir", required=True, type=Path,
        help="Directory containing DPD extract files "
             "(drug.txt, status.txt, schedule.txt, form.txt, ingred.txt)",
    )
    parser.add_argument(
        "--pharmacare", required=True, type=Path,
        help="Path to BC PharmaCare Formulary CSV",
    )
    parser.add_argument(
        "--shortages", required=True, type=Path,
        help="Path to Drug Shortages Canada CSV",
    )
    parser.add_argument(
        "-o", "--output", default="narcotic_dins_import.csv",
        help="Output CSV path (default: narcotic_dins_import.csv)",
    )
    parser.add_argument(
        "-v", "--verbose", action="store_true",
        help="Enable verbose (DEBUG) logging",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)-8s %(message)s",
        stream=sys.stderr,
    )

    # Validate input paths
    if not args.dpd_dir.is_dir():
        logger.error("DPD directory does not exist: %s", args.dpd_dir)
        sys.exit(1)
    if not args.pharmacare.is_file():
        logger.error("PharmaCare file not found: %s", args.pharmacare)
        sys.exit(1)
    if not args.shortages.is_file():
        logger.error("Shortages file not found: %s", args.shortages)
        sys.exit(1)

    counts: dict[str, int] = {}

    # Stage 1: Load and filter DPD
    logger.info("Stage 1: Loading DPD extracts from %s", args.dpd_dir)
    dpd = load_dpd_files(args.dpd_dir)
    narcotics, dpd_counts = extract_active_narcotics(dpd)
    counts.update(dpd_counts)

    # Stage 2: Cross-reference with PharmaCare
    logger.info("Stage 2: Cross-referencing with BC PharmaCare formulary")
    narcotics, pc_matches = cross_reference_pharmacare(narcotics, args.pharmacare)
    counts["pharmacare_matches"] = pc_matches

    # Stage 3: Exclude Drug Shortages
    logger.info("Stage 3: Filtering out Drug Shortages Canada entries")
    narcotics, shortage_excl = exclude_shortages(narcotics, args.shortages)
    counts["shortage_exclusions"] = shortage_excl

    # Stage 4: Build output
    output = build_output(narcotics)
    counts["final_output"] = len(output)

    if len(output) == 0:
        logger.error("Pipeline produced zero rows. Check input data.")
        sys.exit(3)

    output.to_csv(args.output, index=False, encoding="utf-8")
    logger.info("Wrote %d rows to %s", len(output), args.output)

    print_summary(counts, args.output)


if __name__ == "__main__":
    main()

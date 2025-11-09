from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import pandas as pd


SCORE_CONFIG: dict[str, dict[str, object]] = {
    "Marketcap": {"higher_is_better": True, "transform": "log"},
    "Ebitda": {"higher_is_better": True, "transform": "log"},
    "Revenuegrowth": {"higher_is_better": True},
    "Weight": {"higher_is_better": True},
    "P/B Ratio": {"higher_is_better": False},
    "P/E Ratio": {"higher_is_better": False},
    "Dividend Yield": {"higher_is_better": True},
    "EPS": {"higher_is_better": True},
    "ROE": {"higher_is_better": True},
}


def _prepare_numeric(series: pd.Series, transform: str | None) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    if transform == "log":
        numeric = numeric.mask(numeric <= 0)
        numeric = np.log(numeric)
    return numeric


def _compute_score(series: pd.Series, higher_is_better: bool) -> pd.Series:
    percentile = series.rank(pct=True, method="average")
    if not higher_is_better:
        percentile = 1 - percentile
    return (percentile * 100).round(1)


def add_scores(df: pd.DataFrame) -> pd.DataFrame:
    for column, settings in SCORE_CONFIG.items():
        if column not in df.columns:
            continue

        transform = settings.get("transform")
        higher_is_better = bool(settings.get("higher_is_better", True))

        numeric = _prepare_numeric(df[column], transform if isinstance(transform, str) else None)
        scores = _compute_score(numeric, higher_is_better)
        df[f"{column} Score"] = scores

    return df


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Add percentile-based scores to S&P 500 fundamentals.")
    parser.add_argument(
        "input",
        type=Path,
        help="Path to input CSV file containing fundamental data.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Optional path for the scored CSV output. Defaults to overwriting the input file.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = args.input.expanduser().resolve()
    output_path = (args.output or args.input).expanduser().resolve()

    df = pd.read_csv(input_path)
    df_scored = add_scores(df)
    df_scored.to_csv(output_path, index=False)

    print(f"Scores added for {len(SCORE_CONFIG)} metrics. Saved to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())


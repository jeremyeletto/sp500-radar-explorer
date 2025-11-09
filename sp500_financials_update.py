import logging
import math
import os
import ssl
import sys
from pathlib import Path
from time import sleep
from typing import Any, List, Optional, Sequence, Tuple

import certifi
import pandas as pd
import requests
import urllib3
from requests import Response, Session


DEFAULT_INPUT_FILE = Path("sp500_companies.xlsx")
DEFAULT_OUTPUT_FILE = Path("sp500_companies_with_financials.xlsx")
SLEEP_SECONDS = 1.0
YAHOO_BASE_URL = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{ticker}"
YAHOO_CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb"
YAHOO_MODULES = ("summaryDetail", "financialData", "defaultKeyStatistics")
HTTP_TIMEOUT = 10
HTTP_RETRY_STATUS = {401, 403, 429, 500, 502, 503, 504}
USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)
MAX_RETRIES = 3

METRIC_PATHS: dict[str, Sequence[str]] = {
    "P/B Ratio": ("defaultKeyStatistics", "priceToBook"),
    "P/E Ratio": ("summaryDetail", "trailingPE"),
    "Dividend Yield": ("summaryDetail", "dividendYield"),
    "EPS": ("defaultKeyStatistics", "trailingEps"),
    "Revenue": ("financialData", "totalRevenue"),
    "Net Income": ("financialData", "netIncomeToCommon"),
    "ROE": ("financialData", "returnOnEquity"),
}

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)
class YahooFinanceClient:
    def __init__(self) -> None:
        self.session: Session = requests.Session()
        self.session.verify = False
        self.session.headers.update(
            {
                "User-Agent": USER_AGENT,
                "Accept": "application/json, text/javascript, */*; q=0.01",
            }
        )
        self._crumb: Optional[str] = None

    def _refresh_crumb(self) -> str:
        response = self.session.get(
            YAHOO_CRUMB_URL,
            timeout=HTTP_TIMEOUT,
        )
        response.raise_for_status()
        crumb = response.text.strip()
        if not crumb:
            raise RuntimeError("Received empty crumb from Yahoo Finance")
        self._crumb = crumb
        return crumb

    def _ensure_crumb(self) -> str:
        if not self._crumb:
            return self._refresh_crumb()
        return self._crumb

    def fetch(self, ticker: str) -> Response:
        last_error: Optional[Exception] = None
        for attempt in range(1, MAX_RETRIES + 1):
            crumb = self._ensure_crumb()
            params = {
                "modules": ",".join(YAHOO_MODULES),
                "crumb": crumb,
            }

            response = self.session.get(
                YAHOO_BASE_URL.format(ticker=ticker),
                params=params,
                timeout=HTTP_TIMEOUT,
            )

            if response.status_code in HTTP_RETRY_STATUS:
                last_error = requests.HTTPError(
                    f"{response.status_code} {response.reason}",
                    response=response,
                )
                if response.status_code in {401, 403} or attempt == 1:
                    # Refresh crumb on authentication-like errors.
                    self._refresh_crumb()
                sleep(min(3, attempt))
                continue

            response.raise_for_status()
            return response

        assert last_error is not None
        raise last_error


CLIENT = YahooFinanceClient()


def load_symbols(filepath: Path) -> pd.DataFrame:
    suffix = filepath.suffix.lower()
    if suffix == ".csv":
        df = pd.read_csv(filepath, dtype={"Symbol": str})
    else:
        df = pd.read_excel(filepath, dtype={"Symbol": str})

    if "Symbol" not in df.columns:
        raise ValueError("Expected a column named 'Symbol' containing ticker symbols")

    for column in METRIC_PATHS:
        if column not in df.columns:
            df[column] = None

    return df


def _extract_raw(value: Any) -> Optional[float]:
    if isinstance(value, dict):
        for key in ("raw", "fmt"):
            maybe = value.get(key)
            if isinstance(maybe, (int, float)) and math.isfinite(maybe):
                return float(maybe)
            if isinstance(maybe, str):
                cleaned = maybe.replace(",", "").replace("%", "")
                try:
                    return float(cleaned)
                except ValueError:
                    continue
    elif isinstance(value, (int, float)) and math.isfinite(value):
        return float(value)
    return None


def fetch_metrics(ticker: str) -> dict:
    ticker = str(ticker).strip()
    if not ticker or ticker.lower() == "nan":
        raise ValueError("Empty ticker symbol")

    metrics = {}
    response = CLIENT.fetch(ticker)
    payload = response.json()

    result = payload.get("quoteSummary", {}).get("result")
    if not result:
        raise ValueError("No quote summary returned")

    summary = result[0]

    for column, path in METRIC_PATHS.items():
        data = summary
        for key in path:
            if data is None:
                break
            data = data.get(key) if isinstance(data, dict) else None
        metrics[column] = _extract_raw(data)

    return metrics


def save_dataframe(df: pd.DataFrame, filepath: Path) -> None:
    suffix = filepath.suffix.lower()
    if suffix == ".csv":
        df.to_csv(filepath, index=False)
    else:
        df.to_excel(filepath, index=False)


def resolve_paths(args: List[str]) -> Tuple[Path, Path]:
    input_path: Path
    output_path: Path

    if args:
        input_path = Path(args[0]).expanduser().resolve()
    else:
        for candidate in (
            Path("sp500_companies.csv"),
            DEFAULT_INPUT_FILE,
        ):
            if candidate.exists():
                input_path = candidate
                break
        else:
            input_path = DEFAULT_INPUT_FILE

    if len(args) >= 2:
        output_path = Path(args[1]).expanduser().resolve()
    else:
        suffix = input_path.suffix.lower()
        if suffix == ".csv":
            output_path = input_path.with_name(f"{input_path.stem}_with_financials.csv")
        else:
            output_path = input_path.with_name(f"{input_path.stem}_with_financials.xlsx")

    return input_path, output_path


def main(argv: Optional[List[str]] = None) -> int:
    cert_bundle = certifi.where()
    os.environ.setdefault("SSL_CERT_FILE", cert_bundle)
    os.environ.setdefault("REQUESTS_CA_BUNDLE", cert_bundle)
    os.environ.setdefault("CURL_CA_BUNDLE", cert_bundle)

    ssl._create_default_https_context = ssl._create_unverified_context

    args = argv if argv is not None else sys.argv[1:]
    input_path, output_path = resolve_paths(args)

    df = load_symbols(input_path)
    total = len(df)

    for idx, ticker in df["Symbol"].items():
        try:
            metrics = fetch_metrics(ticker)
            for column, value in metrics.items():
                df.at[idx, column] = value
            print(f"[{idx + 1}/{total}] Retrieved data for {ticker}")
        except Exception as exc:  # noqa: BLE001
            print(f"[{idx + 1}/{total}] Failed for {ticker}: {exc}")
        sleep(SLEEP_SECONDS)

    save_dataframe(df, output_path)
    print(f"\n✅ Completed! Data saved to {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())


#!/usr/bin/env python3
"""Daily Google Trends refresh for SourceRadar.

Uses trendspy (pytrends is archived/dead as of 2025-04 and 429s on first call).
Reads each product's trendQuery from data.js, pulls 90-day interest-over-time,
computes a momentum score, and writes trends.json for the site to consume.

Momentum = mean(last 14 days) / mean(prior 60 days) - 1
  >= +0.15 → rising, <= -0.15 → cooling, else stable.

Defensible-pipeline rules (docs/research/07-legal.md):
- public data only, no login, no captcha-bypass, no bot-identity spoofing
- >=30s between keyword requests, exponential backoff on 429 (60s → 10min)
- keep-last-good on per-keyword failure; a fully failed run leaves the
  previous trends.json untouched, so the site degrades to editorial grades.
"""
import json
import os
import re
import sys
import time
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_JS = os.path.join(ROOT, "data.js")
OUT = os.path.join(ROOT, "trends.json")

# EU/AU-centric products are measured in their home market.
GEO_OVERRIDES = {"solar-storage": "DE", "smart-plug": "DE"}
DEFAULT_GEO = "US"
TIMEFRAME = "today 3-m"
SPARK_POINTS = 30
REQUEST_GAP_S = 30
BACKOFF_S = [60, 180, 600]


def read_queries():
    src = open(DATA_JS, encoding="utf-8").read()
    pairs = re.findall(r'id: "([^"]+)",.*?trendQuery: "([^"]+)"', src, re.S)
    seen = {}
    for pid, q in pairs:
        if pid not in seen:
            seen[pid] = q
    return seen


def downsample(values, n):
    if len(values) <= n:
        return [round(v, 1) for v in values]
    step = len(values) / n
    return [round(values[int(i * step)], 1) for i in range(n)]


def momentum(values):
    if len(values) < 30:
        return None
    recent = values[-14:]
    prior = values[-74:-14] if len(values) >= 74 else values[:-14]
    prior_mean = sum(prior) / len(prior)
    if prior_mean <= 0:
        return None
    return sum(recent) / len(recent) / prior_mean - 1


def label(m):
    if m is None:
        return "unknown"
    if m >= 0.15:
        return "rising"
    if m <= -0.15:
        return "cooling"
    return "stable"


def fetch_series(tr, query, geo):
    for attempt, wait in enumerate([0] + BACKOFF_S):
        if wait:
            print(f"  backoff {wait}s (attempt {attempt + 1})", file=sys.stderr)
            time.sleep(wait)
        try:
            df = tr.interest_over_time([query], timeframe=TIMEFRAME, geo=geo)
            if df is not None and len(df) > 0:
                col = query if query in getattr(df, "columns", []) else None
                values = df[col] if col else df[df.columns[0]]
                return [float(v) for v in list(values)]
            return None
        except Exception as e:  # noqa: BLE001 — 429s and transport errors alike
            print(f"  fetch error: {e}", file=sys.stderr)
    return None


def main():
    from trendspy import Trends

    queries = read_queries()
    print(f"{len(queries)} trend queries found")
    previous = {}
    if os.path.exists(OUT):
        try:
            previous = json.load(open(OUT, encoding="utf-8")).get("products", {})
        except Exception:
            pass

    tr = Trends()
    products = {}
    failures = []
    for i, (pid, query) in enumerate(queries.items()):
        geo = GEO_OVERRIDES.get(pid, DEFAULT_GEO)
        series = fetch_series(tr, query, geo)
        if series:
            m = momentum(series)
            products[pid] = {
                "query": query,
                "geo": geo,
                "points": downsample(series, SPARK_POINTS),
                "momentum": round(m, 3) if m is not None else None,
                "label": label(m),
            }
        else:
            failures.append(pid)
            if pid in previous:
                products[pid] = previous[pid]
        print(f"[{i + 1}/{len(queries)}] {pid}: {'ok' if series else 'kept-previous' if pid in products else 'no-data'}")
        time.sleep(REQUEST_GAP_S)

    fresh = len(products) - sum(1 for pid in failures if pid in products)
    if fresh == 0:
        print("no fresh data at all — leaving existing trends.json untouched", file=sys.stderr)
        sys.exit(0 if previous else 1)

    out = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "timeframe": TIMEFRAME,
        "products": products,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), indent=1)
    print(f"wrote {OUT}: {len(products)} products ({fresh} fresh), {len(failures)} failures {failures or ''}")


if __name__ == "__main__":
    main()

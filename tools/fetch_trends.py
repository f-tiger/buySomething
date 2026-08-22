#!/usr/bin/env python3
"""Daily Google Trends refresh for SourceRadar.

Reads each product's trendQuery from data.js, pulls 90-day interest-over-time
from Google Trends (via pytrends), computes a momentum score, and writes
trends.json for the site to consume.

Momentum = mean(last 14 days) / mean(prior 60 days) - 1
  >= +0.15 → rising, <= -0.15 → cooling, else stable.

Designed to run in GitHub Actions. Resilient by construction:
- per-keyword retry with backoff on 429/errors
- partial failures keep the previous run's entry for that product
- the site treats a missing/stale file as "no live data" and falls back
  to editorial grades, so a failed run never breaks the page.
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

# Products whose demand is EU-centric are measured in their home market.
GEO_OVERRIDES = {"solar-mount": "DE", "smart-plug": "DE"}
DEFAULT_GEO = "US"
TIMEFRAME = "today 3-m"
SPARK_POINTS = 30  # downsampled points served to the front-end


def read_queries():
    src = open(DATA_JS, encoding="utf-8").read()
    pairs = re.findall(r'id: "([^"]+)",.*?trendQuery: "([^"]+)"', src, re.S)
    # re.S makes .*? span products only because id comes first in each literal
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


def fetch_all(queries, previous):
    from pytrends.request import TrendReq

    products = {}
    failures = []
    for i, (pid, query) in enumerate(queries.items()):
        geo = GEO_OVERRIDES.get(pid, DEFAULT_GEO)
        series = None
        for attempt in range(3):
            try:
                pt = TrendReq(hl="en-US", tz=0, timeout=(10, 30))
                pt.build_payload([query], timeframe=TIMEFRAME, geo=geo)
                df = pt.interest_over_time()
                if df is not None and not df.empty:
                    series = [float(v) for v in df[query].tolist()]
                break
            except Exception as e:  # noqa: BLE001 — 429s and transport errors alike
                wait = 20 * (attempt + 1)
                print(f"[{pid}] attempt {attempt + 1} failed: {e}; retrying in {wait}s", file=sys.stderr)
                time.sleep(wait)
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
            if pid in previous:  # keep last known-good data rather than dropping it
                products[pid] = previous[pid]
        time.sleep(8)  # stay well under Trends rate limits
        print(f"[{i + 1}/{len(queries)}] {pid}: {'ok' if series else 'kept-previous' if pid in products else 'no-data'}")
    return products, failures


def main():
    queries = read_queries()
    print(f"{len(queries)} trend queries found")
    previous = {}
    if os.path.exists(OUT):
        try:
            previous = json.load(open(OUT, encoding="utf-8")).get("products", {})
        except Exception:
            pass
    products, failures = fetch_all(queries, previous)
    if not products:
        print("no data fetched at all — keeping existing trends.json untouched", file=sys.stderr)
        sys.exit(0 if previous else 1)
    out = {
        "updated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "timeframe": TIMEFRAME,
        "products": products,
    }
    json.dump(out, open(OUT, "w", encoding="utf-8"), indent=1)
    print(f"wrote {OUT}: {len(products)} products, {len(failures)} failures {failures or ''}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Import SPSS .sav to JSON (stdout): rows + per-column value labels."""
import json
import math
import sys

import pyreadstat

if len(sys.argv) < 2:
    print("Usage: import_sav.py <path.sav>", file=sys.stderr)
    sys.exit(1)

sav_path = sys.argv[1]
df, meta = pyreadstat.read_sav(
    sav_path,
    apply_value_formats=False,
    formats_as_category=False,
)

rows = []
for i in range(len(df)):
    entry = {}
    for column in df.columns:
        value = df.at[i, column]
        if isinstance(value, float) and math.isnan(value):
            continue
        entry[column] = value
    rows.append(entry)

variables = {}
value_label_map = meta.variable_value_labels or {}
for column in df.columns:
    labels = value_label_map.get(column)
    if not labels:
        continue
    formatted = {}
    for key, label in labels.items():
        if isinstance(key, float):
            if math.isnan(key):
                continue
            if key == int(key):
                formatted[str(int(key))] = label
            else:
                formatted[str(key)] = label
        else:
            formatted[str(key)] = label
    if formatted:
        variables[column] = {"valueLabels": formatted}

print(json.dumps({"rows": rows, "variables": variables}))

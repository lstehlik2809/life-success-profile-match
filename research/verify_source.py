"""Verify every bundled observed correlation against the pinned analysis workbook.

Run from any directory: python research/verify_source.py
Requires openpyxl. This is an offline source audit, not a browser dependency.
"""
from pathlib import Path
import hashlib
import json
from openpyxl import load_workbook

root = Path(__file__).resolve().parent
provenance = json.loads((root / 'provenance.json').read_text(encoding='utf-8'))
workbook_path = root / 'b5_profiles_data.xlsx'
assert hashlib.sha256(workbook_path.read_bytes()).hexdigest() == provenance['workbookSHA256']
source = (root.parent / 'regression-data.js').read_text(encoding='utf-8')
records = json.loads(source.split('export const OBSERVED_CRITERIA = ', 1)[1].strip().removesuffix(';'))
groups = {}
workbook = load_workbook(workbook_path, read_only=True, data_only=True)
for sheet in provenance['sheets']:
    values = workbook[sheet].values
    headers = list(next(values))
    for values_row in values:
        row = dict(zip(headers, values_row))
        if row.get('Trait') not in ['ES', 'A', 'C', 'EX', 'O']:
            continue
        name = row['Variable Name'].strip()
        group = groups.setdefault(name, {})
        assert row['Trait'] not in group, f'Duplicate source row: {name} / {row["Trait"]}'
        group[row['Trait']] = row['r']

aliases = {}
for display_name, record in records.items():
    group = groups[record['sourceName']]
    observed = [group[trait] for trait in ['ES', 'A', 'C', 'EX', 'O']]
    assert observed == record['r'], f'Correlation mismatch: {display_name}'
    if display_name != record['sourceName']:
        aliases[display_name] = record['sourceName']
assert len(records) == 148
print(f'PASS: all {len(records)} variables / {5 * len(records)} observed correlations match the pinned workbook.')
print('Explicit source-name mappings:', json.dumps(aliases, ensure_ascii=False, indent=2))
print('Negative criteria already use their reversed scoring direction; no additional sign change was applied.')

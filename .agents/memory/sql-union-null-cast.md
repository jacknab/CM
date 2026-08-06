---
name: NULL::INTEGER cast in UNION ALL
description: PostgreSQL UNION ALL type inference issue when mixing NULL and integer literals.
---

## Rule
When building a UNION ALL query where some branches have NULL and others have integer literals in the same column, always cast NULL explicitly:

```sql
SELECT id, 'feature_a', true, 2::INTEGER    FROM plans WHERE code = 'x' UNION ALL
SELECT id, 'feature_b', true, NULL::INTEGER FROM plans WHERE code = 'x'
```

## Why
PostgreSQL infers the type of a UNION ALL column from the first branch. If the first branch has `NULL` (no type context), PostgreSQL defaults it to `text`. When a later branch provides `2000` (integer), types clash → `ERROR: UNION types text and integer cannot be matched`.

## How to apply
Cast ALL values in the limit_value column with `::INTEGER` in any UNION ALL seed query — both the integer literals and the NULLs. The pattern `NULL::INTEGER` is clean and unambiguous.

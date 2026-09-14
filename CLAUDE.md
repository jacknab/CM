# Project instructions for Claude

## Pre-existing errors log

If you encounter a pre-existing error or bug — a type error, a runtime bug, a broken invariant — in a file you were not asked to change, and you decide not to fix it as part of the current task, log it to `pre-errors.md` at the repo root before finishing your response. Add a new entry at the top with: date, file:line, the exact error/symptom, enough context for someone to pick it up cold, and why it wasn't fixed now. Do not fix it yourself unless the user asks — this file is a queue for deliberate follow-up, not an invitation to drive-by patch unrelated code.

Skip logging something you already knew about from an earlier turn in the same conversation — only log newly-discovered pre-existing issues.

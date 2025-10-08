# Prompt: Full Codebase Review & Runbook

You are Codex. Review the entire codebase for this project.

## Goals

1. **Dead Weight Detection**
   - Identify scripts, functions, or modules that appear unused, redundant, or left over from debugging.
   - Highlight any “weird stuff” such as half-finished experiments, duplicate utilities, or placeholder files.

2. **Ineffectiveness Report**
   - Point out sections of code that are inefficient, fragile, or could be simplified.
   - Note inconsistent coding practices (naming, logging, error handling, config management).
   - Call out scripts that don’t follow the pipeline’s single source of truth.

3. **Documentation & Runbook**
   - Create a clear `RUNBOOK.md` that explains:
     - How to run the pipeline from start to finish
     - What dependencies need to be installed (with versions if possible)
     - Required environment variables
     - Where outputs are saved and how to verify success
     - Any debug/troubleshooting tips
   - The goal is: a new developer (or future me) should be able to run the pipeline without asking questions.

4. **Architecture Map**
   - Provide a high-level overview of the pipeline’s flow (input → processing → output).
   - Show how the scripts connect to each other.
   - Identify where responsibility boundaries are unclear or overlapping.

5. **Improvement Suggestions**
   - Suggest concrete improvements: code organization, modularization, naming conventions, efficiency tweaks.
   - Prioritize suggestions: which are critical vs. nice-to-have.

---

## Output Format

1. **Dead Weight List**
   - File/function name
   - Why it seems unused/redundant

2. **Ineffectiveness Report**
   - Specific example(s)
   - Suggested change

3. **RUNBOOK.md**
   - As a properly formatted markdown file, ready to drop in the repo

4. **Architecture Overview**
   - Clear explanation (with optional ASCII diagram if useful)

5. **Improvement Suggestions**
   - Ordered by priority: critical fixes, then optimizations, then polish

---

Be concise but thorough. Assume I’ll act on your recommendations immediately.

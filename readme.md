# SQL-Inlay-Hints

## Overview

SQL-Inlay-Hints is a VS Code extension that parses SQL insert statements and
shows inline hints for column and value positions inside the editor.

## Structure

* `src/rules/` contains parsing, decoration, and provider logic
* `src/assets/` contains shared helpers and types
* `src/exports/` exposes barrel modules used across the extension
* root metadata files define the package and editor contribution surface

## Notes

* The extension is editor-focused and does not expose a separate CLI.
* Hint generation stays isolated inside the rules layer.

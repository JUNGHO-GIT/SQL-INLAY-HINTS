# Architecture

## Overview

`SQL-Inlay-Hints` follows a **Parser-Provider** architecture to provide Inlay Hints for SQL INSERT statements. It parses SQL text to identify INSERT queries and generates hints that display column names before each value.

## Project Structure

```text
src/
├── extension.ts           # Entry Point (Activation & Provider Registration)
├── rules/                 # Core Logic (Parser & Provider)
│   ├── Parser.ts          # SQL INSERT Statement Parser
│   └── Provider.ts        # InlayHintsProvider Implementation
├── exports/               # Centralized Exports
│   ├── ExportLibs.ts      # External Libraries (vscode, fs, path)
│   ├── ExportScripts.ts   # Utility Scripts (logger, notify)
│   ├── ExportTypes.ts     # Type Definitions
│   └── ExportRules.ts     # Parser & Provider Exports
└── assets/                # Utilities (Logger, Notify, Types)
    ├── scripts/           # Logger, Modules, Notify
    └── type/domain/       # Type Definitions (sql.ts)
```

## Core Components

| Component | Role | Description |
| :--- | :--- | :--- |
| **Extension** | Entry Point | Registers InlayHintsProvider on activation |
| **Parser** | SQL Parsing | Parses INSERT VALUES and INSERT SELECT statements |
| **Provider** | Hint Generation | Creates InlayHint objects for each column-value pair |
| **Logger** | Logging | Outputs debug/info/warn/error messages |

## Data Flow

1. **Extension Activation**: VS Code triggers `activate()` on startup.
2. **Provider Registration**: `createInlayHintsProvider()` registers for SQL files.
3. **Document Change**: VS Code calls `provideInlayHints()` when SQL file is opened/edited.
4. **Parsing**: `findInsertValues()` and `findInsertSelect()` extract column-value mappings.
5. **Hint Creation**: `createHintsForValues()` and `createHintsForSelect()` generate hints.
6. **Display**: VS Code renders hints inline before each value.

## Supported Patterns

| Pattern | Regex | Example |
| :--- | :--- | :--- |
| INSERT VALUES | `INSERT INTO table (cols) VALUES (vals)` | `INSERT INTO users (id, name) VALUES (1, 'John')` |
| INSERT SELECT | `INSERT INTO table (cols) SELECT cols FROM` | `INSERT INTO backup (id) SELECT id FROM users` |

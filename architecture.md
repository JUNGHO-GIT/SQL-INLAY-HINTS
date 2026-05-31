# sql-inlay-hints Architecture

## Structure Map

```text
sql-inlay-hints
|-- src/
|   |-- rules/       -> SQL parsing and hint rules
|   |-- assets/      -> shared helpers and types
|   `-- exports/     -> public barrels
|-- out/             -> compiled extension output
`-- package.json     -> extension metadata and scripts
```

## Flow Map

```text
SQL or mapper document
  -> INSERT structure is parsed
  -> columns are matched with values
  -> hint decorations are created
  -> VS Code renders inline hints
```

## Boundaries

- Rule logic stays under `src/rules/`.
- Helpers stay centralized under `src/assets/`.
- `out/` is generated from source.
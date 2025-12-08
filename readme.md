# SQL-Inlay-Hints

A lightweight VS Code extension that provides Inlay Hints for SQL INSERT statements.  
Display column names as hints before each value in INSERT queries for better readability.

## Key Features

| Feature | Description |
| :--- | :--- |
| **INSERT VALUES** | Display column hints for `INSERT INTO ... VALUES` statements |
| **INSERT SELECT** | Display column hints for `INSERT INTO ... SELECT` statements |
| **Multi-Row Support** | Handle multiple VALUES rows in a single INSERT |
| **Nested Parsing** | Correctly parse nested parentheses and string literals |
| **Alias Recognition** | Recognize column aliases in SELECT statements |

## Supported Syntax

```sql
-- Basic INSERT VALUES
INSERT INTO users
(id, name, email)
VALUES
(id: 1, name: 'John', email: 'john@email.com');

-- Multi-Row INSERT
INSERT INTO users
( id, name )
VALUES
(id: 1, name: 'Alice'),
(id: 2, name: 'Bob');

-- INSERT SELECT
INSERT INTO backup
( id, username, email )
SELECT
    id,                  -- id:
    name AS username,    -- username:
    email                -- email:
FROM users;
```

> Column names before `:` are **Inlay Hints** displayed by the extension.

## Settings

| Setting | Default | Description |
| :--- | :--- | :--- |
| `SQL-Inlay-Hints.logLevel` | `info` | Log level: off, debug, info, warn, error |

## Architecture

[Architecture Document](./architecture.md)

## License

[Apache License 2.0](./license.md)

# Copilot Instructions — SQL-Inlay-Hints

## 1. Core Principles

- **Readability > Performance > Cleverness** — Write code that is self-documenting and maintainable
- **SRP (Single Responsibility Principle)** — One function = one task
- **Fail-fast** — Return early on errors with contextual messages; don't continue with invalid state
- **Explicit over implicit** — Use descriptive names (request not req), explicit types, clear logic

---

## 2. Formatting Rules (HIGHEST PRIORITY)

### Braces and Line Breaks

- NEVER single-line if/else/try/catch/loop — ALWAYS braces {} + line breaks
- `else` and `catch` MUST start on a NEW LINE after closing }
- Max 4-level nesting; extract helper functions if deeper

```typescript
// ✅ DO: Always use braces with line breaks
if (condition) {
  doSomething();
}
else {
  doOtherThing();
}

// ❌ DON'T: Single-line statements
if (condition) doSomething();
```

### Spacing and Indentation

- ONE SPACE around `=` and `:` characters
- NEVER pad spaces to vertically align `=` across lines
- Exception: no space in arrow param defaults `(a=1)=>{}`
- Use 2-space indentation (from `.editorconfig`)

### Comments

- Format: `// 1. name ----` (pad dashes to column 90)
- Use comments to explain WHY, not WHAT
- Document complex business logic and non-obvious decisions

---

## 3. Naming Conventions

| Type | Convention | Example |
|------|-----------|---------|
| Files (classes/types) | PascalCase | `Parser.ts`, `Provider.ts` |
| Files (utilities) | camelCase | `logger.ts`, `notify.ts` |
| Barrel exports | Export\<Name\>.ts | `ExportLibs.ts` |
| Classes | PascalCase | `InlayHintsProvider` |
| Functions | camelCase | `parseInsertStatement` |
| Constants | UPPER_SNAKE_CASE | `MAX_HINTS` |
| Interfaces/Types | PascalCase | `SqlInsertInfo` |

---

## 4. Java Rules (Java 11)

### Null Safety

- NEVER return null — Use `Optional<T>` or `Collections.emptyList()`
- Use `Objects.requireNonNull()` for required parameters

### Resource Management

- ALWAYS use try-with-resources for AutoCloseable objects

### Immutability

- Prefer `final` for fields and local variables
- Return defensive copies of mutable state

### Exception Handling

- Catch SPECIFIC exceptions, never generic `Exception` or `Throwable`
- NEVER empty catch — always log or rethrow with context

### Best Practices

- Declare by interface: `List<T>` not `ArrayList<T>`
- Prefer Stream API over traditional for-loops
- Use `StringBuilder` in loops; `String.format()` for complex concatenation
- No magic values — extract to `private static final` constants

---

## 5. TypeScript Rules

### Type Safety

- NEVER use `any` — Use `unknown` or define explicit interfaces
- Always provide explicit type annotations for function parameters and return values
- Use `Optional<T>` or `undefined` instead of null when appropriate

```typescript
// ✅ DO: Explicit types
const parseColumns = (text: string, offset: number): string[] => {
  const columns: string[] = [];
  // ... implementation
  return columns;
};

// ❌ DON'T: Using any
const parseColumns = (text: any): any => { }
```

### Single Exit Point

- NO early/mid-function returns (assign to variable, return at end)
- Name the result variable descriptively per context, NOT a fixed name like `rs` or `result`

```typescript
// ✅ DO: Single exit point
const findUser = (id: string): User | undefined => {
  let user: User | undefined = undefined;

  if (id) {
    user = database.query(id);
  }

  return user;
};

// ❌ DON'T: Multiple returns
const findUser = (id: string): User | undefined => {
  if (!id) return undefined;  // ← violates single-exit rule
  return database.query(id);
};
```

### Ternary Chains

- ALWAYS use parentheses + newlines per branch

```typescript
const result = condition ? (
  valueA
) : conditionB ? (
  valueB
) : (
  fallback
);
```

### Object Literals

- Object keys: ALWAYS double-quoted `{ "key": value }`
- Prefer arrow functions for callbacks
- IIFE: extract variables first; minimize usage

### Control Flow

- Prefer `forEach`, `for...of`, `map`, `filter` over traditional for-loops
- DO NOT collapse conditions into single-line returns

---

## 6. SQL/MyBatis Rules

### Parameter Binding

- ALWAYS use `#{}` for parameter binding (prevents SQL injection)
- NEVER use `${}` for user input (use only for table/column names with strict validation)

```xml
<!-- ✅ DO: Use #{} for values -->
<select id="findUser">
  SELECT * FROM users WHERE id = #{userId}
</select>

<!-- ❌ DON'T: Use ${} for user input -->
<select id="findUser">
  SELECT * FROM users WHERE id = ${userId}
</select>
```

### SQL Formatting

- SQL keywords in UPPERCASE (SELECT, FROM, WHERE, INSERT, UPDATE, DELETE)
- Use consistent indentation for readability

```sql
INSERT INTO users (id, name, email)
VALUES (#{id}, #{name}, #{email})
```

---

## 7. Testing Rules

### Test Structure

- Use Given-When-Then pattern for test clarity
- Korean method names are ALLOWED for test methods (e.g., `테스트_사용자조회_성공()`)

```typescript
// Given: Setup test data
const userId = "test-123";
const expectedUser = { id: userId, name: "Test" };

// When: Execute action
const actualUser = findUser(userId);

// Then: Verify result
expect(actualUser).toEqual(expectedUser);
```

### Test Conventions

- Group related tests in describe blocks
- Use clear, descriptive test names
- Mock external dependencies
- Test both success and failure paths

---

## 8. Error Handling

### Core Rules

- Fail fast with contextual error messages
- NEVER empty catch — always log or rethrow
- Catch specific exception types, not generic `Error` or `unknown` without narrowing

```typescript
// ✅ DO: Handle errors explicitly
try {
  const result = parseQuery(text);
}
catch (error) {
  logger(`error`, `Failed to parse query: ${error}`);
  throw new Error(`Query parsing failed: ${error}`);
}

// ❌ DON'T: Empty catch
try {
  riskyOperation();
}
catch (error) {
  // Silent — NEVER do this
}
```

---

## 9. Commit Message Format

Use conventional commits format:

```
<type>: <short description>

Examples:
feat: add multi-statement hint support
fix: handle nested parentheses in VALUES parser
chore: bump @swc/core to 1.15.11
docs: update installation instructions
test: add tests for INSERT SELECT parsing
refactor: extract column mapping logic
```

Types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `style`, `perf`

---

## 10. Agent Behavior Rules

### Edit Discipline

- **Surgical editing**: Change ONLY the requested parts
- NEVER refactor, reformat, or rename unrelated code
- NEVER convert if-else to ternary/IIFE unless explicitly asked
- Preserve the original style for untouched code
- DO NOT add comments, docstrings, or type annotations to code you didn't change

### Tool Usage

- NEVER run ESLint auto-fix without developer approval — Report errors and let developer decide
- DO NOT blindly run build commands — Use the verified commands documented below
- DO NOT create helper scripts or automation unless explicitly requested

### Build Commands

- NEVER run `npm install` without `--legacy-peer-deps` flag
- Build command: `node_modules/.bin/swc src -d out --strip-leading-paths --config-file .server.swcrc`
- Alternative (requires bun): `npm run build`
- Type check: `npx tsc --noEmit`
- Lint: `npx eslint src/`

### Reporting

- If a documented command fails, DO NOT silently try alternatives
- Report the failure and exact error message so instructions can be updated
- State assumptions before writing code
- Code must be copy-paste ready and syntactically complete

---

## 11. Changes Section (REQUIRED)

After completing work, provide a summary in this format:

```
## Changes

- `src/rules/Parser.ts`: Added support for nested SELECT statements
- `src/rules/Provider.ts`: Fixed hint positioning for multi-row inserts
- `.github/copilot-instructions.md`: Updated build commands
```

**Format**: One line per modified file with brief description of what changed and why.

---

## Agent Directive

Follow these instructions first. Only search the codebase when the information here is incomplete or appears incorrect.

If a command documented here fails, do NOT silently try alternatives. Report the failure and the exact error message so the instructions can be updated.

**Critical Notes:**
- Audience: senior developers — Skip tutorials and basic explanations
- NEVER fabricate APIs or libraries
- Agent mode: ignore config/lint errors; focus on logic
- Rules describe INTENT, not templates to copy — Choose names appropriate to actual context

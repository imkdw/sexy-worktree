# Nano Commit Skill

## Purpose

Stage and commit changes at nano granularity — one logical change per commit. Ensures commits look like they were authored by a real developer with no AI fingerprints.

## Hard Rules

- **No AI attribution.** Never include `Co-Authored-By`, `Claude`, `Anthropic`, `OpenAI`, `GPT`, `AI`, `Copilot`, or any AI-related name in commit messages, author fields, or trailers.
- **Conventional-commit prefix required.** Every commit message must start with one of the allowed prefixes followed by `: ` and a Korean description. Allowed prefixes: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `style`, `perf`. Do not use bracket tags like `[Fix]` or `[Feature]`.
- **Nano commits.** Each commit must represent exactly one logical change. Split by feature, impact area, or file group. Never bundle unrelated changes.
- **Post-commit verification.** After all commits, run `git log` and confirm zero AI-related strings appear.
- **Exclude plan documents.** Never stage or commit files under `_workspace/` or `plans/`. These are temporary planning artifacts, not deliverables.

## Workflow

### Step 1: Analyze Changes

```bash
git status
git diff
git diff --cached
```

Review all modified, added, and deleted files. Understand what each change does.

**Skip files under `_workspace/` and `plans/`** — these are temporary planning documents and must not be committed.

### Step 2: Group into Nano Units

Categorize changes into the smallest meaningful commit units:

| Grouping criteria       | Example                              |
| ----------------------- | ------------------------------------ |
| Single feature addition | New search field added to one module |
| Single bug fix          | Off-by-one error in pagination       |
| Single refactor         | Rename variable across related files |
| Config/infra change     | Update environment variable          |
| Test update             | Add/modify tests for one feature     |

**Rule of thumb:** If you can describe the change in one short sentence without using "and", it is one nano unit. If you need "and", split it.

### Step 3: Stage and Commit Each Unit

For each nano unit, stage only the relevant files:

```bash
git add path/to/file1.ts path/to/file2.ts
```

Write the commit message with a conventional-commit prefix and Korean description via HEREDOC:

```bash
git commit -m "$(cat <<'EOF'
feat: 매장 음식 검색기능에 영문 검색 기능 추가
EOF
)"
```

**Choosing the prefix:**

| Prefix     | When to use                                        |
| ---------- | -------------------------------------------------- |
| `feat`     | 새로운 기능 추가                                   |
| `fix`      | 버그 수정                                          |
| `refactor` | 동작 변화 없는 코드 구조 개선                      |
| `chore`    | 빌드/설정/패키지 등 잡무                           |
| `docs`     | 문서만 변경                                        |
| `test`     | 테스트 추가/수정                                   |
| `style`    | 포맷팅, 세미콜론 등 동작과 무관한 스타일 변경      |
| `perf`     | 성능 개선                                          |

**Never use `git add .` or `git add -A`** — always stage specific files to keep commits atomic.

### Step 4: Post-Commit Verification

After all commits are done, run:

```bash
git log --format="%H %an %ae %s" -10
```

Scan the output for any of these forbidden strings (case-insensitive):

- `Claude`
- `Anthropic`
- `OpenAI`
- `GPT`
- `Copilot`
- `AI`
- `Co-Authored-By`
- `noreply@anthropic.com`

If any match is found, amend the offending commit immediately to remove the AI reference.

## Commit Message Style

### Good Examples

```
feat: 매장 음식 검색기능에 영문 검색 및 대/소문자 구분 기능 추가
fix: 관리자 음식 목록 페이지네이션 오류 수정
feat: 재료 비활성시 경고 다이얼로그 추가
feat: 프랜차이즈 매장재료 테이블에 사용중인 음식 컬럼 추가
feat: 카테고리 비활성 상태 추가
refactor: 음식 검색 쿼리 빌더 함수 분리
chore: eslint 규칙 업데이트
docs: 매장 음식 API 사용법 추가
```

### Bad Examples

```
매장 음식 검색기능에 영문 검색 기능 추가                  ← prefix 누락
[Feature] 영문 검색 기능 추가                             ← bracket tag 사용 금지
feat(store-food): add English search                       ← scope/영문 본문 금지
fix : 매장 음식 검색 오류 수정                            ← 콜론 앞 공백 금지
feat: 매장 음식 검색 오류 수정 및 페이지네이션 개선 및 테스트 추가  ← too many changes in one commit
```

## Verification Checklist

After completing all commits:

1. `git log -10` — 모든 커밋 메시지가 허용된 prefix로 시작하는지, 본문이 한국어인지 확인
2. `git log --format="%an <%ae>" -10` — confirm author is the real developer, not AI
3. `git log --format="%b" -10` — confirm no `Co-Authored-By` or AI trailers in body
4. `git diff --cached` — confirm nothing is left staged accidentally
5. `git status` — confirm working tree is clean or only intentionally unstaged files remain

# tree-sitter-abla

A [tree-sitter](https://tree-sitter.github.io) grammar for [Abla](https://github.com/AndreBaltazar8/ablac),
for syntax highlighting, indentation and text objects in Neovim, Helix and Zed.

- `grammar.js`: the grammar. Statements end at a newline or `;`, so the external scanner (`src/scanner.c`)
  emits the statement-ending newline, and not for a line that continues the one above (it starts with `.`,
  `?.`, `??`, `else`, or a binary `+` or `-` followed by a space). It also scans nested block comments and the
  raw body of a `$name(...) { ... }` compile-time subparser block.
- `queries/`: `highlights.scm`, `indents.scm`, `textobjects.scm`, `locals.scm`, `injections.scm`.
- `test/corpus.sh`: parses every `.ab` file of a checkout of ablac (`stdlib`, `src`, `tests/cases`) and fails
  on a file with an `ERROR` or `MISSING` node unless `test/known-gaps.txt` lists it.

## Use

Neovim (nvim-treesitter, `main` branch):

```lua
vim.api.nvim_create_autocmd("User", {
  pattern = "TSUpdate",
  callback = function()
    require("nvim-treesitter.parsers").abla = {
      install_info = { url = "https://github.com/AndreBaltazar8/tree-sitter-abla", queries = "queries" },
    }
  end,
})
```

Helix and Zed: see `editors/helix` and `editors/zed` in [abla-lsp](https://github.com/AndreBaltazar8/abla-lsp).

## Develop

```sh
npm install -g tree-sitter-cli   # or: nix-shell -p tree-sitter nodejs gcc
tree-sitter generate
tree-sitter test
sh test/corpus.sh /path/to/ablac
```

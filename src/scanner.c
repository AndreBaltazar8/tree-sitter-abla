// External scanner for tree-sitter-abla: statement-ending newlines, nested block
// comments, the text of string literals, and the raw text of `$name ...` subparser
// sites (whose syntax belongs to the provider, not to the language).
#include "tree_sitter/parser.h"
#include <stdbool.h>
#include <string.h>

enum TokenType {
  NEWLINE,
  BLOCK_COMMENT,
  SUBPARSER_BRACE,
  SUBPARSER_RAW,
  STRING_CONTENT,
  ERROR_SENTINEL,
};

void *tree_sitter_abla_external_scanner_create(void) { return NULL; }
void tree_sitter_abla_external_scanner_destroy(void *payload) { (void)payload; }
unsigned tree_sitter_abla_external_scanner_serialize(void *payload, char *buffer) {
  (void)payload; (void)buffer;
  return 0;
}
void tree_sitter_abla_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {
  (void)payload; (void)buffer; (void)length;
}

static void advance(TSLexer *lexer) { lexer->advance(lexer, false); }
static void skip(TSLexer *lexer) { lexer->advance(lexer, true); }

static bool is_space(int32_t c) { return c == ' ' || c == '\t' || c == '\r'; }
static bool is_letter(int32_t c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'; }
static bool is_word(int32_t c) { return is_letter(c) || (c >= '0' && c <= '9'); }

// Scans a block comment after its opening `/*` was consumed. Block comments nest.
static bool finish_block_comment(TSLexer *lexer) {
  int depth = 1;
  while (depth > 0) {
    if (lexer->eof(lexer)) return false;
    if (lexer->lookahead == '/') {
      advance(lexer);
      if (lexer->lookahead == '*') { advance(lexer); depth++; }
    } else if (lexer->lookahead == '*') {
      advance(lexer);
      if (lexer->lookahead == '/') { advance(lexer); depth--; }
    } else {
      advance(lexer);
    }
  }
  return true;
}

// Whether the text after a newline continues the expression above: a line starting
// with `.` (not `..`), `?.`, `??`, a binary `+` or `-` followed by a space, or `else`.
// Blank lines and comments are skipped on the way. The lexer's token already ended
// at the newline (mark_end).
static bool next_line_continues(TSLexer *lexer) {
  for (;;) {
    while (is_space(lexer->lookahead) || lexer->lookahead == '\n') advance(lexer);
    if (lexer->lookahead == '/') {
      advance(lexer);
      if (lexer->lookahead == '/') {
        while (lexer->lookahead != '\n' && !lexer->eof(lexer)) advance(lexer);
        continue;
      }
      if (lexer->lookahead == '*') {
        advance(lexer);
        if (!finish_block_comment(lexer)) return false;
        continue;
      }
      return false;
    }
    break;
  }
  int32_t c = lexer->lookahead;
  if (c == '.') {
    advance(lexer);
    return lexer->lookahead != '.';
  }
  if (c == '?') {
    advance(lexer);
    return lexer->lookahead == '.' || lexer->lookahead == '?';
  }
  if (c == '+' || c == '-') {
    advance(lexer);
    return lexer->lookahead == ' ';
  }
  if (c == 'e') {
    const char *word = "else";
    for (int i = 0; word[i]; i++) {
      if (lexer->lookahead != word[i]) return false;
      advance(lexer);
    }
    return !is_word(lexer->lookahead);
  }
  return false;
}

// A `{ ... }` block of raw text, balancing braces and skipping string literals.
static bool scan_subparser_body(TSLexer *lexer) {
  if (lexer->lookahead != '{') return false;
  advance(lexer);
  int depth = 1;
  while (depth > 0) {
    if (lexer->eof(lexer)) return false;
    int32_t c = lexer->lookahead;
    if (c == '{') { depth++; advance(lexer); }
    else if (c == '}') { depth--; advance(lexer); }
    else if (c == '"') {
      advance(lexer);
      while (!lexer->eof(lexer) && lexer->lookahead != '"') {
        if (lexer->lookahead == '\\') advance(lexer);
        advance(lexer);
      }
      advance(lexer);
    } else advance(lexer);
  }
  return true;
}

// The raw text after `$name`: to the end of the line, or the end of the enclosing
// construct, balancing brackets and skipping string literals.
static bool scan_subparser_raw(TSLexer *lexer) {
  int depth = 0;
  bool any = false;
  for (;;) {
    if (lexer->eof(lexer)) break;
    int32_t c = lexer->lookahead;
    if (depth == 0 && (c == '\n' || c == ';' || c == ')' || c == ']' || c == '}' || c == ',')) break;
    if (c == '(' || c == '[' || c == '{') depth++;
    else if (c == ')' || c == ']' || c == '}') depth--;
    else if (c == '"') {
      advance(lexer);
      while (!lexer->eof(lexer) && lexer->lookahead != '"') {
        if (lexer->lookahead == '\\') advance(lexer);
        advance(lexer);
      }
    }
    advance(lexer);
    lexer->mark_end(lexer);
    any = true;
  }
  return any;
}

bool tree_sitter_abla_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  (void)payload;
  if (valid_symbols[ERROR_SENTINEL]) return false;

  if (valid_symbols[STRING_CONTENT]) {
    // Inside a string literal: text up to a quote, an escape or an interpolation.
    // Nothing in a string is a comment.
    bool any = false;
    for (;;) {
      int32_t c = lexer->lookahead;
      if (lexer->eof(lexer) || c == '"' || c == '\\') break;
      if (c == '$') {
        lexer->mark_end(lexer);
        advance(lexer);
        int32_t d = lexer->lookahead;
        if (d == '{' || is_letter(d)) {
          lexer->result_symbol = STRING_CONTENT;
          return any;
        }
        any = true;
        continue;
      }
      advance(lexer);
      any = true;
    }
    lexer->mark_end(lexer);
    lexer->result_symbol = STRING_CONTENT;
    return any;
  }

  if (valid_symbols[SUBPARSER_BRACE]) {
    while (is_space(lexer->lookahead)) skip(lexer);
    int32_t b = lexer->lookahead;
    if (b == '{') {
      lexer->result_symbol = SUBPARSER_BRACE;
      return scan_subparser_body(lexer);
    }
    if (is_word(b) || b == '"' || b == '<' || b == '[') {
      lexer->result_symbol = SUBPARSER_BRACE;
      return scan_subparser_raw(lexer);
    }
  }

  if (valid_symbols[SUBPARSER_RAW]) {
    while (is_space(lexer->lookahead)) skip(lexer);
    int32_t c = lexer->lookahead;
    if (c == '\n' || lexer->eof(lexer) || c == ')' || c == ']' || c == '}' || c == ',' || c == ';' || c == '(') return false;
    lexer->result_symbol = SUBPARSER_RAW;
    return scan_subparser_raw(lexer);
  }

  if (valid_symbols[NEWLINE]) {
    while (is_space(lexer->lookahead)) skip(lexer);
    if (lexer->lookahead == '\n') {
      advance(lexer);
      lexer->mark_end(lexer);
      lexer->result_symbol = NEWLINE;
      return !next_line_continues(lexer);
    }
    // No newline at the end of the file: a zero-width token there would repeat for ever.
  }

  if (valid_symbols[BLOCK_COMMENT]) {
    while (is_space(lexer->lookahead) || lexer->lookahead == '\n') skip(lexer);
    if (lexer->lookahead == '/') {
      advance(lexer);
      if (lexer->lookahead == '*') {
        advance(lexer);
        lexer->result_symbol = BLOCK_COMMENT;
        return finish_block_comment(lexer);
      }
    }
  }
  return false;
}

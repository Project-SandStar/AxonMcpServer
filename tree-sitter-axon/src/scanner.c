/**
 * External scanner for Axon tree-sitter grammar.
 *
 * Handles two same-line lookahead tokens matching Haxall's isEos behavior:
 *
 * 1. TRAILING_LAMBDA_AHEAD — detects trailing lambda after a call's closing
 *    paren on the same line. Matches Parser.fan call() lines 646-648:
 *      if (!isEos && (cur === Token.id || cur === Token.lparen))
 *        args.add(lamdba)
 *
 * 2. INDEX_AHEAD — detects [ on the same line for index expressions.
 *    Prevents newline-separated [list] from being misinterpreted as
 *    index access on the preceding expression.
 *    Matches Haxall's isEos — after a newline, [ starts a new expression.
 *
 * Both tokens are zero-width (mark_end called before any advance).
 */

#include "tree_sitter/parser.h"
#include <stdbool.h>

enum TokenType {
  TRAILING_LAMBDA_AHEAD,
  INDEX_AHEAD,
};

// No scanner state needed
void *tree_sitter_axon_external_scanner_create(void) { return NULL; }
void tree_sitter_axon_external_scanner_destroy(void *payload) {}
unsigned tree_sitter_axon_external_scanner_serialize(void *payload, char *buffer) { return 0; }
void tree_sitter_axon_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {}

static inline bool is_alpha(int32_t c) {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

static inline bool is_id_start(int32_t c) {
  return (c >= 'a' && c <= 'z') || c == '_';
}

static inline bool is_id_char(int32_t c) {
  return is_alpha(c) || (c >= '0' && c <= '9') || c == '_';
}

bool tree_sitter_axon_external_scanner_scan(
  void *payload,
  TSLexer *lexer,
  const bool *valid_symbols
) {
  if (!valid_symbols[TRAILING_LAMBDA_AHEAD] && !valid_symbols[INDEX_AHEAD]) {
    return false;
  }

  // Mark end immediately — both tokens are zero-width
  lexer->mark_end(lexer);

  // Skip spaces and tabs (not newlines)
  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, false);
  }

  // If we hit a newline or EOF, neither token applies (isEos = true)
  if (lexer->lookahead == '\n' || lexer->lookahead == '\r' || lexer->lookahead == 0) {
    return false;
  }

  // ── INDEX_AHEAD: [ on the same line ──────────────────────────────────
  if (valid_symbols[INDEX_AHEAD] && lexer->lookahead == '[') {
    lexer->result_symbol = INDEX_AHEAD;
    return true;
  }

  // ── TRAILING_LAMBDA_AHEAD: lambda pattern on the same line ───────────
  if (valid_symbols[TRAILING_LAMBDA_AHEAD]) {
    // Pattern 1: (params) => ...
    if (lexer->lookahead == '(') {
      lexer->advance(lexer, false);
      int depth = 1;

      // Scan to find matching close paren, tracking nesting
      while (depth > 0 && lexer->lookahead != 0) {
        if (lexer->lookahead == '(') {
          depth++;
        } else if (lexer->lookahead == ')') {
          depth--;
        }
        // Allow multi-line params (don't bail on newlines inside parens)
        if (depth > 0) {
          lexer->advance(lexer, false);
        }
      }

      if (depth != 0) return false;  // unbalanced parens

      // Advance past the closing )
      lexer->advance(lexer, false);

      // Skip whitespace (spaces/tabs only, not newlines)
      while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
        lexer->advance(lexer, false);
      }

      // Check for =>
      if (lexer->lookahead == '=') {
        lexer->advance(lexer, false);
        if (lexer->lookahead == '>') {
          lexer->result_symbol = TRAILING_LAMBDA_AHEAD;
          return true;
        }
      }

      return false;
    }

    // Pattern 2: id => ...
    if (is_id_start(lexer->lookahead)) {
      // Consume the identifier
      while (is_id_char(lexer->lookahead)) {
        lexer->advance(lexer, false);
      }

      // Skip whitespace (spaces/tabs only)
      while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
        lexer->advance(lexer, false);
      }

      // Check for =>
      if (lexer->lookahead == '=') {
        lexer->advance(lexer, false);
        if (lexer->lookahead == '>') {
          lexer->result_symbol = TRAILING_LAMBDA_AHEAD;
          return true;
        }
      }

      return false;
    }
  }

  return false;
}

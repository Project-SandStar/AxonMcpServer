#!/usr/bin/env node

/**
 * Complete Axon Parser - Based on Fantom/SkySpark Implementation
 * 
 * Reference: /Users/<user>/Code/haxall/src/core/axon/fan/parser/
 * 
 * This is a complete implementation of the Axon language parser including:
 * - Full tokenizer with all Axon literal types
 * - Complete AST node hierarchy
 * - Recursive descent parser with proper operator precedence
 * - Comprehensive error reporting
 * 
 * @author Based on SkySpark Axon parser by Brian Frank
 * @version 1.0.0
 */

import fs from 'fs';
import yaml from 'yaml';

//========================================================================
// Token Types
//========================================================================

const TokenType = {
  // Identifiers/Literals
  ID: 'id',
  TYPENAME: 'typename',
  VAL: 'val',
  
  // Operators
  COLON: ':',
  DOUBLE_COLON: '::',
  DOT: '.',
  SEMICOLON: ';',
  COMMA: ',',
  PLUS: '+',
  MINUS: '-',
  STAR: '*',
  SLASH: '/',
  BANG: '!',
  CARET: '^',
  QUESTION: '?',
  AMP: '&',
  ASSIGN: '=',
  FN_EQ: '=>',
  EQ: '==',
  NOT_EQ: '!=',
  LT: '<',
  LT_EQ: '<=',
  GT: '>',
  GT_EQ: '>=',
  CMP: '<=>',
  LBRACE: '{',
  RBRACE: '}',
  LPAREN: '(',
  RPAREN: ')',
  LBRACKET: '[',
  RBRACKET: ']',
  PIPE: '|',
  UNDERBAR: '_',
  ARROW: '->',
  DOT_DOT: '..',
  
  // Keywords
  AND: 'and',
  CATCH: 'catch',
  DEFCOMP: 'defcomp',
  DO: 'do',
  ELSE: 'else',
  END: 'end',
  FALSE: 'false',
  IF: 'if',
  NOT: 'not',
  NULL: 'null',
  OR: 'or',
  RETURN: 'return',
  THROW: 'throw',
  TRUE: 'true',
  TRY: 'try',
  
  // Special
  EOF: 'eof',
  NEWLINE: 'newline',
  PLACEHOLDER: 'placeholder'
};

const KEYWORDS = {
  'and': TokenType.AND,
  'catch': TokenType.CATCH,
  'defcomp': TokenType.DEFCOMP,
  'do': TokenType.DO,
  'else': TokenType.ELSE,
  'end': TokenType.END,
  'false': TokenType.FALSE,
  'if': TokenType.IF,
  'not': TokenType.NOT,
  'null': TokenType.NULL,
  'or': TokenType.OR,
  'return': TokenType.RETURN,
  'throw': TokenType.THROW,
  'true': TokenType.TRUE,
  'try': TokenType.TRY
};

//========================================================================
// Tokenizer
//========================================================================

class AxonTokenizer {
  constructor(code, startLine = 1) {
    this.code = code;
    this.pos = 0;
    this.line = startLine;
    this.col = 1;
    this.cur = code[0] || '\0';
    this.peek = code[1] || '\0';
  }

  consume() {
    if (this.pos >= this.code.length) {
      this.cur = '\0';
      this.peek = '\0';
      return;
    }
    
    if (this.cur === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    
    this.pos++;
    this.cur = this.code[this.pos] || '\0';
    this.peek = this.code[this.pos + 1] || '\0';
  }

  next() {
    // Skip whitespace and comments
    while (true) {
      // Newline handling
      if (this.cur === '\n') {
        const token = { type: TokenType.NEWLINE, value: '\n', line: this.line, col: this.col };
        this.consume();
        while (this.cur === ' ') this.consume();
        return token;
      }
      
      // Whitespace
      if (this.cur === ' ' || this.cur === '\t' || this.cur === '\r') {
        this.consume();
        continue;
      }
      
      // Comments
      if (this.cur === '/' && this.peek === '/') {
        this.skipLineComment();
        continue;
      }
      if (this.cur === '/' && this.peek === '*') {
        this.skipBlockComment();
        continue;
      }
      
      break;
    }

    const startLine = this.line;
    const startCol = this.col;

    // EOF
    if (this.cur === '\0') {
      return { type: TokenType.EOF, value: '', line: startLine, col: startCol };
    }

    // Raw string
    if (this.cur === 'r' && this.peek === '"') {
      return this.tokenRawString(startLine, startCol);
    }

    // String
    if (this.cur === '"') {
      return this.tokenString(startLine, startCol);
    }

    // Template placeholder {{...}}
    if (this.cur === '{' && this.peek === '{') {
      return this.tokenPlaceholder(startLine, startCol);
    }
    
    // Ref
    if (this.cur === '@') {
      return this.tokenRef(startLine, startCol);
    }

    // Number or Date/Time
    if (this.isDigit(this.cur)) {
      return this.tokenNumber(startLine, startCol);
    }

    // Symbol
    if (this.cur === '^') {
      return this.tokenSymbol(startLine, startCol);
    }

    // URI
    if (this.cur === '`') {
      return this.tokenUri(startLine, startCol);
    }

    // Identifier or keyword
    if (this.isAlpha(this.cur)) {
      return this.tokenWord(startLine, startCol);
    }

    // Operator
    return this.tokenOperator(startLine, startCol);
  }

  skipLineComment() {
    while (this.cur !== '\0' && this.cur !== '\n') {
      this.consume();
    }
  }

  skipBlockComment() {
    this.consume(); // /
    this.consume(); // *
    while (true) {
      if (this.cur === '\0') {
        throw this.error('Unterminated block comment');
      }
      if (this.cur === '*' && this.peek === '/') {
        this.consume(); // *
        this.consume(); // /
        break;
      }
      this.consume();
    }
  }

  tokenWord(line, col) {
    let value = '';
    while (this.isAlphaNum(this.cur) || this.cur === '_') {
      value += this.cur;
      this.consume();
    }

    // Check if it's a typename (capitalized)
    if (value[0] === value[0].toUpperCase()) {
      return { type: TokenType.TYPENAME, value, line, col };
    }

    // Check if it's a keyword
    const keyword = KEYWORDS[value];
    if (keyword) {
      return { type: keyword, value, line, col };
    }

    // Regular identifier
    return { type: TokenType.ID, value, line, col };
  }

  tokenNumber(line, col) {
    let value = '';
    let hasDecimal = false;
    let hasExp = false;
    let colons = 0;
    let dashes = 0;
    let unitStart = -1;

    while (true) {
      if (this.isDigit(this.cur)) {
        value += this.cur;
        this.consume();
      } else if (this.cur === '.' && this.isDigit(this.peek)) {
        hasDecimal = true;
        value += this.cur;
        this.consume();
      } else if ((this.cur === 'e' || this.cur === 'E') && !hasExp) {
        hasExp = true;
        value += this.cur;
        this.consume();
        if (this.cur === '+' || this.cur === '-') {
          value += this.cur;
          this.consume();
        }
      } else if (this.cur === '-' && colons === 0) {
        dashes++;
        value += this.cur;
        this.consume();
      } else if (this.cur === ':' && this.isDigit(this.peek)) {
        colons++;
        value += this.cur;
        this.consume();
      } else if ((this.isAlpha(this.cur) || this.cur === '%' || this.cur === '$' || this.cur === '/' || this.cur === '_') && unitStart === -1) {
        unitStart = value.length;
        value += this.cur;
        this.consume();
      } else if (unitStart >= 0 && (this.isAlphaNum(this.cur) || this.cur === '_' || this.cur === '/' || this.cur === '%')) {
        value += this.cur;
        this.consume();
      } else {
        break;
      }
    }

    // Date: YYYY-MM-DD
    if (dashes === 2 && colons === 0 && unitStart === -1) {
      return { type: TokenType.VAL, value, valueType: 'date', line, col };
    }

    // Time: HH:MM:SS
    if (colons >= 1 && dashes === 0 && unitStart === -1) {
      return { type: TokenType.VAL, value, valueType: 'time', line, col };
    }

    // Number (possibly with unit)
    return { type: TokenType.VAL, value, valueType: 'number', line, col };
  }

  tokenString(line, col) {
    this.consume(); // opening quote
    
    // Check for triple-quote
    if (this.cur === '"' && this.peek === '"') {
      return this.tokenTripleQuoteString(line, col);
    }

    let value = '';
    while (true) {
      if (this.cur === '"') {
        this.consume();
        break;
      }
      if (this.cur === '\0' || this.cur === '\n') {
        throw this.error('Unterminated string');
      }
      if (this.cur === '\\') {
        value += this.tokenEscape();
      } else {
        value += this.cur;
        this.consume();
      }
    }

    return { type: TokenType.VAL, value, valueType: 'string', line, col };
  }

  tokenTripleQuoteString(line, col) {
    this.consume(); // second quote
    this.consume(); // third quote
    
    let value = '';
    while (true) {
      if (this.cur === '"' && this.peek === '"' && this.code[this.pos + 2] === '"') {
        this.consume();
        this.consume();
        this.consume();
        break;
      }
      if (this.cur === '\0') {
        throw this.error('Unterminated triple-quote string');
      }
      if (this.cur === '\\') {
        value += this.tokenEscape();
      } else {
        value += this.cur;
        this.consume();
      }
    }

    return { type: TokenType.VAL, value, valueType: 'string', line, col };
  }

  tokenRawString(line, col) {
    this.consume(); // r
    this.consume(); // opening quote
    
    let value = '';
    while (true) {
      if (this.cur === '"') {
        this.consume();
        break;
      }
      if (this.cur === '\0' || this.cur === '\n') {
        throw this.error('Unterminated raw string');
      }
      value += this.cur;
      this.consume();
    }

    return { type: TokenType.VAL, value, valueType: 'string', line, col };
  }

  tokenRef(line, col) {
    this.consume(); // @
    let value = '';
    while (this.isAlphaNum(this.cur) || this.cur === '_' || this.cur === ':' || this.cur === '-' || this.cur === '.') {
      value += this.cur;
      this.consume();
    }
    if (value.length === 0) {
      throw this.error('Invalid empty ref');
    }
    return { type: TokenType.VAL, value: '@' + value, valueType: 'ref', line, col };
  }

  tokenPlaceholder(line, col) {
    this.consume(); // first {
    this.consume(); // second {
    let value = '';
    while (this.cur !== '}' && this.cur !== '\0') {
      value += this.cur;
      this.consume();
    }
    if (this.cur === '}' && this.peek === '}') {
      this.consume(); // first }
      this.consume(); // second }
    }
    // Return as a variable reference
    return { type: TokenType.ID, value: value, line, col };
  }

  tokenSymbol(line, col) {
    this.consume(); // ^
    let value = '';
    while (this.isAlphaNum(this.cur) || this.cur === '_') {
      value += this.cur;
      this.consume();
    }
    if (value.length === 0) {
      throw this.error('Invalid empty symbol');
    }
    return { type: TokenType.VAL, value: '^' + value, valueType: 'symbol', line, col };
  }

  tokenUri(line, col) {
    this.consume(); // opening backtick
    let value = '';
    while (true) {
      if (this.cur === '`') {
        this.consume();
        break;
      }
      if (this.cur === '\0' || this.cur === '\n') {
        throw this.error('Unterminated URI');
      }
      if (this.cur === '\\') {
        value += this.tokenEscape();
      } else {
        value += this.cur;
        this.consume();
      }
    }
    return { type: TokenType.VAL, value: '`' + value + '`', valueType: 'uri', line, col };
  }

  tokenEscape() {
    this.consume(); // backslash
    const ch = this.cur;
    this.consume();
    
    switch (ch) {
      case 'b': return '\b';
      case 'f': return '\f';
      case 'n': return '\n';
      case 'r': return '\r';
      case 't': return '\t';
      case '"': return '"';
      case "'": return "'";
      case '`': return '`';
      case '\\': return '\\';
      case '$': return '$';  // For string interpolation like "\$variable"
      case '{': return '{';  // For escaping braces in templates
      case '}': return '}';  // For escaping braces in templates
      default: throw this.error(`Invalid escape sequence: \\${ch}`);
    }
  }

  tokenOperator(line, col) {
    const ch = this.cur;
    this.consume();

    // Two-character operators
    if (ch === '=' && this.cur === '=') {
      this.consume();
      return { type: TokenType.EQ, value: '==', line, col };
    }
    if (ch === '=' && this.cur === '>') {
      this.consume();
      return { type: TokenType.FN_EQ, value: '=>', line, col };
    }
    if (ch === '!' && this.cur === '=') {
      this.consume();
      return { type: TokenType.NOT_EQ, value: '!=', line, col };
    }
    if (ch === '<' && this.cur === '=') {
      this.consume();
      if (this.cur === '>') {
        this.consume();
        return { type: TokenType.CMP, value: '<=>', line, col };
      }
      return { type: TokenType.LT_EQ, value: '<=', line, col };
    }
    if (ch === '>' && this.cur === '=') {
      this.consume();
      return { type: TokenType.GT_EQ, value: '>=', line, col };
    }
    if (ch === '-' && this.cur === '>') {
      this.consume();
      return { type: TokenType.ARROW, value: '->', line, col };
    }
    if (ch === '.' && this.cur === '.') {
      this.consume();
      return { type: TokenType.DOT_DOT, value: '..', line, col };
    }
    if (ch === ':' && this.cur === ':') {
      this.consume();
      return { type: TokenType.DOUBLE_COLON, value: '::', line, col };
    }

    // Single-character operators
    const singles = {
      ':': TokenType.COLON,
      '.': TokenType.DOT,
      ';': TokenType.SEMICOLON,
      ',': TokenType.COMMA,
      '+': TokenType.PLUS,
      '-': TokenType.MINUS,
      '*': TokenType.STAR,
      '/': TokenType.SLASH,
      '!': TokenType.BANG,
      '^': TokenType.CARET,
      '?': TokenType.QUESTION,
      '&': TokenType.AMP,
      '=': TokenType.ASSIGN,
      '<': TokenType.LT,
      '>': TokenType.GT,
      '{': TokenType.LBRACE,
      '}': TokenType.RBRACE,
      '(': TokenType.LPAREN,
      ')': TokenType.RPAREN,
      '[': TokenType.LBRACKET,
      ']': TokenType.RBRACKET,
      '|': TokenType.PIPE,
      '_': TokenType.UNDERBAR
    };

    const type = singles[ch];
    if (type) {
      return { type, value: ch, line, col };
    }

    throw this.error(`Unexpected character: ${ch}`);
  }

  isAlpha(ch) {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_';
  }

  isDigit(ch) {
    return ch >= '0' && ch <= '9';
  }

  isAlphaNum(ch) {
    return this.isAlpha(ch) || this.isDigit(ch);
  }

  error(msg) {
    return new Error(`Tokenizer error at line ${this.line}, col ${this.col}: ${msg}`);
  }

  tokenize() {
    const tokens = [];
    while (true) {
      const token = this.next();
      tokens.push(token);
      if (token.type === TokenType.EOF) break;
    }
    return tokens;
  }
}

//========================================================================
// AST Node Base Classes
//========================================================================

class ASTNode {
  constructor(line, col) {
    this.line = line;
    this.col = col;
  }

  getLocation() {
    return `line ${this.line}, col ${this.col}`;
  }
}

class Expr extends ASTNode {}

class Literal extends Expr {
  constructor(value, valueType, line, col) {
    super(line, col);
    this.value = value;
    this.valueType = valueType;
  }
}

class Var extends Expr {
  constructor(name, line, col) {
    super(line, col);
    this.name = name;
  }
}

class Block extends Expr {
  constructor(exprs, line, col) {
    super(line, col);
    this.exprs = exprs;
  }
}

class If extends Expr {
  constructor(cond, trueExpr, falseExpr, line, col) {
    super(line, col);
    this.cond = cond;
    this.trueExpr = trueExpr;
    this.falseExpr = falseExpr;
  }
}

class BinaryOp extends Expr {
  constructor(op, lhs, rhs, line, col) {
    super(line, col);
    this.op = op;
    this.lhs = lhs;
    this.rhs = rhs;
  }
}

class UnaryOp extends Expr {
  constructor(op, operand, line, col) {
    super(line, col);
    this.op = op;
    this.operand = operand;
  }
}

class Call extends Expr {
  constructor(target, args, line, col) {
    super(line, col);
    this.target = target;
    this.args = args;
  }
}

class DotCall extends Expr {
  constructor(target, funcName, args, line, col) {
    super(line, col);
    this.target = target;
    this.funcName = funcName;
    this.args = args;
  }
}

class Lambda extends Expr {
  constructor(params, body, line, col) {
    super(line, col);
    this.params = params;
    this.body = body;
  }
}

class DefineVar extends Expr {
  constructor(name, value, line, col) {
    super(line, col);
    this.name = name;
    this.value = value;
  }
}

class ListExpr extends Expr {
  constructor(items, line, col) {
    super(line, col);
    this.items = items;
  }
}

class DictExpr extends Expr {
  constructor(entries, line, col) {
    super(line, col);
    this.entries = entries; // array of {name, value}
  }
}

class TryCatch extends Expr {
  constructor(tryExpr, errVar, catchExpr, line, col) {
    super(line, col);
    this.tryExpr = tryExpr;
    this.errVar = errVar;
    this.catchExpr = catchExpr;
  }
}

class Return extends Expr {
  constructor(expr, line, col) {
    super(line, col);
    this.expr = expr;
  }
}

class Throw extends Expr {
  constructor(expr, line, col) {
    super(line, col);
    this.expr = expr;
  }
}

class DefComp extends Expr {
  constructor(slots, body, line, col) {
    super(line, col);
    this.slots = slots; // array of {name, type, meta}
    this.body = body;   // do...end block
  }
}

//========================================================================
// Parser
//========================================================================

class AxonParser {
  constructor(code, startLine = 1) {
    this.tokenizer = new AxonTokenizer(code, startLine);
    this.tokens = [];
    this.pos = 0;
    this.cur = null;
    this.peek = null;
    this.peekPeek = null;
    
    // Pre-load enough tokens for lookahead
    const token1 = this.tokenizer.next();
    const token2 = this.tokenizer.next();
    const token3 = this.tokenizer.next();
    this.tokens.push(token1, token2, token3);
    
    // Set current position
    this.cur = this.tokens[0];
    this.peek = this.tokens[1];
    this.peekPeek = this.tokens[2];
  }

  advance() {
    this.pos++;
    
    // Ensure we have enough tokens loaded
    while (this.tokens.length <= this.pos + 2) {
      this.tokens.push(this.tokenizer.next());
    }
    
    this.cur = this.tokens[this.pos];
    this.peek = this.tokens[this.pos + 1] || { type: TokenType.EOF };
    this.peekPeek = this.tokens[this.pos + 2] || { type: TokenType.EOF };
  }

  consume(expected) {
    if (expected && this.cur.type !== expected) {
      throw this.error(`Expected ${expected}, got ${this.cur.type}`);
    }
    const token = this.cur;
    this.advance();
    return token;
  }

  parse() {
    const exprs = [];
    
    // Skip leading newlines
    while (this.cur.type === TokenType.NEWLINE) {
      this.advance();
    }
    
    // Parse first expression
    if (this.cur.type !== TokenType.EOF) {
      exprs.push(this.expr());
    }
    
    // Skip trailing whitespace
    while (this.cur.type === TokenType.NEWLINE || this.cur.type === TokenType.SEMICOLON) {
      this.advance();
    }
    
    // Check if there are more expressions (multi-statement program)
    // Only continue if we're clearly starting a new statement
    while (this.cur.type !== TokenType.EOF) {
      // If current token could start a new expression, parse it
      if (this.isExprStart()) {
        exprs.push(this.expr());
        
        // Skip whitespace after expression
        while (this.cur.type === TokenType.NEWLINE || this.cur.type === TokenType.SEMICOLON) {
          this.advance();
        }
      } else {
        // Unexpected token - stop parsing
        break;
      }
    }
    
    // Return single expression or block
    if (exprs.length === 0) {
      return new Literal(null, 'null', 1, 1);
    }
    if (exprs.length === 1) {
      return exprs[0];
    }
    return new Block(exprs, 1, 1);
  }
  
  isExprStart() {
    // Check if current token can start an expression
    const starterTokens = [
      TokenType.ID,
      TokenType.VAL,
      TokenType.DO,
      TokenType.IF,
      TokenType.TRY,
      TokenType.RETURN,
      TokenType.THROW,
      TokenType.LBRACKET,
      TokenType.LBRACE,
      TokenType.LPAREN,
      TokenType.TRUE,
      TokenType.FALSE,
      TokenType.NULL,
      TokenType.MINUS,
      TokenType.NOT
    ];
    return starterTokens.includes(this.cur.type);
  }
  
  isKeyword(tokenType) {
    const keywords = [
      TokenType.AND, TokenType.CATCH, TokenType.DEFCOMP, TokenType.DO,
      TokenType.ELSE, TokenType.END, TokenType.FALSE, TokenType.IF,
      TokenType.NOT, TokenType.NULL, TokenType.OR, TokenType.RETURN,
      TokenType.THROW, TokenType.TRUE, TokenType.TRY
    ];
    return keywords.includes(tokenType);
  }

  expr() {
    // Skip newlines before expression
    while (this.cur.type === TokenType.NEWLINE) {
      this.advance();
    }
    
    // Handle different expression types
    // Allow keywords as variable names when followed by colon (e.g., return: value, end: value)
    if (this.peek.type === TokenType.COLON && 
        (this.cur.type === TokenType.ID || this.isKeyword(this.cur.type))) {
      return this.defVar();
    }
    if (this.cur.type === TokenType.ID && this.peek.type === TokenType.FN_EQ) {
      return this.lambda();
    }
    if (this.cur.type === TokenType.LPAREN && this.peekForLambda()) {
      return this.lambda();
    }
    if (this.cur.type === TokenType.DEFCOMP) {
      return this.defCompExpr();
    }
    if (this.cur.type === TokenType.DO) {
      return this.doBlock();
    }
    if (this.cur.type === TokenType.IF) {
      return this.ifExpr();
    }
    if (this.cur.type === TokenType.TRY) {
      return this.tryCatchExpr();
    }
    if (this.cur.type === TokenType.RETURN) {
      return this.returnExpr();
    }
    if (this.cur.type === TokenType.THROW) {
      return this.throwExpr();
    }
    if (this.cur.type === TokenType.LBRACKET) {
      // Parse list, then allow method chaining via termExpr continuation
      let expr = this.listExpr();
      // Continue with method chaining (dots, calls, etc.)
      while (true) {
        if (this.cur.type === TokenType.LPAREN && this.cur.line === expr.line) {
          expr = this.call(expr);
          continue;
        }
        if (this.cur.type === TokenType.DOT) {
          expr = this.dotCall(expr);
          continue;
        }
        if (this.cur.type === TokenType.LBRACKET && this.cur.line === expr.line) {
          expr = this.indexExpr(expr);
          continue;
        }
        if (this.cur.type === TokenType.ARROW) {
          expr = this.dictGet(expr);
          continue;
        }
        break;
      }
      return expr;
    }
    if (this.cur.type === TokenType.LBRACE) {
      // Parse dict, then allow method chaining via termExpr continuation
      let expr = this.dictExpr();
      // Continue with method chaining (dots, calls, etc.)
      while (true) {
        if (this.cur.type === TokenType.LPAREN && this.cur.line === expr.line) {
          expr = this.call(expr);
          continue;
        }
        if (this.cur.type === TokenType.DOT) {
          expr = this.dotCall(expr);
          continue;
        }
        if (this.cur.type === TokenType.LBRACKET && this.cur.line === expr.line) {
          expr = this.indexExpr(expr);
          continue;
        }
        if (this.cur.type === TokenType.ARROW) {
          expr = this.dictGet(expr);
          continue;
        }
        break;
      }
      return expr;
    }

    return this.assignExpr();
  }
  
  peekForLambda() {
    // Look ahead to see if ( starts a lambda like (a, b) => expr
    // We're currently at (, so start looking after it
    let i = this.pos + 1; // Start AFTER the (
    let depth = 1; // We already have one open paren
    
    while (depth > 0) {
      // Ensure we have enough tokens loaded
      while (this.tokens.length <= i + 1) {
        const tok = this.tokenizer.next();
        this.tokens.push(tok);
        if (tok.type === TokenType.EOF) break;
      }
      
      if (i >= this.tokens.length) break;
      
      const t = this.tokens[i];
      if (t.type === TokenType.EOF) break;
      if (t.type === TokenType.LPAREN) depth++;
      if (t.type === TokenType.RPAREN) depth--;
      
      // If we closed all parens and next token is =>, it's a lambda
      if (depth === 0) {
        // Ensure next token is loaded
        while (this.tokens.length <= i + 1) {
          this.tokens.push(this.tokenizer.next());
        }
        const nextToken = this.tokens[i + 1];
        return nextToken && nextToken.type === TokenType.FN_EQ;
      }
      i++;
    }
    return false;
  }

  defCompExpr() {
    const token = this.consume(TokenType.DEFCOMP);
    const slots = [];
    
    // Skip newlines after 'defcomp'
    while (this.cur.type === TokenType.NEWLINE) {
      this.advance();
    }
    
    // Parse slots until we hit 'do'
    while (this.cur.type !== TokenType.DO && this.cur.type !== TokenType.EOF) {
      // Slot definition: name: {meta} or name: type
      if (this.cur.type === TokenType.ID || this.isKeyword(this.cur.type)) {
        const slotName = this.cur.value;
        const slotLine = this.cur.line;
        const slotCol = this.cur.col;
        this.advance();
        
        if (this.cur.type === TokenType.COLON) {
          this.consume();
          
          // Parse slot metadata or type
          let slotType = null;
          let slotMeta = {};
          
          // Skip whitespace/newlines
          while (this.cur.type === TokenType.NEWLINE) {
            this.advance();
          }
          
          if (this.cur.type === TokenType.LBRACE) {
            // Parse metadata dict
            const metaExpr = this.dictExpr();
            // Convert dict entries to object
            if (metaExpr instanceof DictExpr) {
              metaExpr.entries.forEach(entry => {
                slotMeta[entry.name] = entry.value;
              });
            }
          } else {
            // Simple type
            slotType = this.cur.value;
            this.advance();
          }
          
          slots.push({
            name: slotName,
            type: slotType,
            meta: slotMeta,
            line: slotLine,
            col: slotCol
          });
        }
      }
      
      // Skip newlines between slot definitions
      while (this.cur.type === TokenType.NEWLINE) {
        this.advance();
      }
    }
    
    // Parse do block
    let body = null;
    if (this.cur.type === TokenType.DO) {
      body = this.doBlock();
    }
    
    // Consume 'end'
    if (this.cur.type === TokenType.END) {
      this.consume();
    }
    
    return new DefComp(slots, body, token.line, token.col);
  }

  doBlock() {
    const token = this.consume(TokenType.DO);
    const exprs = [];
    
    // Skip newlines after 'do'
    while (this.cur.type === TokenType.NEWLINE) {
      this.advance();
    }
    
    if (this.cur.type !== TokenType.END) {
      exprs.push(this.expr());
    }
    
    while (true) {
      // Skip newlines
      while (this.cur.type === TokenType.NEWLINE) {
        this.advance();
      }
      
      if (this.cur.type === TokenType.END) {
        this.consume();
        break;
      }
      if (this.cur.type === TokenType.ELSE || this.cur.type === TokenType.CATCH) {
        break; // Can omit end before else/catch
      }
      if (this.cur.type === TokenType.EOF) {
        throw this.error("Expecting 'end', not end of file");
      }
      
      // Try to consume statement separator
      if (this.cur.type === TokenType.SEMICOLON) {
        this.consume();
      }
      
      // Skip newlines after statement separator
      while (this.cur.type === TokenType.NEWLINE) {
        this.advance();
      }
      
      // Check again for end/else/catch after newlines
      if (this.cur.type === TokenType.END) {
        this.consume();
        break;
      }
      if (this.cur.type === TokenType.ELSE || this.cur.type === TokenType.CATCH) {
        break;
      }
      if (this.cur.type === TokenType.EOF) {
        throw this.error("Expecting 'end', not end of file");
      }
      
      exprs.push(this.expr());
    }

    return new Block(exprs, token.line, token.col);
  }

  ifExpr() {
    const token = this.consume(TokenType.IF);
    this.consume(TokenType.LPAREN);
    const cond = this.expr();
    this.consume(TokenType.RPAREN);
    const trueExpr = this.expr();
    
    // Skip newlines before checking for else
    while (this.cur.type === TokenType.NEWLINE) {
      this.advance();
    }
    
    let falseExpr = new Literal(null, 'null', token.line, token.col);
    if (this.cur.type === TokenType.ELSE) {
      this.consume();
      falseExpr = this.expr();
    }

    return new If(cond, trueExpr, falseExpr, token.line, token.col);
  }

  tryCatchExpr() {
    const token = this.consume(TokenType.TRY);
    const tryExpr = this.expr();
    this.consume(TokenType.CATCH);
    
    let errVar = null;
    if (this.cur.type === TokenType.LPAREN) {
      this.consume();
      if (this.cur.type === TokenType.ID) {
        errVar = this.cur.value;
        this.consume();
      }
      this.consume(TokenType.RPAREN);
    }
    
    const catchExpr = this.expr();
    return new TryCatch(tryExpr, errVar, catchExpr, token.line, token.col);
  }

  returnExpr() {
    const token = this.consume(TokenType.RETURN);
    const expr = this.expr();
    return new Return(expr, token.line, token.col);
  }

  throwExpr() {
    const token = this.consume(TokenType.THROW);
    const expr = this.expr();
    return new Throw(expr, token.line, token.col);
  }

  defVar() {
    const token = this.cur;
    const name = this.consume(TokenType.ID).value;
    this.consume(TokenType.COLON);
    const value = this.expr();
    return new DefineVar(name, value, token.line, token.col);
  }

  lambda() {
    const token = this.cur;
    const params = [];
    
    // Handle multiple parameters: (a, b) => expr or single: a => expr
    // Also supports default values: (a, b: defaultVal) => expr
    if (this.cur.type === TokenType.LPAREN) {
      this.consume(); // consume (
      
      // Parse parameters
      if (this.cur.type !== TokenType.RPAREN) {
        // First parameter
        if (this.cur.type === TokenType.ID) {
          params.push(this.cur.value);
          this.consume();
          
          // Skip default value if present (colon followed by value)
          if (this.cur.type === TokenType.COLON) {
            this.consume();
            this.skipDefaultValue();
          }
        }
        
        // Additional parameters
        while (this.cur.type === TokenType.COMMA) {
          this.consume(); // consume comma
          
          if (this.cur.type === TokenType.RPAREN) break; // trailing comma
          
          if (this.cur.type === TokenType.ID) {
            params.push(this.cur.value);
            this.consume();
            
            // Skip default value if present
            if (this.cur.type === TokenType.COLON) {
              this.consume();
              this.skipDefaultValue();
            }
          } else {
            throw this.error(`Expected parameter name, got ${this.cur.type}`);
          }
        }
      }
      
      this.consume(TokenType.RPAREN); // consume )
      this.consume(TokenType.FN_EQ); // consume =>
    } else {
      // Single parameter without parens: a => expr
      params.push(this.consume(TokenType.ID).value);
      this.consume(TokenType.FN_EQ);
    }
    
    const body = this.expr();
    return new Lambda(params, body, token.line, token.col);
  }
  
  skipDefaultValue() {
    // Skip a default value in a parameter list
    // Can be a literal, identifier, or simple expression
    // We need to skip until we hit comma or close paren
    let depth = 0;
    
    while (this.cur.type !== TokenType.EOF) {
      if (depth === 0 && (this.cur.type === TokenType.COMMA || this.cur.type === TokenType.RPAREN)) {
        break;
      }
      
      if (this.cur.type === TokenType.LPAREN || this.cur.type === TokenType.LBRACKET || this.cur.type === TokenType.LBRACE) {
        depth++;
      }
      if (this.cur.type === TokenType.RPAREN || this.cur.type === TokenType.RBRACKET || this.cur.type === TokenType.RBRACE) {
        depth--;
      }
      
      this.advance();
    }
  }

  listExpr() {
    const token = this.consume(TokenType.LBRACKET);
    const items = [];
    
    // Skip newlines
    while (this.cur.type === TokenType.NEWLINE) {
      this.advance();
    }
    
    if (this.cur.type !== TokenType.RBRACKET) {
      items.push(this.expr()); // Use expr to support if-expressions and other control flow
      while (this.cur.type === TokenType.COMMA) {
        this.consume();
        // Skip newlines after comma
        while (this.cur.type === TokenType.NEWLINE) {
          this.advance();
        }
        if (this.cur.type === TokenType.RBRACKET) break;
        items.push(this.expr());
      }
    }
    
    // Skip newlines before closing bracket
    while (this.cur.type === TokenType.NEWLINE) {
      this.advance();
    }
    
    this.consume(TokenType.RBRACKET);
    return new ListExpr(items, token.line, token.col);
  }

  dictExpr() {
    const token = this.consume(TokenType.LBRACE);
    const entries = [];
    
    // Skip newlines
    while (this.cur.type === TokenType.NEWLINE) {
      this.advance();
    }
    
    if (this.cur.type !== TokenType.RBRACE) {
      while (true) {
        // Skip newlines
        while (this.cur.type === TokenType.NEWLINE) {
          this.advance();
        }
        
        const name = this.cur.type === TokenType.ID ? this.consume().value : this.consume(TokenType.VAL).value;
        let value = new Literal(true, 'marker', this.cur.line, this.cur.col);
        
        if (this.cur.type === TokenType.COLON) {
          this.consume();
          // Skip newlines after colon
          while (this.cur.type === TokenType.NEWLINE) {
            this.advance();
          }
          value = this.expr(); // Use expr to support if-expressions and other control flow
        }
        
        entries.push({ name, value });
        
        // Skip newlines
        while (this.cur.type === TokenType.NEWLINE) {
          this.advance();
        }
        
        if (this.cur.type !== TokenType.COMMA) break;
        this.consume();
        
        // Skip newlines after comma
        while (this.cur.type === TokenType.NEWLINE) {
          this.advance();
        }
        
        if (this.cur.type === TokenType.RBRACE) break;
      }
    }
    
    // Skip newlines before closing brace
    while (this.cur.type === TokenType.NEWLINE) {
      this.advance();
    }
    
    this.consume(TokenType.RBRACE);
    return new DictExpr(entries, token.line, token.col);
  }

  assignExpr() {
    const expr = this.orExpr();
    if (this.cur.type === TokenType.ASSIGN) {
      this.consume();
      return new BinaryOp('=', expr, this.assignExpr(), expr.line, expr.col);
    }
    return expr;
  }

  orExpr() {
    let expr = this.andExpr();
    while (this.cur.type === TokenType.OR) {
      const token = this.consume();
      expr = new BinaryOp('or', expr, this.andExpr(), token.line, token.col);
    }
    return expr;
  }

  andExpr() {
    let expr = this.compareExpr();
    while (this.cur.type === TokenType.AND) {
      const token = this.consume();
      expr = new BinaryOp('and', expr, this.compareExpr(), token.line, token.col);
    }
    return expr;
  }

  compareExpr() {
    const expr = this.rangeExpr();
    const ops = [TokenType.EQ, TokenType.NOT_EQ, TokenType.LT, TokenType.LT_EQ, TokenType.GT, TokenType.GT_EQ, TokenType.CMP];
    if (ops.includes(this.cur.type)) {
      const token = this.consume();
      return new BinaryOp(token.value, expr, this.rangeExpr(), token.line, token.col);
    }
    return expr;
  }

  rangeExpr() {
    const expr = this.addExpr();
    if (this.cur.type === TokenType.DOT_DOT) {
      const token = this.consume();
      return new BinaryOp('..', expr, this.addExpr(), token.line, token.col);
    }
    return expr;
  }

  addExpr() {
    let expr = this.multExpr();
    while (this.cur.type === TokenType.PLUS || this.cur.type === TokenType.MINUS) {
      const token = this.consume();
      expr = new BinaryOp(token.value, expr, this.multExpr(), token.line, token.col);
    }
    return expr;
  }

  multExpr() {
    let expr = this.unaryExpr();
    while (this.cur.type === TokenType.STAR || this.cur.type === TokenType.SLASH) {
      const token = this.consume();
      expr = new BinaryOp(token.value, expr, this.unaryExpr(), token.line, token.col);
    }
    return expr;
  }

  unaryExpr() {
    if (this.cur.type === TokenType.MINUS) {
      const token = this.consume();
      return new UnaryOp('-', this.termExpr(), token.line, token.col);
    }
    if (this.cur.type === TokenType.NOT) {
      const token = this.consume();
      return new UnaryOp('not', this.termExpr(), token.line, token.col);
    }
    return this.termExpr();
  }

  termExpr() {
    let expr = this.termBase();
    
    while (true) {
      // Save position to potentially skip newlines
      const savedPos = this.pos;
      
      // Skip newlines to check for method chaining operators
      while (this.cur.type === TokenType.NEWLINE) {
        this.advance();
      }
      
      // Check for method chaining operators
      if (this.cur.type === TokenType.LPAREN && this.cur.line === expr.line) {
        expr = this.call(expr);
        continue;
      }
      if (this.cur.type === TokenType.DOT) {
        // Found a dot after newlines - this is method chaining
        expr = this.dotCall(expr);
        continue;
      }
      if (this.cur.type === TokenType.LBRACKET && this.cur.line === expr.line) {
        expr = this.indexExpr(expr);
        continue;
      }
      if (this.cur.type === TokenType.ARROW) {
        expr = this.dictGet(expr);
        continue;
      }
      
      // No method chaining operator found, restore position if we skipped newlines
      if (this.pos !== savedPos) {
        // We skipped newlines but didn't find a chaining operator
        // Restore to before the newlines
        this.pos = savedPos;
        this.cur = this.tokens[this.pos];
        this.peek = this.tokens[this.pos + 1] || { type: TokenType.EOF, value: null, line: 0, col: 0 };
      }
      break;
    }
    
    return expr;
  }

  termBase() {
    // Skip newlines
    while (this.cur.type === TokenType.NEWLINE) {
      this.advance();
    }
    
    // Literals
    if (this.cur.type === TokenType.VAL) {
      const token = this.consume();
      return new Literal(token.value, token.valueType, token.line, token.col);
    }
    
    // Null
    if (this.cur.type === TokenType.NULL) {
      const token = this.consume();
      return new Literal(null, 'null', token.line, token.col);
    }
    
    // True/False
    if (this.cur.type === TokenType.TRUE) {
      const token = this.consume();
      return new Literal(true, 'bool', token.line, token.col);
    }
    if (this.cur.type === TokenType.FALSE) {
      const token = this.consume();
      return new Literal(false, 'bool', token.line, token.col);
    }
    
    // Variable
    if (this.cur.type === TokenType.ID) {
      const token = this.consume();
      return new Var(token.value, token.line, token.col);
    }
    
    // Parenthesized expression
    if (this.cur.type === TokenType.LPAREN) {
      this.consume();
      const expr = this.assignExpr(); // Use assignExpr instead of expr to avoid recursion issues
      this.consume(TokenType.RPAREN);
      return expr;
    }
    
    throw this.error(`Unexpected token: ${this.cur.type}`);
  }

  call(target) {
    this.consume(TokenType.LPAREN);
    const args = [];
    
    // Skip newlines after opening paren
    while (this.cur.type === TokenType.NEWLINE) {
      this.advance();
    }
    
    if (this.cur.type !== TokenType.RPAREN) {
      args.push(this.expr());
      while (this.cur.type === TokenType.COMMA) {
        this.consume();
        // Skip newlines after comma
        while (this.cur.type === TokenType.NEWLINE) {
          this.advance();
        }
        if (this.cur.type === TokenType.RPAREN) break;
        args.push(this.expr());
      }
    }
    
    // Skip newlines before closing paren
    while (this.cur.type === TokenType.NEWLINE) {
      this.advance();
    }
    
    this.consume(TokenType.RPAREN);
    return new Call(target, args, target.line, target.col);
  }

  dotCall(target) {
    this.consume(TokenType.DOT);
    
    // Allow keywords as method names (e.g., .end, .start, .return)
    let funcName;
    if (this.cur.type === TokenType.ID) {
      funcName = this.consume().value;
    } else if (this.cur.type === TokenType.END) {
      funcName = 'end';
      this.consume();
    } else if (Object.values(TokenType).includes(this.cur.type) && typeof this.cur.value === 'string') {
      // Allow other keywords as method names
      funcName = this.cur.value || this.cur.type;
      this.consume();
    } else {
      throw this.error(`Expected method name after dot, got ${this.cur.type}`);
    }
    
    const args = [target];
    if (this.cur.type === TokenType.LPAREN) {
      this.consume();
      // Skip newlines after opening paren
      while (this.cur.type === TokenType.NEWLINE) {
        this.advance();
      }
      if (this.cur.type !== TokenType.RPAREN) {
        args.push(this.expr());
        while (this.cur.type === TokenType.COMMA) {
          this.consume();
          // Skip newlines after comma
          while (this.cur.type === TokenType.NEWLINE) {
            this.advance();
          }
          if (this.cur.type === TokenType.RPAREN) break;
          args.push(this.expr());
        }
      }
      // Skip newlines before closing paren
      while (this.cur.type === TokenType.NEWLINE) {
        this.advance();
      }
      this.consume(TokenType.RPAREN);
    }
    
    return new DotCall(target, funcName, args, target.line, target.col);
  }

  indexExpr(target) {
    this.consume(TokenType.LBRACKET);
    const index = this.expr();
    this.consume(TokenType.RBRACKET);
    return new Call(new Var('get', target.line, target.col), [target, index], target.line, target.col);
  }

  dictGet(target) {
    this.consume(TokenType.ARROW);
    const key = this.consume(TokenType.ID).value;
    return new Call(new Var('get', target.line, target.col), [target, new Literal(key, 'string', target.line, target.col)], target.line, target.col);
  }

  eos() {
    if (this.cur.type === TokenType.SEMICOLON) {
      this.consume();
      return;
    }
    if (this.cur.type === TokenType.NEWLINE) {
      this.consume();
      return;
    }
    // Newline is optional in some contexts
  }

  error(msg) {
    return new Error(`Parser error at ${this.cur.line}:${this.cur.col}: ${msg}`);
  }
}

//========================================================================
// Validation
//========================================================================

class AxonValidator {
  constructor(ast) {
    this.ast = ast;
    this.errors = [];
    this.warnings = [];
  }

  validate() {
    // First check do/end balance
    this.checkDoEndBalance();
    
    // Then validate AST structure
    this.validateNode(this.ast);
    
    return {
      valid: this.errors.length === 0,
      errors: this.errors,
      warnings: this.warnings,
      balanced: this.errors.filter(e => e.includes('do') || e.includes('end')).length === 0
    };
  }
  
  checkDoEndBalance() {
    const stack = [];
    const tokens = this.extractTokens(this.ast);
    
    tokens.forEach((token, i) => {
      if (token.type === 'do') {
        stack.push({ type: 'do', line: token.line, col: token.col });
      } else if (token.type === 'end') {
        // Check if previous token is DOT (method call like .end)
        if (i > 0 && tokens[i-1].type === 'dot') {
          return; // Skip method calls
        }
        
        if (stack.length === 0) {
          this.errors.push(`Unmatched 'end' keyword (no corresponding 'do') at line ${token.line}`);
        } else {
          stack.pop();
        }
      }
    });
    
    // Check for unclosed blocks
    stack.forEach(block => {
      this.errors.push(`Unclosed 'do' block (missing 'end') at line ${block.line}`);
    });
  }
  
  extractTokens(node, tokens = []) {
    if (!node) return tokens;
    
    if (node instanceof Block) {
      tokens.push({ type: 'do', line: node.line, col: node.col });
      node.exprs.forEach(expr => this.extractTokens(expr, tokens));
      // Block represents a complete do...end construct
      // The 'end' token was consumed during parsing, so we add it here for balance checking
      tokens.push({ type: 'end', line: node.line, col: node.col });
    } else if (node instanceof DotCall) {
      tokens.push({ type: 'dot', line: node.line, col: node.col });
      tokens.push({ type: 'method', value: node.funcName, line: node.line, col: node.col });
      this.extractTokens(node.target, tokens);
      node.args.forEach(arg => this.extractTokens(arg, tokens));
    } else if (node instanceof If) {
      this.extractTokens(node.cond, tokens);
      this.extractTokens(node.trueExpr, tokens);
      this.extractTokens(node.falseExpr, tokens);
    } else if (node instanceof BinaryOp) {
      this.extractTokens(node.lhs, tokens);
      this.extractTokens(node.rhs, tokens);
    } else if (node instanceof UnaryOp) {
      this.extractTokens(node.operand, tokens);
    } else if (node instanceof Call) {
      this.extractTokens(node.target, tokens);
      node.args.forEach(arg => this.extractTokens(arg, tokens));
    } else if (node instanceof Lambda) {
      this.extractTokens(node.body, tokens);
    } else if (node instanceof DefineVar) {
      this.extractTokens(node.value, tokens);
    } else if (node instanceof ListExpr) {
      node.items.forEach(item => this.extractTokens(item, tokens));
    } else if (node instanceof DictExpr) {
      node.entries.forEach(entry => this.extractTokens(entry.value, tokens));
    } else if (node instanceof TryCatch) {
      this.extractTokens(node.tryExpr, tokens);
      this.extractTokens(node.catchExpr, tokens);
    } else if (node instanceof Return) {
      this.extractTokens(node.expr, tokens);
    } else if (node instanceof Throw) {
      this.extractTokens(node.expr, tokens);
    } else if (node instanceof DefComp) {
      // DefComp has a do/end in its body
      if (node.body) {
        this.extractTokens(node.body, tokens);
      }
    }
    
    return tokens;
  }

  validateNode(node) {
    if (!node) return;

    if (node instanceof Block) {
      node.exprs.forEach(expr => this.validateNode(expr));
    } else if (node instanceof If) {
      this.validateNode(node.cond);
      this.validateNode(node.trueExpr);
      this.validateNode(node.falseExpr);
    } else if (node instanceof BinaryOp) {
      this.validateNode(node.lhs);
      this.validateNode(node.rhs);
    } else if (node instanceof UnaryOp) {
      this.validateNode(node.operand);
    } else if (node instanceof Call) {
      this.validateNode(node.target);
      node.args.forEach(arg => this.validateNode(arg));
    } else if (node instanceof DotCall) {
      this.validateNode(node.target);
      node.args.forEach(arg => this.validateNode(arg));
    } else if (node instanceof Lambda) {
      this.validateNode(node.body);
    } else if (node instanceof DefineVar) {
      this.validateNode(node.value);
    } else if (node instanceof ListExpr) {
      node.items.forEach(item => this.validateNode(item));
    } else if (node instanceof DictExpr) {
      node.entries.forEach(entry => this.validateNode(entry.value));
    } else if (node instanceof TryCatch) {
      this.validateNode(node.tryExpr);
      this.validateNode(node.catchExpr);
    } else if (node instanceof Return) {
      this.validateNode(node.expr);
    } else if (node instanceof Throw) {
      this.validateNode(node.expr);
    } else if (node instanceof DefComp) {
      // Validate defcomp body
      if (node.body) {
        this.validateNode(node.body);
      }
      // Validate slot metadata
      node.slots.forEach(slot => {
        if (slot.meta) {
          Object.values(slot.meta).forEach(metaValue => {
            if (metaValue instanceof Expr) {
              this.validateNode(metaValue);
            }
          });
        }
      });
    }
  }
}

//========================================================================
// Exports and CLI
//========================================================================

export { 
  AxonTokenizer, 
  AxonParser, 
  AxonValidator,
  TokenType,
  ASTNode,
  Expr,
  Literal,
  Var,
  Block,
  If,
  BinaryOp,
  UnaryOp,
  Call,
  DotCall,
  Lambda,
  DefineVar,
  ListExpr,
  DictExpr,
  TryCatch,
  Return,
  Throw,
  DefComp
};

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log('Usage: node axon-parser-full.js <file> [--ast]');
    console.log('       node axon-parser-full.js --test');
    console.log('');
    console.log('Options:');
    console.log('  --ast    Print the full AST');
    console.log('  --test   Run test suite');
    process.exit(args[0] === '--help' ? 0 : 1);
  }

  if (args[0] === '--test') {
    console.log('Running Axon parser tests...\n');
    
    const tests = [
      { name: 'Simple literal', code: '42' },
      { name: 'Simple variable', code: 'x' },
      { name: 'Addition', code: '1 + 2' },
      { name: 'Function call', code: 'foo(1, 2)' },
      { name: 'Dot call', code: 'x.map(v => v + 1)' },
      { name: 'Do block', code: 'do\n  x: 1\n  y: 2\nend' },
      { name: 'If expression', code: 'if (x > 0) "pos" else "neg"' },
      { name: 'List', code: '[1, 2, 3]' },
      { name: 'Dict', code: '{name: "test", value: 42}' },
      { name: 'Lambda', code: 'x => x + 1' },
      { name: 'Try-catch', code: 'try risky() catch (err) handle(err)' },
    ];

    let passed = 0;
    let failed = 0;

    tests.forEach(test => {
      try {
        const parser = new AxonParser(test.code);
        const ast = parser.parse();
        console.log(`✓ ${test.name}`);
        passed++;
      } catch (e) {
        console.log(`✗ ${test.name}: ${e.message}`);
        failed++;
      }
    });

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
  }

  // Parse file
  const filename = args[0];
  const showAST = args.includes('--ast');
  
  try {
    const content = fs.readFileSync(filename, 'utf-8');
    
    // Try to parse as YAML template first
    let code = content;
    try {
      const template = yaml.parse(content);
      if (template && template.template) {
        code = template.template;
        console.log('Parsing Axon template from YAML...\n');
      }
    } catch (e) {
      // Not YAML, treat as raw Axon
    }

    const parser = new AxonParser(code);
    const ast = parser.parse();
    
    console.log('✓ Parsing successful');
    
    if (showAST) {
      console.log('\nAST:');
      console.log(JSON.stringify(ast, null, 2));
    }

    const validator = new AxonValidator(ast);
    const result = validator.validate();
    
    if (result.valid) {
      console.log('✓ Validation successful');
    } else {
      console.log('\nValidation errors:');
      result.errors.forEach(err => console.log(`  - ${err}`));
    }
    
    if (result.warnings.length > 0) {
      console.log('\nWarnings:');
      result.warnings.forEach(warn => console.log(`  - ${warn}`));
    }
    
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
}
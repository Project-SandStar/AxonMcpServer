/**
 * Tree-sitter grammar for the Axon scripting language.
 *
 * Axon is the scripting language used by SkySpark / Haxall for building
 * automation, data queries, and rule processing. This grammar is derived
 * from the official Haxall Parser.fan / Tokenizer.fan sources (v4.0.4).
 *
 * Operator precedence (lowest → highest):
 *   1. assignment   =
 *   2. or           or
 *   3. and          and
 *   4. compare      == != < <= >= > <=>
 *   5. range        ..
 *   6. add          + -
 *   7. mult         * /
 *   8. unary        - not
 *   9. term         call index dotCall trapCall
 *
 * Key design decisions (matching Haxall Parser.fan):
 *   - Trailing lambdas: func(args) (params) => body  or  func(args) x => body
 *     Modeled as trailing_lambda_call with prec.dynamic(-1) so the regular
 *     call parse is preferred; trailing lambda only wins when it's the only
 *     valid parse (GLR fork + error pruning).
 *   - do blocks can omit "end" before "else" / "catch" keywords.
 *   - Keywords can appear as method names after "." (dot call).
 *   - Dict keys can be identifiers, keywords, strings, or raw strings.
 */
module.exports = grammar({
  name: "axon",

  externals: ($) => [
    // Zero-width lookahead token emitted by external scanner (src/scanner.c)
    // when a trailing lambda follows a call's closing paren on the same line.
    // Matches Haxall Parser.fan's: if (!isEos && (cur === id || cur === lparen))
    $._trailing_lambda_ahead,
    // Zero-width token emitted when [ appears on the same line.
    // Prevents newline-separated [list] from being misinterpreted as
    // index access on the preceding expression (matches Haxall isEos).
    $._index_ahead,
  ],

  extras: ($) => [/\s/, $.line_comment, $.block_comment],

  word: ($) => $.identifier,

  conflicts: ($) => [
    // "id." could be start of qname_lib or var followed by dot_call
    [$.qname_lib, $.var],
    // lambda can appear as both _expr and _paren_or_lambda
    [$._paren_or_lambda, $._expr],
    // "(id)" could be param in lambda, var in paren_expr, or try-catch error var
    [$.param, $.var],
    [$.param, $.var, $.try_catch_expr],
    // "(id: expr)" could be param with default or paren_expr containing define_var
    [$.param, $.define_var],
  ],

  rules: {
    // ── Top Level ──────────────────────────────────────────────────────
    source_file: ($) =>
      optional(seq($._expr, repeat(seq(optional(";"), $._expr)))),

    // ── Expressions ────────────────────────────────────────────────────
    // Matches Haxall Parser.fan expr() dispatch order
    _expr: ($) =>
      choice(
        $.define_var,
        $.lambda,
        $.do_block,
        $.if_expr,
        $.return_expr,
        $.throw_expr,
        $.try_catch_expr,
        $.defcomp,
        $._assign_expr
      ),

    // ── Variable definition:  name : expr ─────────────────────────────
    // Parser.fan: if (cur === Token.id && peek === Token.colon) return def
    define_var: ($) =>
      prec(
        15,
        seq(field("name", $.identifier), ":", field("value", $._expr))
      ),

    // ── Lambdas ────────────────────────────────────────────────────────
    // Parser.fan: lambda1() for "id =>" and parenExpr() for "(params) =>"
    lambda: ($) => choice($._lambda_single, $._lambda_multi),

    _lambda_single: ($) =>
      prec(
        14,
        seq(
          field("params", $.param_single),
          "=>",
          field("body", $._expr)
        )
      ),

    _lambda_multi: ($) =>
      seq(
        "(",
        field("params", optional($.param_list)),
        ")",
        "=>",
        field("body", $._expr)
      ),

    param_single: ($) => $.identifier,

    param_list: ($) => seq($.param, repeat(seq(",", $.param))),

    param: ($) =>
      choice(
        prec(
          15,
          seq(field("name", $.identifier), ":", field("default", $._expr))
        ),
        field("name", $.identifier)
      ),

    // ── Do / End block ────────────────────────────────────────────────
    // Parser.fan: doBlock() breaks on "end", "else", "catch" keywords
    do_block: ($) =>
      seq("do", repeat(seq($._expr, optional(";"))), "end"),

    // ── If / Else ─────────────────────────────────────────────────────
    // Parser.fan: if (cond) expr [else expr]
    // do blocks can omit "end" before "else":
    //   if (cond) do ... else do ... end
    if_expr: ($) =>
      prec.right(
        0,
        choice(
          seq(
            "if", "(", field("condition", $._expr), ")",
            "do", repeat(seq($._expr, optional(";"))),
            "else", field("else", $._expr)
          ),
          seq(
            "if", "(", field("condition", $._expr), ")",
            field("then", $._expr),
            optional(seq("else", field("else", $._expr)))
          )
        )
      ),

    // ── Return / Throw ────────────────────────────────────────────────
    // return with optional expression — bare "return" is valid (returns null)
    return_expr: ($) => prec.right(1, seq("return", optional($._expr))),

    throw_expr: ($) => prec.right(1, seq("throw", $._expr)),

    // ── Try / Catch ───────────────────────────────────────────────────
    // Parser.fan: try expr catch [(id)] expr
    // do blocks can omit "end" before "catch":
    //   try do ... catch (e) handler
    try_catch_expr: ($) =>
      prec.right(
        0,
        choice(
          seq(
            "try", "do", repeat(seq($._expr, optional(";"))),
            "catch",
            optional(seq("(", field("error_var", $.identifier), ")")),
            field("handler", $._expr)
          ),
          seq(
            "try", field("body", $._expr),
            "catch",
            optional(seq("(", field("error_var", $.identifier), ")")),
            field("handler", $._expr)
          )
        )
      ),

    // ── Defcomp ───────────────────────────────────────────────────────
    // Parser.fan: defcomp keyword, cells, optional do/end body, end keyword
    defcomp: ($) =>
      seq("defcomp", repeat($.cell_def), optional($.do_block), "end"),

    cell_def: ($) =>
      seq(field("name", $.identifier), ":", field("meta", $.dict)),

    // ── Assignment:  expr = expr  ─────────────────────────────────────
    // Parser.fan: right-associative
    _assign_expr: ($) => choice($.assignment, $._or_expr),

    assignment: ($) =>
      prec.right(
        1,
        seq(field("target", $._or_expr), "=", field("value", $._expr))
      ),

    // ── Logical or ────────────────────────────────────────────────────
    _or_expr: ($) => choice($.or_expr, $._and_expr),

    or_expr: ($) =>
      prec.left(
        2,
        seq(field("left", $._or_expr), "or", field("right", $._and_expr))
      ),

    // ── Logical and ───────────────────────────────────────────────────
    _and_expr: ($) => choice($.and_expr, $._compare_expr),

    and_expr: ($) =>
      prec.left(
        3,
        seq(
          field("left", $._and_expr),
          "and",
          field("right", $._compare_expr)
        )
      ),

    // ── Comparison ────────────────────────────────────────────────────
    _compare_expr: ($) => choice($.compare_expr, $._range_expr),

    compare_expr: ($) =>
      prec.left(
        4,
        seq(
          field("left", $._compare_expr),
          field("op", choice("==", "!=", "<", "<=", ">=", ">", "<=>")),
          field("right", $._range_expr)
        )
      ),

    // ── Range ─────────────────────────────────────────────────────────
    _range_expr: ($) => choice($.range_expr, $._add_expr),

    range_expr: ($) =>
      prec(
        5,
        seq(field("start", $._add_expr), "..", field("end", $._add_expr))
      ),

    // ── Addition / Subtraction ────────────────────────────────────────
    _add_expr: ($) => choice($.add_expr, $._mult_expr),

    add_expr: ($) =>
      prec.left(
        6,
        seq(
          field("left", $._add_expr),
          field("op", choice("+", "-")),
          field("right", $._mult_expr)
        )
      ),

    // ── Multiplication / Division ─────────────────────────────────────
    _mult_expr: ($) => choice($.mult_expr, $._unary_expr),

    mult_expr: ($) =>
      prec.left(
        7,
        seq(
          field("left", $._mult_expr),
          field("op", choice("*", "/")),
          field("right", $._unary_expr)
        )
      ),

    // ── Unary ─────────────────────────────────────────────────────────
    _unary_expr: ($) => choice($.neg_expr, $.not_expr, $._term_expr),

    neg_expr: ($) => prec(8, seq("-", field("operand", $._term_expr))),

    not_expr: ($) => prec(8, seq("not", field("operand", $._term_expr))),

    // ── Term chains (left-recursive) ──────────────────────────────────
    // Parser.fan: termExpr() loops on (, [, ., -> chains
    _term_expr: ($) =>
      choice(
        $.call_expr,
        $.trailing_lambda_call,
        $.dot_call,
        $.index_expr,
        $.trap_call,
        $._term_base
      ),

    // func(args) — standard call without trailing lambda
    call_expr: ($) =>
      prec.left(
        10,
        seq(
          field("function", $._term_expr),
          "(",
          field("args", optional($.arg_list)),
          ")"
        )
      ),

    // func(args) lambda — call with trailing lambda argument
    // Parser.fan line 647: if (!isEos && (cur === Token.id || cur === Token.lparen))
    //   args.add(lamdba)
    // The _trailing_lambda_ahead external token (zero-width) is emitted by
    // src/scanner.c when lookahead confirms a lambda follows on the same line.
    // This disambiguates func(a)(b) (chained call) from func(a) (x) => e (trailing lambda).
    trailing_lambda_call: ($) =>
      prec.left(
        10,
        seq(
          field("function", $._term_expr),
          "(",
          field("args", optional($.arg_list)),
          ")",
          $._trailing_lambda_ahead,
          field("trailing_lambda", $.lambda)
        )
      ),

    // obj.method  or  obj.method(args)  or  obj.method lambda
    // Parser.fan: call() with isMethod=true
    // Bare trailing lambda: .map row => expr  or  .map (a, b) => expr
    dot_call: ($) =>
      prec.left(
        10,
        seq(
          field("target", $._term_expr),
          ".",
          field("method", $._dot_name),
          optional(
            choice(
              seq("(", field("args", optional($.arg_list)), ")"),
              field("trailing_lambda", $.lambda)
            )
          )
        )
      ),

    // Parser.fan: consumeIdOrKeyword — keywords are valid method names after "."
    _dot_name: ($) => choice($.identifier, $._keyword_as_id),

    _keyword_as_id: (_$) =>
      choice(
        "and",
        "or",
        "not",
        "if",
        "else",
        "do",
        "end",
        "return",
        "throw",
        "try",
        "catch",
        "true",
        "false",
        "null",
        "defcomp"
      ),

    // obj[expr] — index access (sugar for "get")
    // Requires _index_ahead (external scanner) to ensure [ is on the same line.
    // This prevents newline-separated [list] from being misinterpreted as
    // index access, matching Haxall's isEos behavior.
    index_expr: ($) =>
      prec.left(
        10,
        seq(
          field("target", $._term_expr),
          $._index_ahead,
          "[",
          field("index", $._expr),
          "]"
        )
      ),

    // obj->tag — trap/dict access (sugar for "trap")
    trap_call: ($) =>
      prec.left(
        10,
        seq(
          field("target", $._term_expr),
          "->",
          field("tag", $.identifier)
        )
      ),

    arg_list: ($) => seq($._arg, repeat(seq(",", $._arg))),

    _arg: ($) => choice($._expr, $.partial_arg),

    // "_" partial application placeholder
    partial_arg: (_$) => "_",

    // ── Term base ─────────────────────────────────────────────────────
    // Parser.fan: termBase() dispatches on token type
    _term_base: ($) =>
      choice(
        $._paren_or_lambda,
        $.qname,
        $.var,
        $.typename,
        $.list,
        $.dict,
        $._literal
      ),

    _paren_or_lambda: ($) => choice($.lambda, $.paren_expr),

    paren_expr: ($) => seq("(", $._expr, ")"),

    // ── Qualified names:  lib::name ───────────────────────────────────
    // Parser.fan: qname() — unrolls dotted calls into lib path
    qname: ($) =>
      seq(
        field("lib", $.qname_lib),
        "::",
        field("name", choice($.identifier, $.typename))
      ),

    qname_lib: ($) => seq($.identifier, repeat(seq(".", $.identifier))),

    // ── Variables and types ───────────────────────────────────────────
    var: ($) => $.identifier,

    typename: (_$) => /[A-Z][a-zA-Z0-9_]*/,

    // ── Collections ───────────────────────────────────────────────────
    // Parser.fan: list() and dict() with trailing comma support
    list: ($) =>
      seq(
        "[",
        optional(seq($._expr, repeat(seq(",", $._expr)), optional(","))),
        "]"
      ),

    dict: ($) =>
      seq(
        "{",
        optional(
          seq($.dict_item, repeat(seq(",", $.dict_item)), optional(","))
        ),
        "}"
      ),

    dict_item: ($) => choice($.dict_pair, $.dict_marker, $.dict_remove),

    // tag: value
    dict_pair: ($) =>
      seq(field("key", $._dict_key), ":", field("value", $._expr)),

    // tag (marker — boolean true)
    dict_marker: ($) => field("key", $._dict_key),

    // -tag (remove marker)
    dict_remove: ($) => seq("-", field("key", $._dict_key)),

    // Parser.fan: dict keys can be id, keyword, or string literal
    _dict_key: ($) =>
      choice($.identifier, $._keyword_as_id, $.string, $.raw_string),

    // ── Literals ──────────────────────────────────────────────────────
    // Tokenizer.fan: all literal types
    _literal: ($) =>
      choice(
        $.number,
        $.string,
        $.raw_string,
        $.triple_string,
        $.uri,
        $.ref,
        $.symbol,
        $.date,
        $.time,
        $.date_time,
        $.true,
        $.false,
        $.null
      ),

    true: (_$) => "true",
    false: (_$) => "false",
    null: (_$) => "null",

    // Tokenizer.fan: num() — decimal with optional unit, or hex
    // Unit chars: letters, %, $, Unicode > 128, / (not //)
    number: (_$) =>
      token(
        choice(
          seq("0x", /[0-9a-fA-F][0-9a-fA-F_]*/),
          seq(
            /[0-9][0-9_]*/,
            optional(seq(".", /[0-9][0-9_]*/)),
            optional(seq(/[eE]/, optional(/[+-]/), /[0-9]+/)),
            optional(
              /[a-zA-Z_%$\u00B0\u0394\u00B2\u00B3\u2080-\u2089][a-zA-Z0-9_%$\/\u00B0\u0394\u00B2\u00B3\u2080-\u2089]*/
            )
          )
        )
      ),

    // Tokenizer.fan: str() — regular string with escape sequences
    // $ is allowed as literal (interpolation not supported in Axon)
    string: (_$) =>
      token(seq('"', repeat(choice(/[^"\\$]/, seq("\\", /./), "$")), '"')),

    // Tokenizer.fan: rawStr() — r"..." no escapes
    raw_string: (_$) => token(seq("r", '"', repeat(/[^"\n]/), '"')),

    // Tokenizer.fan: str() triple-quote variant — """...""" multiline
    triple_string: (_$) =>
      token(
        seq(
          '"""',
          repeat(
            choice(
              /[^"\\$]/,
              seq("\\", /./),
              "$",
              seq('"', /[^"]/),
              seq('""', /[^"]/)
            )
          ),
          '"""'
        )
      ),

    // Tokenizer.fan: num() with dashes==2, colons==0
    date: (_$) => token(/[0-9]{4}-[0-9]{2}-[0-9]{2}/),

    // Tokenizer.fan: num() with dashes==0, colons>=1
    time: (_$) => token(/[0-9]{1,2}:[0-9]{2}(:[0-9]{2})?/),

    // Combined date + time with T separator
    date_time: (_$) =>
      token(
        seq(
          /[0-9]{4}-[0-9]{2}-[0-9]{2}/,
          "T",
          /[0-9]{2}:[0-9]{2}:[0-9]{2}/,
          optional(/[+-][0-9]{2}:[0-9]{2}|Z/)
        )
      ),

    // Tokenizer.fan: ref() — @identifier
    ref: (_$) => token(seq("@", /[a-zA-Z0-9_:.~-]+/)),

    // Tokenizer.fan: symbol() — ^identifier
    symbol: (_$) => token(seq("^", /[a-zA-Z0-9_:.~-]+/)),

    // Tokenizer.fan: uri() — `uri` with special URI escapes
    uri: (_$) =>
      token(seq("`", repeat(choice(/[^`\\\n$]/, seq("\\", /[^\n]/))), "`")),

    // Tokenizer.fan: word() — lowercase or underscore start
    identifier: (_$) => /[a-z_][a-zA-Z0-9_]*/,

    // Tokenizer.fan: skipCommentSL() — // to end of line
    line_comment: (_$) => token(seq("//", /[^\n]*/)),

    // Tokenizer.fan: skipCommentML() — /* ... */ (nested in Axon, but
    // tree-sitter token rules can't recurse; this handles non-nested cases)
    // Also handles unterminated /* at EOF (SkySpark tolerates these)
    block_comment: (_$) =>
      token(seq("/*", /[^*]*(\*+([^/*][^*]*\*+)*\/|\*+)?/)),
  },
});

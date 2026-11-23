/**
 * Tree-sitter grammar for Abla (https://github.com/AndreBaltazar8/ablac).
 *
 * Statements end at a newline or `;`. The external scanner (src/scanner.c) emits
 * `_newline` only where the grammar can end a statement and the next line does not
 * continue the expression (a line starting with `.`, or a binary `+` or `-`
 * followed by a space), and it scans nested block comments and the raw body of a
 * `$name(...) { ... }` compile-time subparser block.
 */

const PREC = {
  assign: 1,
  or: 2,
  and: 3,
  bit_or: 4,
  bit_xor: 5,
  bit_and: 6,
  equality: 7,
  comparison: 8,
  default: 9,
  range: 10,
  shift: 11,
  additive: 12,
  multiplicative: 13,
  cast: 14,
  unary: 15,
  postfix: 16,
  call: 17,
};

module.exports = grammar({
  name: "abla",

  word: ($) => $._word,

  inline: ($) => [$._arguments],

  externals: ($) => [
    $._newline,
    $.block_comment,
    $.subparser_brace,
    $.subparser_raw,
    $.string_content,
    $._error_sentinel,
  ],

  extras: ($) => [/\s/, $.line_comment, $.block_comment],

  conflicts: ($) => [
    [$._statements],
    [$._statements, $.lambda],
    [$.atomic_expression],
    [$.generic_call],
    [$.parenthesized_type, $._function_type_parameter],
    [$._postfix_or_primary, $.generic_call],
    [$.parameter, $.identifier],
    [$.subparser_expression],
    [$.borrow_type, $.identifier],
    [$.import_declaration, $._primary],
    [$.import_declaration, $.identifier],
    [$.atomic_expression, $.identifier],
    [$.region_expression, $.identifier],
    [$.extend_declaration, $.identifier],
    [$.type_alias, $.identifier],
    [$._primary, $.generic_call],
    [$.parenthesized_type, $.function_type],
    [$.type_parameter, $.type_name],
    [$._type_atom, $._expression],
    [$.generic_call, $._expression],
    [$.lambda, $.block],
    [$.lambda_parameters, $._expression],
    [$.function_declaration, $._type_atom],
    [$.receiver_type, $._type_atom],
    [$.receiver_type, $.type_name],
    [$.property_declaration, $._type_atom],
    [$.type_name],
    [$.qualified_type, $.type_name],
    [$._statement, $.lambda],
    [$.when_subject, $._expression],
    [$.postfix_lambda_call, $.call_expression],
    [$.parameter, $._type_atom],
  ],

  rules: {
    source_file: ($) => optional($._statements),

    _statements: ($) =>
      choice(
        repeat1($._terminator),
        seq(
          repeat($._terminator),
          $._statement,
          repeat(seq(repeat1($._terminator), $._statement)),
          repeat($._terminator),
        ),
      ),

    _members: ($) =>
      choice(
        repeat1($._terminator),
        seq(
          repeat($._terminator),
          $._member,
          repeat(seq(repeat1($._terminator), $._member)),
          repeat($._terminator),
        ),
      ),

    _terminator: ($) => choice(";", $._newline),

    // ---- statements and declarations -----------------------------------

    _statement: ($) =>
      choice(
        $.import_declaration,
        $._declaration,
        $._expression_statement,
      ),

    _expression_statement: ($) => $._expression,

    _declaration: ($) =>
      choice(
        $.function_declaration,
        $.operator_declaration,
        $.class_declaration,
        $.interface_declaration,
        $.type_alias,
        $.property_declaration,
        $.extend_declaration,
      ),

    annotation: ($) =>
      seq("@", $.identifier, optional(seq(token.immediate("("), optional($._arguments), ")"))),

    modifier: ($) =>
      choice(
        "private",
        "export",
        "abstract",
        "sealed",
        "resource",
        "trusted",
        "noescape",
        "compile",
        "override",
        "open",
        $.extern_modifier,
        $.annotation,
      ),

    extern_modifier: ($) => seq("extern", optional(seq(":", choice($.string_literal, $.raw_string_literal)))),

    import_declaration: ($) =>
      seq(
        repeat($.modifier),
        "import",
        optional("contract"),
        choice($.string_literal, $._expression),
        optional(seq("as", $.identifier)),
      ),

    function_declaration: ($) =>
      seq(
        repeat($.modifier),
        "fun",
        optional($.type_parameters),
        optional(seq(field("receiver", $.receiver_type), ".")),
        field("name", $.identifier),
        optional($.type_parameters),
        optional($.parameters),
        optional(seq(":", field("result", $._type))),
        optional($.where_clause),
        optional(choice(seq("=", $._expression), $.block)),
      ),

    operator_declaration: ($) =>
      seq(
        repeat($.modifier),
        "operator",
        repeat($.annotation),
        "fun",
        optional($.type_parameters),
        optional(seq(field("receiver", $.receiver_type), ".")),
        field("name", choice($.identifier, $.operator_name)),
        optional($.parameters),
        optional(seq(":", field("result", $._type))),
        optional(choice(seq("=", $._expression), $.block)),
      ),

    operator_name: () =>
      token(choice("+", "-", "*", "/", "%", "==", "!=", "<", "<=", ">", ">=", "[]", "[]=", "()", "!", "~")),

    where_clause: ($) => seq("where", $.identifier, ":", $._type, repeat(seq(",", $.identifier, ":", $._type))),

    type_parameters: ($) =>
      seq("<", commaSep1($.type_parameter), ">"),

    type_parameter: ($) =>
      seq(
        optional(choice("val", "var", "const")),
        $.identifier,
        optional(seq(":", $._type, repeat(seq(choice("+", "&"), $._type)))),
      ),

    parameters: ($) => seq("(", optional(seq(commaSep1($.parameter), optional(","))), ")"),

    parameter: ($) =>
      seq(
        repeat(choice("val", "var", "own", "noescape", "vararg", $.annotation)),
        field("name", $.identifier),
        optional(seq(":", field("type", $._type))),
        optional(choice(seq("=", $._expression), seq("by", $._expression))),
      ),

    class_declaration: ($) =>
      seq(
        repeat($.modifier),
        "class",
        field("name", $.identifier),
        optional($.type_parameters),
        optional($.parameters),
        optional(seq(":", commaSep1($._type))),
        optional($.class_body),
      ),

    interface_declaration: ($) =>
      seq(
        repeat($.modifier),
        "interface",
        field("name", $.identifier),
        optional($.type_parameters),
        optional(seq(":", commaSep1($._type))),
        optional($.class_body),
      ),

    class_body: ($) => seq("{", optional($._members), "}"),

    _member: ($) =>
      choice(
        $.function_declaration,
        $.operator_declaration,
        $.property_declaration,
        $.class_declaration,
        $.type_alias,
        $.block,
      ),

    type_alias: ($) => seq(repeat($.modifier), "type", $.identifier, optional($.type_parameters), optional(seq("=", $._type))),

    extend_declaration: ($) =>
      seq("extend", $._type, optional(seq(":", commaSep1($._type))), optional($.class_body)),

    property_declaration: ($) =>
      seq(
        repeat($.modifier),
        choice("val", "var"),
        optional(seq(field("receiver", $.receiver_type), ".")),
        field("name", $.identifier),
        optional(seq(":", field("type", $._type))),
        optional(choice(seq("=", $._expression), seq("by", $._expression))),
      ),

    // ---- types ----------------------------------------------------------

    _type: ($) => choice($._type_atom, $.nullable_type, $.function_type, $.borrow_type),

    borrow_type: ($) => seq("borrow", "(", $._expression, ")", $._type),

    receiver_type: ($) =>
      seq(
        $.identifier,
        optional($.type_arguments),
        optional("?"),
      ),

    nullable_type: ($) => seq($._type_atom, "?"),

    pointer_type: ($) => prec(1, seq($._type_atom, "*")),

    _type_atom: ($) =>
      choice($.type_name, $.qualified_type, $.pointer_type, $.parenthesized_type),

    type_name: ($) => seq($.identifier, optional($.type_arguments)),

    qualified_type: ($) => seq($.identifier, ".", $.type_name),

    parenthesized_type: ($) => seq("(", $._type, ")"),

    type_arguments: ($) => seq("<", commaSep1(choice($._type, $.integer_literal)), ">"),

    function_type: ($) =>
      prec.right(seq(optional($.identifier), "(", optional(commaSep1($._function_type_parameter)), ")", "->", $._type)),

    _function_type_parameter: ($) => choice($._type, seq(choice("var", $.identifier), ":", $._type)),

    // ---- expressions ----------------------------------------------------

    block: ($) => seq("{", optional($._statements), "}"),

    _expression: ($) =>
      choice(
        $.binary_expression,
        $.assignment_expression,
        $.unary_expression,
        $.cast_expression,
        $.range_expression,
        $.null_default_expression,
        $._postfix_or_primary,
      ),

    _postfix_or_primary: ($) =>
      choice(
        $.call_expression,
        $.generic_call,
        $.postfix_lambda_call,
        $.member_expression,
        $.safe_member_expression,
        $.index_expression,
        $._primary,
      ),

    _primary: ($) =>
      choice(
        $.identifier,
        $.integer_literal,
        $.float_literal,
        $.string_literal,
        $.raw_string_literal,
        $.boolean_literal,
        $.null_literal,
        $.parenthesized_expression,
        $.array_literal,
        $.lambda,
        $.if_expression,
        $.when_expression,
        $.while_statement,
        $.do_while_statement,
        $.for_statement,
        $.labeled_loop,
        $.return_expression,
        $.break_expression,
        $.continue_expression,
        $.defer_statement,
        $.yield_expression,
        $.region_expression,
        $.atomic_expression,
        $.suspending_expression,
        $.subparser_expression,
        $.this_expression,
      ),

    this_expression: () => "this",

    parenthesized_expression: ($) => seq("(", $._expression, ")"),

    array_literal: ($) => seq("[", optional(seq(commaSep1($._expression), optional(","))), "]"),

    binary_expression: ($) => {
      const table = [
        [PREC.or, "||"],
        [PREC.and, "&&"],
        [PREC.bit_or, "|"],
        [PREC.bit_xor, "^"],
        [PREC.bit_and, "&"],
        [PREC.equality, choice("==", "!=")],
        [PREC.comparison, choice("<", "<=", ">", ">=")],
        [PREC.shift, choice("<<", ">>", ">>>")],
        [PREC.additive, choice("+", "-")],
        [PREC.multiplicative, choice("*", "/", "%")],
      ];
      return choice(
        ...table.map(([precedence, operator]) =>
          prec.left(precedence, seq($._expression, field("operator", operator), $._expression)),
        ),
      );
    },

    range_expression: ($) =>
      prec.left(PREC.range, seq($._expression, choice("..", "until"), $._expression)),

    null_default_expression: ($) =>
      prec.right(PREC.default, seq($._expression, "??", $._expression)),

    assignment_expression: ($) =>
      prec.right(
        PREC.assign,
        seq($._expression, choice("=", "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>="), $._expression),
      ),

    unary_expression: ($) =>
      prec(PREC.unary, seq(choice("-", "+", "!", "~", "#", "^", "await"), $._expression)),

    cast_expression: ($) =>
      prec.left(PREC.cast, seq($._expression, "as", "?", $._type_atom)),

    call_expression: ($) =>
      prec(PREC.call, seq($._expression, $.arguments)),

    generic_call: ($) =>
      seq(
        choice($.identifier, $.member_expression),
        $.type_arguments,
        choice(seq($.arguments, optional($.lambda)), $.lambda),
      ),

    postfix_lambda_call: ($) =>
      prec.dynamic(1, prec(PREC.call, seq($._expression, optional($.arguments), $.lambda))),

    arguments: ($) => seq("(", optional(seq($._arguments, optional(","))), ")"),

    _arguments: ($) => commaSep1($._expression),

    member_expression: ($) =>
      prec(PREC.postfix, seq($._expression, ".", optional("^"), field("name", $.identifier))),

    safe_member_expression: ($) =>
      prec(PREC.postfix, seq($._expression, "?.", field("name", $.identifier))),

    index_expression: ($) =>
      prec(PREC.postfix, seq($._expression, "[", $._expression, "]")),

    lambda: ($) =>
      seq(
        "{",
        repeat($._terminator),
        optional($.lambda_parameters),
        optional($._statements),
        "}",
      ),

    lambda_parameters: ($) =>
      seq(
        choice(
          "->",
          seq(commaSep1(seq($.identifier, optional(seq(":", $._type)))), "->"),
        ),
      ),

    if_expression: ($) =>
      prec.right(
        seq(
          "if",
          "(",
          $._expression,
          ")",
          $._control_body,
          optional(seq("else", $._control_body)),
        ),
      ),

    when_expression: ($) =>
      seq("when", optional($.when_subject), "{", optional($._arms), "}"),

    _arms: ($) => repeat1(choice($.when_arm, $._terminator)),

    when_subject: ($) => seq("(", $._expression, ")"),

    when_arm: ($) =>
      seq(
        choice($.else_pattern, commaSep1($._when_pattern)),
        "->",
        $._control_body,
      ),

    else_pattern: () => "else",

    _when_pattern: ($) => choice($.is_pattern, $._expression),

    is_pattern: ($) => seq("is", $._type_atom),

    _control_body: ($) => choice(prec.dynamic(3, $.block), $._expression),

    while_statement: ($) => seq("while", "(", $._expression, ")", $._control_body),

    do_while_statement: ($) =>
      seq("do", $.block, "while", "(", $._expression, ")"),

    for_statement: ($) =>
      seq("for", "(", $.identifier, "in", $._expression, ")", $._control_body),

    labeled_loop: ($) =>
      seq($.identifier, token.immediate("@"), choice($.while_statement, $.do_while_statement, $.for_statement)),

    return_expression: ($) => prec.right(seq("return", optional($._expression))),

    break_expression: ($) => seq("break", optional(seq(token.immediate("@"), $.identifier))),

    continue_expression: ($) => seq("continue", optional(seq(token.immediate("@"), $.identifier))),

    defer_statement: ($) => seq("defer", $._control_body),

    yield_expression: ($) => prec.right(seq("yield", optional($._expression))),

    region_expression: ($) => seq("region", $.block),

    atomic_expression: ($) => seq("atomic", $.block, repeat(seq("orElse", $.block))),

    suspending_expression: ($) => seq(choice("generator", "task", "thread"), optional("move"), $.block),

    subparser_expression: ($) =>
      seq(
        "$",
        $.identifier,
        choice(seq($.arguments, optional($.subparser_brace)), optional($.subparser_raw)),
      ),

    // ---- literals -------------------------------------------------------

    _word: () => /[A-Za-z_][A-Za-z0-9_]*/,

    // The words that are keywords in one position only are ordinary identifiers elsewhere.
    identifier: ($) =>
      choice(
        $._word,
        "type", "by", "own", "region", "atomic", "operator", "move", "where", "as", "contract",
        "private", "export", "abstract", "sealed", "override", "open", "vararg", "extend", "borrow", "orElse",
      ),

    integer_literal: () =>
      token(
        choice(
          /0[xX][0-9A-Fa-f](_?[0-9A-Fa-f])*/,
          /0[oO][0-7](_?[0-7])*/,
          /0[bB][01](_?[01])*/,
          /[0-9](_?[0-9])*/,
        ),
      ),

    float_literal: () =>
      token(
        choice(
          /[0-9](_?[0-9])*\.[0-9](_?[0-9])*([eE][+-]?[0-9](_?[0-9])*)?/,
          /[0-9](_?[0-9])*[eE][+-]?[0-9](_?[0-9])*/,
        ),
      ),

    boolean_literal: () => choice("true", "false"),

    null_literal: () => "null",

    raw_string_literal: () => token(seq('"""', repeat(choice(/[^"]/, seq('"', /[^"]/), seq('""', /[^"]/))), '"""')),

    string_literal: ($) =>
      seq(
        '"',
        repeat(choice($.string_content, $.escape_sequence, $.interpolation)),
        token.immediate('"'),
      ),


    escape_sequence: () =>
      token.immediate(
        seq("\\", choice(/[nrtb0"'\\$]/, /x[0-9A-Fa-f]{2}/, /u[0-9A-Fa-f]{4}/, /u\{[0-9A-Fa-f]{1,6}\}/)),
      ),

    interpolation: ($) =>
      choice(
        $.interpolated_identifier,
        seq(token.immediate(prec(2, "${")), $._expression, "}"),
      ),

    interpolated_identifier: () => token.immediate(prec(2, /\$[A-Za-z_][A-Za-z0-9_]*/)),

    line_comment: () => token(seq("//", /[^\n]*/)),
  },
});

function commaSep1(rule) {
  return seq(rule, repeat(seq(",", rule)));
}

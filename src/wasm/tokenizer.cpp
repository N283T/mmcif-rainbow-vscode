
#include <emscripten/bind.h>
#include <gemmi/cif.hpp>
#include <vector>

using namespace emscripten;

// Simple struct to hold token data
struct TokenInfo {
  int start;
  int length;
  int type; // 0: unknown, 1: keyword, 2: tag, 3: value, 4: comment
};

// We will use a custom Action to just record locations
// This avoids building the full DOM
struct TokenizerState {
  std::vector<int>
      tokens; // flattened [start, length, type, start, length, type...]
};

namespace rules = gemmi::cif::rules;

template <typename Rule> struct TokenAction : tao::pegtl::nothing<Rule> {};

// Map specific rules to token types
// 1: Keyword, 2: Tag, 3: Value, 4: Comment

template <int TokenType> struct GenericAction {
  template <typename Input>
  static void apply(const Input &in, TokenizerState &state) {
    state.tokens.push_back(in.iterator().byte);
    state.tokens.push_back(in.string().length());
    state.tokens.push_back(TokenType);
  }
};

// Keywords
template <> struct TokenAction<rules::str_data> : GenericAction<1> {};
template <> struct TokenAction<rules::str_loop> : GenericAction<1> {};
template <> struct TokenAction<rules::str_global> : GenericAction<1> {};
template <> struct TokenAction<rules::str_save> : GenericAction<1> {};
template <> struct TokenAction<rules::str_stop> : GenericAction<1> {};

// Tags
template <> struct TokenAction<rules::item_tag> : GenericAction<2> {};
template <> struct TokenAction<rules::loop_tag> : GenericAction<2> {};

// Values
// Type 5: Simple Value (guaranteed single line, no quotes, e.g. numbers, dots,
// question marks) Type 3: Complex Value (quoted, semicolon, or unknown - might
// be multiline)
template <> struct TokenAction<rules::simunq> : GenericAction<5> {};
template <>
struct TokenAction<rules::unquoted> : GenericAction<5> {
}; // Unquoted is also usually simple

template <> struct TokenAction<rules::singlequoted> : GenericAction<3> {};
template <> struct TokenAction<rules::doublequoted> : GenericAction<3> {};
template <> struct TokenAction<rules::textfield> : GenericAction<3> {};

// Comments
template <> struct TokenAction<rules::comment> : GenericAction<4> {};

std::vector<int> tokenize(std::string input) {
  TokenizerState state;
  // Pre-allocate to avoid reallocations
  state.tokens.reserve(input.length() / 4);

  tao::pegtl::memory_input<> in(input.c_str(), input.length(), "mmcif");
  try {
    tao::pegtl::parse<rules::file, TokenAction, gemmi::cif::Errors>(in, state);
  } catch (const std::exception &e) {
    // partial result
  }
  return state.tokens;
}

EMSCRIPTEN_BINDINGS(my_module) {
  register_vector<int>("VectorInt");
  function("tokenize", &tokenize);
}

"use strict";
var GleamUtils = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/gleam_generated/string_utils.js
  var string_utils_exports = {};
  __export(string_utils_exports, {
    escape_html: () => escape_html,
    format_time_ago: () => format_time_ago,
    generate_track_slug: () => generate_track_slug,
    get_file_extension: () => get_file_extension,
    normalize_url: () => normalize_url,
    pad_left: () => pad_left,
    sanitize_filename: () => sanitize_filename,
    slugify: () => slugify,
    validate_username: () => validate_username
  });
  var CustomType = class {
    withFields(fields) {
      let properties = Object.keys(this).map(
        (label) => label in fields ? fields[label] : this[label]
      );
      return new this.constructor(...properties);
    }
  };
  var List = class {
    static fromArray(array, tail) {
      let t = tail || new Empty();
      for (let i = array.length - 1; i >= 0; --i) {
        t = new NonEmpty(array[i], t);
      }
      return t;
    }
    [Symbol.iterator]() {
      return new ListIterator(this);
    }
    toArray() {
      return [...this];
    }
    atLeastLength(desired) {
      let current = this;
      while (desired-- > 0 && current) current = current.tail;
      return current !== void 0;
    }
    hasLength(desired) {
      let current = this;
      while (desired-- > 0 && current) current = current.tail;
      return desired === -1 && current instanceof Empty;
    }
    countLength() {
      let current = this;
      let length2 = 0;
      while (current) {
        current = current.tail;
        length2++;
      }
      return length2 - 1;
    }
  };
  function prepend(element, tail) {
    return new NonEmpty(element, tail);
  }
  function toList(elements, tail) {
    return List.fromArray(elements, tail);
  }
  var ListIterator = class {
    #current;
    constructor(current) {
      this.#current = current;
    }
    next() {
      if (this.#current instanceof Empty) {
        return { done: true };
      } else {
        let { head, tail } = this.#current;
        this.#current = tail;
        return { value: head, done: false };
      }
    }
  };
  var Empty = class extends List {
  };
  var NonEmpty = class extends List {
    constructor(head, tail) {
      super();
      this.head = head;
      this.tail = tail;
    }
  };
  var Result = class _Result extends CustomType {
    static isResult(data2) {
      return data2 instanceof _Result;
    }
  };
  var Ok = class extends Result {
    constructor(value) {
      super();
      this[0] = value;
    }
    isOk() {
      return true;
    }
  };
  var Error2 = class extends Result {
    constructor(detail) {
      super();
      this[0] = detail;
    }
    isOk() {
      return false;
    }
  };
  var bits = 5;
  var mask = (1 << bits) - 1;
  var noElementMarker = Symbol();
  var generationKey = Symbol();
  function reverse_and_prepend(loop$prefix, loop$suffix) {
    while (true) {
      let prefix = loop$prefix;
      let suffix = loop$suffix;
      if (prefix instanceof Empty) {
        return suffix;
      } else {
        let first$1 = prefix.head;
        let rest$1 = prefix.tail;
        loop$prefix = rest$1;
        loop$suffix = prepend(first$1, suffix);
      }
    }
  }
  function reverse(list2) {
    return reverse_and_prepend(list2, toList([]));
  }
  function map_loop(loop$list, loop$fun, loop$acc) {
    while (true) {
      let list2 = loop$list;
      let fun = loop$fun;
      let acc = loop$acc;
      if (list2 instanceof Empty) {
        return reverse(acc);
      } else {
        let first$1 = list2.head;
        let rest$1 = list2.tail;
        loop$list = rest$1;
        loop$fun = fun;
        loop$acc = prepend(fun(first$1), acc);
      }
    }
  }
  function map2(list2, fun) {
    return map_loop(list2, fun, toList([]));
  }
  function split2(x, substring) {
    if (substring === "") {
      return graphemes(x);
    } else {
      let _pipe = x;
      let _pipe$1 = identity(_pipe);
      let _pipe$2 = split(_pipe$1, substring);
      return map2(_pipe$2, identity);
    }
  }
  var Nil = void 0;
  function identity(x) {
    return x;
  }
  function to_string(term) {
    return term.toString();
  }
  function string_length(string2) {
    if (string2 === "") {
      return 0;
    }
    const iterator = graphemes_iterator(string2);
    if (iterator) {
      let i = 0;
      for (const _ of iterator) {
        i++;
      }
      return i;
    } else {
      return string2.match(/./gsu).length;
    }
  }
  function graphemes(string2) {
    const iterator = graphemes_iterator(string2);
    if (iterator) {
      return List.fromArray(Array.from(iterator).map((item) => item.segment));
    } else {
      return List.fromArray(string2.match(/./gsu));
    }
  }
  var segmenter = void 0;
  function graphemes_iterator(string2) {
    if (globalThis.Intl && Intl.Segmenter) {
      segmenter ||= new Intl.Segmenter();
      return segmenter.segment(string2)[Symbol.iterator]();
    }
  }
  function pop_grapheme(string2) {
    let first;
    const iterator = graphemes_iterator(string2);
    if (iterator) {
      first = iterator.next().value?.segment;
    } else {
      first = string2.match(/./su)?.[0];
    }
    if (first) {
      return new Ok([first, string2.slice(first.length)]);
    } else {
      return new Error2(Nil);
    }
  }
  function lowercase(string2) {
    return string2.toLowerCase();
  }
  function split(xs, pattern) {
    return List.fromArray(xs.split(pattern));
  }
  var unicode_whitespaces = [
    " ",
    // Space
    "	",
    // Horizontal tab
    "\n",
    // Line feed
    "\v",
    // Vertical tab
    "\f",
    // Form feed
    "\r",
    // Carriage return
    "\x85",
    // Next line
    "\u2028",
    // Line separator
    "\u2029"
    // Paragraph separator
  ].join("");
  var trim_start_regex = /* @__PURE__ */ new RegExp(
    `^[${unicode_whitespaces}]*`
  );
  var trim_end_regex = /* @__PURE__ */ new RegExp(`[${unicode_whitespaces}]*$`);
  function escape_html_recursive(loop$remaining, loop$acc) {
    while (true) {
      let remaining = loop$remaining;
      let acc = loop$acc;
      let $ = pop_grapheme(remaining);
      if ($ instanceof Ok) {
        let char = $[0][0];
        let rest = $[0][1];
        let _block;
        if (char === "&") {
          _block = "&amp;";
        } else if (char === "<") {
          _block = "&lt;";
        } else if (char === ">") {
          _block = "&gt;";
        } else if (char === '"') {
          _block = "&quot;";
        } else if (char === "'") {
          _block = "&#039;";
        } else {
          _block = char;
        }
        let escaped = _block;
        loop$remaining = rest;
        loop$acc = acc + escaped;
      } else {
        return acc;
      }
    }
  }
  function escape_html(text) {
    return escape_html_recursive(text, "");
  }
  function is_alphanumeric(char) {
    if (char === "a") {
      return true;
    } else if (char === "b") {
      return true;
    } else if (char === "c") {
      return true;
    } else if (char === "d") {
      return true;
    } else if (char === "e") {
      return true;
    } else if (char === "f") {
      return true;
    } else if (char === "g") {
      return true;
    } else if (char === "h") {
      return true;
    } else if (char === "i") {
      return true;
    } else if (char === "j") {
      return true;
    } else if (char === "k") {
      return true;
    } else if (char === "l") {
      return true;
    } else if (char === "m") {
      return true;
    } else if (char === "n") {
      return true;
    } else if (char === "o") {
      return true;
    } else if (char === "p") {
      return true;
    } else if (char === "q") {
      return true;
    } else if (char === "r") {
      return true;
    } else if (char === "s") {
      return true;
    } else if (char === "t") {
      return true;
    } else if (char === "u") {
      return true;
    } else if (char === "v") {
      return true;
    } else if (char === "w") {
      return true;
    } else if (char === "x") {
      return true;
    } else if (char === "y") {
      return true;
    } else if (char === "z") {
      return true;
    } else if (char === "0") {
      return true;
    } else if (char === "1") {
      return true;
    } else if (char === "2") {
      return true;
    } else if (char === "3") {
      return true;
    } else if (char === "4") {
      return true;
    } else if (char === "5") {
      return true;
    } else if (char === "6") {
      return true;
    } else if (char === "7") {
      return true;
    } else if (char === "8") {
      return true;
    } else if (char === "9") {
      return true;
    } else {
      return false;
    }
  }
  function slugify_replace_non_alnum(loop$remaining, loop$acc) {
    while (true) {
      let remaining = loop$remaining;
      let acc = loop$acc;
      let $ = pop_grapheme(remaining);
      if ($ instanceof Ok) {
        let char = $[0][0];
        let rest = $[0][1];
        let _block;
        let $1 = is_alphanumeric(char);
        if ($1) {
          _block = char;
        } else {
          _block = "-";
        }
        let processed = _block;
        loop$remaining = rest;
        loop$acc = acc + processed;
      } else {
        return acc;
      }
    }
  }
  function trim_start_dashes(loop$text) {
    while (true) {
      let text = loop$text;
      let $ = pop_grapheme(text);
      if ($ instanceof Ok) {
        let char = $[0][0];
        let rest = $[0][1];
        if (char === "-") {
          loop$text = rest;
        } else {
          return text;
        }
      } else {
        return text;
      }
    }
  }
  function trim_end_dashes_recursive(loop$remaining, loop$acc) {
    while (true) {
      let remaining = loop$remaining;
      let acc = loop$acc;
      let $ = pop_grapheme(remaining);
      if ($ instanceof Ok) {
        let char = $[0][0];
        let rest = $[0][1];
        if (char === "-") {
          let $1 = pop_grapheme(rest);
          if ($1 instanceof Ok) {
            loop$remaining = rest;
            loop$acc = acc + char;
          } else {
            return acc;
          }
        } else {
          loop$remaining = rest;
          loop$acc = acc + char;
        }
      } else {
        return acc;
      }
    }
  }
  function trim_end_dashes(text) {
    return trim_end_dashes_recursive(text, "");
  }
  function trim_dashes(text) {
    let trimmed_start = trim_start_dashes(text);
    return trim_end_dashes(trimmed_start);
  }
  function slugify(text) {
    let lower = lowercase(text);
    let with_dashes = slugify_replace_non_alnum(lower, "");
    return trim_dashes(with_dashes);
  }
  function generate_track_slug(album_title, track_title) {
    let _block;
    if (track_title === "") {
      _block = "untitled";
    } else {
      _block = track_title;
    }
    let track = _block;
    let combined = album_title + "-" + track;
    return slugify(combined);
  }
  function format_time_ago(timestamp_ms, current_time_ms) {
    let diff_ms = current_time_ms - timestamp_ms;
    let diff_seconds = globalThis.Math.trunc(diff_ms / 1e3);
    let s = diff_seconds;
    if (s < 60) {
      return "just now";
    } else {
      let s2 = diff_seconds;
      if (s2 < 3600) {
        let minutes = globalThis.Math.trunc(s2 / 60);
        return to_string(minutes) + "m ago";
      } else {
        let s3 = diff_seconds;
        if (s3 < 86400) {
          let hours = globalThis.Math.trunc(s3 / 3600);
          return to_string(hours) + "h ago";
        } else {
          let s4 = diff_seconds;
          if (s4 < 604800) {
            let days = globalThis.Math.trunc(s4 / 86400);
            return to_string(days) + "d ago";
          } else {
            return "";
          }
        }
      }
    }
  }
  function is_safe_filename_char(char) {
    if (char === "a") {
      return true;
    } else if (char === "b") {
      return true;
    } else if (char === "c") {
      return true;
    } else if (char === "d") {
      return true;
    } else if (char === "e") {
      return true;
    } else if (char === "f") {
      return true;
    } else if (char === "g") {
      return true;
    } else if (char === "h") {
      return true;
    } else if (char === "i") {
      return true;
    } else if (char === "j") {
      return true;
    } else if (char === "k") {
      return true;
    } else if (char === "l") {
      return true;
    } else if (char === "m") {
      return true;
    } else if (char === "n") {
      return true;
    } else if (char === "o") {
      return true;
    } else if (char === "p") {
      return true;
    } else if (char === "q") {
      return true;
    } else if (char === "r") {
      return true;
    } else if (char === "s") {
      return true;
    } else if (char === "t") {
      return true;
    } else if (char === "u") {
      return true;
    } else if (char === "v") {
      return true;
    } else if (char === "w") {
      return true;
    } else if (char === "x") {
      return true;
    } else if (char === "y") {
      return true;
    } else if (char === "z") {
      return true;
    } else if (char === "A") {
      return true;
    } else if (char === "B") {
      return true;
    } else if (char === "C") {
      return true;
    } else if (char === "D") {
      return true;
    } else if (char === "E") {
      return true;
    } else if (char === "F") {
      return true;
    } else if (char === "G") {
      return true;
    } else if (char === "H") {
      return true;
    } else if (char === "I") {
      return true;
    } else if (char === "J") {
      return true;
    } else if (char === "K") {
      return true;
    } else if (char === "L") {
      return true;
    } else if (char === "M") {
      return true;
    } else if (char === "N") {
      return true;
    } else if (char === "O") {
      return true;
    } else if (char === "P") {
      return true;
    } else if (char === "Q") {
      return true;
    } else if (char === "R") {
      return true;
    } else if (char === "S") {
      return true;
    } else if (char === "T") {
      return true;
    } else if (char === "U") {
      return true;
    } else if (char === "V") {
      return true;
    } else if (char === "W") {
      return true;
    } else if (char === "X") {
      return true;
    } else if (char === "Y") {
      return true;
    } else if (char === "Z") {
      return true;
    } else if (char === "0") {
      return true;
    } else if (char === "1") {
      return true;
    } else if (char === "2") {
      return true;
    } else if (char === "3") {
      return true;
    } else if (char === "4") {
      return true;
    } else if (char === "5") {
      return true;
    } else if (char === "6") {
      return true;
    } else if (char === "7") {
      return true;
    } else if (char === "8") {
      return true;
    } else if (char === "9") {
      return true;
    } else if (char === ".") {
      return true;
    } else if (char === "_") {
      return true;
    } else if (char === "-") {
      return true;
    } else {
      return false;
    }
  }
  function sanitize_filename_recursive(loop$remaining, loop$acc) {
    while (true) {
      let remaining = loop$remaining;
      let acc = loop$acc;
      let $ = pop_grapheme(remaining);
      if ($ instanceof Ok) {
        let char = $[0][0];
        let rest = $[0][1];
        let _block;
        let $1 = is_safe_filename_char(char);
        if ($1) {
          _block = char;
        } else {
          _block = "_";
        }
        let processed = _block;
        loop$remaining = rest;
        loop$acc = acc + processed;
      } else {
        return acc;
      }
    }
  }
  function sanitize_filename(filename) {
    return sanitize_filename_recursive(filename, "");
  }
  function normalize_url_recursive(loop$remaining, loop$acc) {
    while (true) {
      let remaining = loop$remaining;
      let acc = loop$acc;
      let $ = pop_grapheme(remaining);
      if ($ instanceof Ok) {
        let char = $[0][0];
        let rest = $[0][1];
        if (char === "/") {
          let $1 = pop_grapheme(rest);
          if ($1 instanceof Ok) {
            loop$remaining = rest;
            loop$acc = acc + char;
          } else {
            return acc;
          }
        } else {
          loop$remaining = rest;
          loop$acc = acc + char;
        }
      } else {
        return acc;
      }
    }
  }
  function normalize_url(url) {
    return normalize_url_recursive(url, "");
  }
  function get_file_extension(filename) {
    let parts = split2(filename, ".");
    let $ = reverse(parts);
    if ($ instanceof Empty) {
      return "";
    } else {
      let ext = $.head;
      return lowercase(ext);
    }
  }
  function is_alphanumeric_or_underscore(char) {
    if (char === "a") {
      return true;
    } else if (char === "b") {
      return true;
    } else if (char === "c") {
      return true;
    } else if (char === "d") {
      return true;
    } else if (char === "e") {
      return true;
    } else if (char === "f") {
      return true;
    } else if (char === "g") {
      return true;
    } else if (char === "h") {
      return true;
    } else if (char === "i") {
      return true;
    } else if (char === "j") {
      return true;
    } else if (char === "k") {
      return true;
    } else if (char === "l") {
      return true;
    } else if (char === "m") {
      return true;
    } else if (char === "n") {
      return true;
    } else if (char === "o") {
      return true;
    } else if (char === "p") {
      return true;
    } else if (char === "q") {
      return true;
    } else if (char === "r") {
      return true;
    } else if (char === "s") {
      return true;
    } else if (char === "t") {
      return true;
    } else if (char === "u") {
      return true;
    } else if (char === "v") {
      return true;
    } else if (char === "w") {
      return true;
    } else if (char === "x") {
      return true;
    } else if (char === "y") {
      return true;
    } else if (char === "z") {
      return true;
    } else if (char === "A") {
      return true;
    } else if (char === "B") {
      return true;
    } else if (char === "C") {
      return true;
    } else if (char === "D") {
      return true;
    } else if (char === "E") {
      return true;
    } else if (char === "F") {
      return true;
    } else if (char === "G") {
      return true;
    } else if (char === "H") {
      return true;
    } else if (char === "I") {
      return true;
    } else if (char === "J") {
      return true;
    } else if (char === "K") {
      return true;
    } else if (char === "L") {
      return true;
    } else if (char === "M") {
      return true;
    } else if (char === "N") {
      return true;
    } else if (char === "O") {
      return true;
    } else if (char === "P") {
      return true;
    } else if (char === "Q") {
      return true;
    } else if (char === "R") {
      return true;
    } else if (char === "S") {
      return true;
    } else if (char === "T") {
      return true;
    } else if (char === "U") {
      return true;
    } else if (char === "V") {
      return true;
    } else if (char === "W") {
      return true;
    } else if (char === "X") {
      return true;
    } else if (char === "Y") {
      return true;
    } else if (char === "Z") {
      return true;
    } else if (char === "0") {
      return true;
    } else if (char === "1") {
      return true;
    } else if (char === "2") {
      return true;
    } else if (char === "3") {
      return true;
    } else if (char === "4") {
      return true;
    } else if (char === "5") {
      return true;
    } else if (char === "6") {
      return true;
    } else if (char === "7") {
      return true;
    } else if (char === "8") {
      return true;
    } else if (char === "9") {
      return true;
    } else if (char === "_") {
      return true;
    } else {
      return false;
    }
  }
  function is_valid_username_chars_recursive(loop$remaining) {
    while (true) {
      let remaining = loop$remaining;
      let $ = pop_grapheme(remaining);
      if ($ instanceof Ok) {
        let char = $[0][0];
        let rest = $[0][1];
        let $1 = is_alphanumeric_or_underscore(char);
        if ($1) {
          loop$remaining = rest;
        } else {
          return $1;
        }
      } else {
        return true;
      }
    }
  }
  function is_valid_username_chars(username) {
    return is_valid_username_chars_recursive(username);
  }
  function validate_username(username) {
    let len = string_length(username);
    let l = len;
    if (l < 3) {
      return new Error2("Username must be at least 3 characters");
    } else {
      let l2 = len;
      if (l2 > 20) {
        return new Error2("Username must be at most 20 characters");
      } else {
        let $ = is_valid_username_chars(username);
        if ($) {
          return new Ok(username);
        } else {
          return new Error2(
            "Username must contain only letters, numbers, and underscores"
          );
        }
      }
    }
  }
  function pad_left(loop$text, loop$length, loop$char) {
    while (true) {
      let text = loop$text;
      let length2 = loop$length;
      let char = loop$char;
      let current_len = string_length(text);
      let $ = current_len < length2;
      if ($) {
        loop$text = char + text;
        loop$length = length2;
        loop$char = char;
      } else {
        return text;
      }
    }
  }
  return __toCommonJS(string_utils_exports);
})();

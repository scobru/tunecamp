// build/dev/javascript/gleam_stdlib/dict.mjs
var bits = 5;
var mask = (1 << bits) - 1;
var noElementMarker = Symbol();
var generationKey = Symbol();

// build/dev/javascript/gleam_stdlib/gleam_stdlib.mjs
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
var segmenter = void 0;
function graphemes_iterator(string2) {
  if (globalThis.Intl && Intl.Segmenter) {
    segmenter ||= new Intl.Segmenter();
    return segmenter.segment(string2)[Symbol.iterator]();
  }
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
function truncate(float2) {
  return Math.trunc(float2);
}

// build/dev/javascript/tunecamp_gleam/gleam/audio_utils.mjs
function format_duration(seconds) {
  let total_seconds = truncate(seconds);
  let mins = globalThis.Math.trunc(total_seconds / 60);
  let secs = total_seconds % 60;
  let secs_str = to_string(secs);
  let _block;
  let $ = string_length(secs_str);
  if ($ === 1) {
    _block = "0" + secs_str;
  } else {
    _block = secs_str;
  }
  let padded_secs = _block;
  return to_string(mins) + ":" + padded_secs;
}
function format_float(f) {
  let multiplied = f * 10;
  let truncated = truncate(multiplied);
  let whole = globalThis.Math.trunc(truncated / 10);
  let decimal = truncated % 10;
  return to_string(whole) + "." + to_string(decimal);
}
function format_size_recursive(loop$size, loop$unit_index) {
  while (true) {
    let size2 = loop$size;
    let unit_index = loop$unit_index;
    let $ = size2 >= 1024 && unit_index < 3;
    if ($) {
      loop$size = size2 / 1024;
      loop$unit_index = unit_index + 1;
    } else {
      let _block;
      if (unit_index === 0) {
        _block = "B";
      } else if (unit_index === 1) {
        _block = "KB";
      } else if (unit_index === 2) {
        _block = "MB";
      } else if (unit_index === 3) {
        _block = "GB";
      } else {
        _block = "?";
      }
      let unit = _block;
      return format_float(size2) + " " + unit;
    }
  }
}
function format_file_size(bytes) {
  return format_size_recursive(identity(bytes), 0);
}
export {
  format_duration,
  format_file_size
};

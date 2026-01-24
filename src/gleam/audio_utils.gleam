import gleam/float
import gleam/int
import gleam/string

// Remove unused import if not needed, but string is used.
// Remove list import as we don't use it anymore

pub fn format_duration(seconds: Float) -> String {
  let total_seconds = float.truncate(seconds)
  let mins = total_seconds / 60
  let secs = total_seconds % 60

  let secs_str = int.to_string(secs)
  let padded_secs = case string.length(secs_str) {
    1 -> "0" <> secs_str
    _ -> secs_str
  }

  int.to_string(mins) <> ":" <> padded_secs
}

pub fn format_file_size(bytes: Int) -> String {
  format_size_recursive(int.to_float(bytes), 0)
}

fn format_size_recursive(size: Float, unit_index: Int) -> String {
  // If size is >= 1024 and we haven't reached the last unit (GB = index 3)
  case size >=. 1024.0 && unit_index < 3 {
    True -> format_size_recursive(size /. 1024.0, unit_index + 1)
    False -> {
      let unit = case unit_index {
        0 -> "B"
        1 -> "KB"
        2 -> "MB"
        3 -> "GB"
        _ -> "?"
      }

      format_float(size) <> " " <> unit
    }
  }
}

fn format_float(f: Float) -> String {
  // Simple 1 decimal place formatting
  let multiplied = f *. 10.0
  let truncated = float.truncate(multiplied)
  let whole = truncated / 10
  let decimal = truncated % 10

  int.to_string(whole) <> "." <> int.to_string(decimal)
}

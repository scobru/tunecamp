import { formatDuration, formatFileSize } from './utils/audioUtils.js';

console.log('Testing Gleam Integration:');
console.log('formatDuration(125.5):', formatDuration(125.5)); // Expected: 2:05
console.log('formatFileSize(1024):', formatFileSize(1024)); // Expected: 1.0 KB
console.log('formatFileSize(500):', formatFileSize(500)); // Expected: 500.0 B or 500 B
console.log('formatFileSize(1024 * 1024 * 2.5):', formatFileSize(1024 * 1024 * 2.5)); // Expected: 2.5 MB

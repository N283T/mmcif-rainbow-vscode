/**
 * Constants for mmCIF Rainbow extension
 */

/** Number of rainbow colors for column cycling */
export const RAINBOW_COLOR_COUNT = 9;

/** Maximum number of lines to scan for dictionary type detection */
export const DICTIONARY_DETECTION_LINE_LIMIT = 500;

/** Debounce delay for cursor update events in milliseconds */
export const CURSOR_UPDATE_DEBOUNCE_MS = 50;

/** Duration for search highlight flash in milliseconds */
export const SEARCH_HIGHLIGHT_DURATION_MS = 1500;

/** pLDDT confidence thresholds */
export const PLDDT_THRESHOLDS = {
    VERY_HIGH: 90,
    HIGH: 70,
    LOW: 50
} as const;

/** pLDDT confidence colors (AlphaFold color scheme) */
export const PLDDT_COLORS = {
    VERY_HIGH: '#0053D6',  // dark blue
    HIGH: '#65CBF3',       // light blue
    LOW: '#FFDB13',        // yellow
    VERY_LOW: '#FF7D45'    // orange
} as const;

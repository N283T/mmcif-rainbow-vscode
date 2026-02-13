/**
 * Utility functions for mmCIF Rainbow extension
 */

/**
 * Creates a debounced version of a function.
 * The function will only be called after the specified delay has passed
 * without any new calls.
 *
 * @param fn The function to debounce
 * @param delay The delay in milliseconds
 * @returns A debounced version of the function
 */
export function debounce<T extends unknown[]>(
    fn: (...args: T) => void,
    delay: number
): (...args: T) => void {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    return (...args: T) => {
        if (timeoutId !== undefined) {
            clearTimeout(timeoutId);
        }
        timeoutId = setTimeout(() => {
            fn(...args);
            timeoutId = undefined;
        }, delay);
    };
}

/**
 * Generic debounce helper: wraps a callback so it only fires after `wait`
 * milliseconds have elapsed since the last invocation.
 * Returns an object exposing the debounced fn and a `cancel` method.
 */
export function createDebouncer<T extends (...args: any[]) => void>(
  fn: T,
  wait: number
): {
  call: (...args: Parameters<T>) => void;
  cancel: () => void;
} {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const call = (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, wait);
  };

  const cancel = () => {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return { call, cancel };
}

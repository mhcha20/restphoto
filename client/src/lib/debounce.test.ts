import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createDebouncer } from "./debounce";

describe("createDebouncer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("delays callback execution by the specified wait time", () => {
    const fn = vi.fn();
    const debouncer = createDebouncer(fn, 300);

    debouncer.call("query");
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("query");
  });

  it("only fires once when called multiple times rapidly", () => {
    const fn = vi.fn();
    const debouncer = createDebouncer(fn, 300);

    debouncer.call("a");
    debouncer.call("b");
    debouncer.call("c");

    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("c");
  });

  it("resets the timer on each call", () => {
    const fn = vi.fn();
    const debouncer = createDebouncer(fn, 300);

    debouncer.call("first");
    vi.advanceTimersByTime(200);
    debouncer.call("second");
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("second");
  });

  it("cancel prevents pending invocation", () => {
    const fn = vi.fn();
    const debouncer = createDebouncer(fn, 300);

    debouncer.call("query");
    debouncer.cancel();

    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});

import { describe, it, expect } from "vitest";
import { drawTelemetry } from "@/components/dashboard/ResourceTelemetryChart";
import type { ChartPoint } from "@/utils/telemetry/types";

/**
 * A recording fake 2D context. We only need to observe the high-level
 * rendering decisions (how many strokes, whether the line is dashed, opacity)
 * to prove the gap-separator / synthetic styling behaviour.
 */
class FakeCtx {
  strokes = 0;
  lineDashCalls: number[][] = [];
  alphaValues: number[] = [];
  moveToCalls = 0;
  lineToCalls = 0;
  clearRectCount = 0;
  private alpha = 1;

  strokeStyle = "";
  lineWidth = 1;
  fillStyle = "";
  font = "";

  get globalAlpha(): number {
    return this.alpha;
  }
  set globalAlpha(v: number) {
    this.alpha = v;
    this.alphaValues.push(v);
  }

  setLineDash(seg: number[]): void {
    this.lineDashCalls.push(seg);
  }
  beginPath(): void {
    /* recorded implicitly via moveTo/stroke */
  }
  moveTo(_x: number, _y: number): void {
    this.moveToCalls++;
  }
  lineTo(_x: number, _y: number): void {
    this.lineToCalls++;
  }
  stroke(): void {
    this.strokes++;
  }
  clearRect(): void {
    this.clearRectCount++;
  }
  fillRect(): void {
    /* no-op */
  }
  fillText(): void {
    /* no-op */
  }
}

function point(value: number, synthetic = false): ChartPoint {
  return { value, synthetic, timestamp: 0, sequence: synthetic ? -1 : 0 };
}

function ctx(): CanvasRenderingContext2D {
  return new FakeCtx() as unknown as CanvasRenderingContext2D;
}

describe("drawTelemetry renderer", () => {
  it("draws a single solid segment for a normal real-valued series", () => {
    const c = ctx();
    drawTelemetry(c, [[point(10), point(20), point(30)]], {
      width: 100,
      height: 100,
    });
    const fake = c as unknown as FakeCtx;
    expect(fake.strokes).toBe(1);
    expect(fake.lineDashCalls).toContainEqual([]);
    expect(fake.alphaValues).toContain(1);
  });

  it("breaks the line at a NaN sentinel into disconnected segments", () => {
    const c = ctx();
    drawTelemetry(
      c,
      [[point(10), point(20), point(NaN, true), point(30), point(40)]],
      { width: 100, height: 100 }
    );
    const fake = c as unknown as FakeCtx;
    // Two separate strokes around the NaN gap separator.
    expect(fake.strokes).toBe(2);
  });

  it("renders synthetic (interpolated) points dashed and dimmed", () => {
    const c = ctx();
    drawTelemetry(
      c,
      [[point(10), point(15, true), point(20)]],
      { width: 100, height: 100 }
    );
    const fake = c as unknown as FakeCtx;
    expect(fake.lineDashCalls).toContainEqual([5, 4]);
    expect(fake.alphaValues).toContain(0.5);
  });

  it("does not crash on an empty dataset", () => {
    const c = ctx();
    expect(() =>
      drawTelemetry(c, [[]], { width: 100, height: 100 })
    ).not.toThrow();
    const fake = c as unknown as FakeCtx;
    expect(fake.strokes).toBe(0);
    expect(fake.clearRectCount).toBe(1);
  });
});

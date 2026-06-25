import { describe, it, expect, beforeEach } from "vitest";
import { decimal, eq } from "@/utils/decimal";
import {
  resourceStore,
  serializeReading,
  deserializeReading,
  selectReadings,
  selectTotal,
} from "@/store/slices/resourceSlice";
import { RESOURCE_PRECISION, type MeterReading } from "@/types/meter";

function reading(value: string, timestamp = 0): MeterReading {
  return {
    meterId: "m1",
    resource: "electricity",
    timestamp,
    value: decimal(value, RESOURCE_PRECISION.electricity) as MeterReading["value"],
  };
}

beforeEach(() => resourceStore.dispatch({ type: "RESET" }));

describe("serialize / deserialize", () => {
  it("round-trips a reading losslessly through string encoding", () => {
    const r = reading("12.345");
    const s = serializeReading(r);
    expect(s.value).toEqual({ value: "12.345", precision: 3, scale: 1000 });
    const back = deserializeReading(s);
    expect(eq(back.value, r.value)).toBe(true);
  });
});

describe("resourceStore", () => {
  it("stores readings in serialized form and rehydrates them", () => {
    resourceStore.dispatch({ type: "ADD_READING", payload: reading("1.500") });
    resourceStore.dispatch({ type: "ADD_READING", payload: reading("2.500") });

    // Raw state is JSON-safe (string values, no BigNumber instances).
    const raw = resourceStore.getState().electricity;
    expect(raw).toHaveLength(2);
    expect(typeof raw[0].value.value).toBe("string");

    const readings = selectReadings(resourceStore.getState(), "electricity");
    expect(readings.map((r) => r.value.toFixed())).toEqual(["1.500", "2.500"]);
  });

  it("computes an exact total via the selector", () => {
    resourceStore.dispatch({
      type: "ADD_READINGS",
      payload: [reading("0.001"), reading("0.002"), reading("0.003")],
    });
    expect(selectTotal(resourceStore.getState(), "electricity").toFixed()).toBe("0.006");
  });

  it("CLEAR_RESOURCE empties one resource only", () => {
    resourceStore.dispatch({ type: "ADD_READING", payload: reading("1.000") });
    resourceStore.dispatch({ type: "CLEAR_RESOURCE", payload: { resource: "electricity" } });
    expect(resourceStore.getState().electricity).toHaveLength(0);
  });
});

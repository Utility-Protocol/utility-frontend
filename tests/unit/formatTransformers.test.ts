import { describe, it, expect } from "vitest";
import {
  csvEscape,
  csvHeader,
  csvTransformer,
  truncateCoord,
  geoJsonTransformer,
  shapefileTransformer,
} from "@/utils/formatTransformers";

describe("csvEscape (RFC 4180)", () => {
  it("leaves simple values unquoted", () => {
    expect(csvEscape("plain")).toBe("plain");
    expect(csvEscape(42)).toBe("42");
  });

  it("quotes values containing a comma", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
  });

  it("escapes embedded double quotes by doubling them", () => {
    expect(csvEscape('she said "hi"')).toBe('"she said ""hi"""');
  });

  it("quotes values containing newlines or carriage returns", () => {
    expect(csvEscape("line1\nline2")).toBe('"line1\nline2"');
    expect(csvEscape("a\r\nb")).toBe('"a\r\nb"');
  });

  it("renders null/undefined as empty", () => {
    expect(csvEscape(null)).toBe("");
    expect(csvEscape(undefined)).toBe("");
  });
});

describe("csvHeader / csvTransformer", () => {
  it("emits a CRLF-terminated header in column order", () => {
    expect(csvHeader(["id", "name"])).toBe("id,name\r\n");
  });

  it("projects only the requested columns in order", () => {
    const row = { id: 1, name: "Meter, A", extra: "ignored" };
    expect(csvTransformer(row, ["name", "id"])).toBe('"Meter, A",1\r\n');
  });

  it("renders missing columns as empty fields", () => {
    expect(csvTransformer({ id: 1 }, ["id", "missing"])).toBe("1,\r\n");
  });
});

describe("truncateCoord", () => {
  it("truncates (not rounds) to 6 decimal places", () => {
    expect(truncateCoord(12.34567891)).toBe(12.345678);
    expect(truncateCoord(-0.1234569)).toBe(-0.123456);
  });

  it("handles non-finite input", () => {
    expect(truncateCoord(NaN)).toBe(0);
    expect(truncateCoord(Infinity)).toBe(0);
  });
});

describe("geoJsonTransformer", () => {
  const geometry = { lonField: "lon", latField: "lat" };

  it("builds a Point Feature with truncated coordinates", () => {
    const row = { lon: 1.23456789, lat: -2.3456789, usage: 100, id: "m1" };
    const feature = geoJsonTransformer(row, ["id", "usage"], geometry);
    expect(feature.type).toBe("Feature");
    expect(feature.geometry).toEqual({
      type: "Point",
      coordinates: [1.234567, -2.345678],
    });
    expect(feature.properties).toEqual({ id: "m1", usage: 100 });
  });

  it("excludes geometry fields from properties", () => {
    const row = { lon: 1, lat: 2, usage: 5 };
    const feature = geoJsonTransformer(row, ["lon", "lat", "usage"], geometry);
    expect(feature.properties).toEqual({ usage: 5 });
  });
});

describe("shapefileTransformer", () => {
  it("extracts truncated lon/lat and attribute payload", () => {
    const geometry = { lonField: "lon", latField: "lat" };
    const row = { lon: 10.1234567, lat: 20.7654321, meter: "X", kwh: 12 };
    const rec = shapefileTransformer(row, ["meter", "kwh"], geometry);
    expect(rec.lon).toBe(10.123456);
    expect(rec.lat).toBe(20.765432);
    expect(rec.attributes).toEqual({ meter: "X", kwh: 12 });
  });
});

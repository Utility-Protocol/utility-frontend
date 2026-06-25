import { describe, it, expect } from "vitest";
import { createStoredZip, crc32 } from "@/utils/zip";
import {
  ShapefilePointWriter,
  buildShapefileZipEntries,
} from "@/utils/shapefileWriter";

describe("crc32", () => {
  it("matches the known CRC-32 of 'The quick brown fox jumps over the lazy dog'", () => {
    const bytes = new TextEncoder().encode(
      "The quick brown fox jumps over the lazy dog"
    );
    expect(crc32(bytes)).toBe(0x414fa339);
  });
});

describe("createStoredZip", () => {
  it("writes a valid local-file and EOCD signature with the right entry count", () => {
    const zip = createStoredZip([
      { name: "a.txt", data: new TextEncoder().encode("hello") },
      { name: "b.txt", data: new TextEncoder().encode("world") },
    ]);
    const view = new DataView(zip.buffer);
    // Local file header signature.
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    // End-of-central-directory signature appears at the tail (22-byte record).
    const eocdOffset = zip.length - 22;
    expect(view.getUint32(eocdOffset, true)).toBe(0x06054b50);
    // Total entries in the central directory.
    expect(view.getUint16(eocdOffset + 10, true)).toBe(2);
  });
});

describe("ShapefilePointWriter", () => {
  it("produces .shp/.shx with the shapefile magic and matching record count", () => {
    const writer = new ShapefilePointWriter([
      { name: "meter", type: "C" },
      { name: "kwh", type: "N" },
    ]);
    writer.addPoint(1.5, 2.5, { meter: "A", kwh: 100 });
    writer.addPoint(-3.25, 4.75, { meter: "BB", kwh: 9999 });

    const { shp, shx, dbf, prj } = writer.build();

    const shpView = new DataView(shp.buffer);
    // File code 9994 (big-endian) and shape type 1 = Point (little-endian).
    expect(shpView.getInt32(0, false)).toBe(9994);
    expect(shpView.getInt32(32, true)).toBe(1);
    // Header (100) + 2 records * (8 header + 20 content) = 156 bytes.
    expect(shp.length).toBe(100 + 2 * 28);

    // .shx header length field equals the file length in 16-bit words.
    const shxView = new DataView(shx.buffer);
    expect(shxView.getInt32(24, false)).toBe(shx.length / 2);

    // DBF record count.
    const dbfView = new DataView(dbf.buffer);
    expect(dbfView.getUint32(4, true)).toBe(2);

    // PRJ is WGS84 WKT.
    expect(new TextDecoder().decode(prj)).toContain("GCS_WGS_1984");
  });

  it("bundles four components into the zip entries", () => {
    const writer = new ShapefilePointWriter([{ name: "id", type: "C" }]);
    writer.addPoint(0, 0, { id: "x" });
    const entries = buildShapefileZipEntries(writer.build(), "export");
    expect(entries.map((e) => e.name)).toEqual([
      "export.shp",
      "export.shx",
      "export.dbf",
      "export.prj",
    ]);
  });
});

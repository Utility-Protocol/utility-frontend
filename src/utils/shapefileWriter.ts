/**
 * Minimal shapefile writer for Point geometries in EPSG:4326 (WGS84).
 *
 * Produces the four standard components — `.shp` (geometry), `.shx` (index),
 * `.dbf` (attributes) and `.prj` (projection) — which {@link createStoredZip}
 * bundles into a single download. Only the Point shape type is supported, which
 * matches the resource-consumption export (a coordinate per row).
 *
 * Shapefiles cannot be written in a single streaming pass: the `.shp`/`.shx`
 * headers carry the total file length and the `.dbf` header carries field
 * widths derived from the data. Records are therefore buffered and serialised in
 * {@link ShapefilePointWriter.build}; the buffer is bounded by the export row
 * cap (1,000,000 points ≈ tens of MB).
 */

const SHAPE_TYPE_POINT = 1;
const HEADER_SIZE = 100;
const POINT_CONTENT_BYTES = 20; // 4 (type) + 8 (x) + 8 (y)
const POINT_CONTENT_WORDS = POINT_CONTENT_BYTES / 2;

/** WKT for the WGS84 geographic coordinate system. */
const WGS84_WKT =
  'GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",' +
  'SPHEROID["WGS_1984",6378137.0,298.257223563]],' +
  'PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]]';

export type DbfFieldType = "C" | "N";

export interface ShapefileField {
  name: string;
  type: DbfFieldType;
}

interface PointRecord {
  x: number;
  y: number;
  attributes: Record<string, unknown>;
}

export interface ShapefileComponents {
  shp: Uint8Array;
  shx: Uint8Array;
  dbf: Uint8Array;
  prj: Uint8Array;
}

function writeShpHeader(view: DataView, fileLengthBytes: number, bbox: BBox): void {
  view.setInt32(0, 9994, false); // file code (big-endian)
  view.setInt32(24, fileLengthBytes / 2, false); // length in 16-bit words (BE)
  view.setInt32(28, 1000, true); // version (LE)
  view.setInt32(32, SHAPE_TYPE_POINT, true); // shape type (LE)
  view.setFloat64(36, bbox.xmin, true);
  view.setFloat64(44, bbox.ymin, true);
  view.setFloat64(52, bbox.xmax, true);
  view.setFloat64(60, bbox.ymax, true);
  // Z and M ranges remain 0 (bytes 68..99).
}

interface BBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export class ShapefilePointWriter {
  private readonly records: PointRecord[] = [];
  private readonly bbox: BBox = {
    xmin: Infinity,
    ymin: Infinity,
    xmax: -Infinity,
    ymax: -Infinity,
  };

  constructor(private readonly fields: ShapefileField[]) {}

  get count(): number {
    return this.records.length;
  }

  addPoint(x: number, y: number, attributes: Record<string, unknown>): void {
    this.records.push({ x, y, attributes });
    if (x < this.bbox.xmin) this.bbox.xmin = x;
    if (x > this.bbox.xmax) this.bbox.xmax = x;
    if (y < this.bbox.ymin) this.bbox.ymin = y;
    if (y > this.bbox.ymax) this.bbox.ymax = y;
  }

  build(): ShapefileComponents {
    const n = this.records.length;
    const bbox: BBox = n
      ? this.bbox
      : { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };

    // --- .shp ---
    const recordBytes = n * (8 + POINT_CONTENT_BYTES); // 8-byte record header each
    const shp = new Uint8Array(HEADER_SIZE + recordBytes);
    const shpView = new DataView(shp.buffer);
    writeShpHeader(shpView, shp.length, bbox);

    // --- .shx ---
    const shx = new Uint8Array(HEADER_SIZE + n * 8);
    const shxView = new DataView(shx.buffer);
    writeShpHeader(shxView, shx.length, bbox);

    let shpOffsetWords = HEADER_SIZE / 2;
    for (let i = 0; i < n; i++) {
      const rec = this.records[i];
      const recOffsetBytes = shpOffsetWords * 2;

      // .shp record header (big-endian).
      shpView.setInt32(recOffsetBytes, i + 1, false); // record number (1-based)
      shpView.setInt32(recOffsetBytes + 4, POINT_CONTENT_WORDS, false);
      // .shp record content (little-endian).
      shpView.setInt32(recOffsetBytes + 8, SHAPE_TYPE_POINT, true);
      shpView.setFloat64(recOffsetBytes + 12, rec.x, true);
      shpView.setFloat64(recOffsetBytes + 20, rec.y, true);

      // .shx index entry (big-endian): offset + content length, both in words.
      shxView.setInt32(HEADER_SIZE + i * 8, shpOffsetWords, false);
      shxView.setInt32(HEADER_SIZE + i * 8 + 4, POINT_CONTENT_WORDS, false);

      shpOffsetWords += 4 + POINT_CONTENT_WORDS; // 8-byte header = 4 words
    }

    return {
      shp,
      shx,
      dbf: this.buildDbf(),
      prj: new TextEncoder().encode(WGS84_WKT),
    };
  }

  private buildDbf(): Uint8Array {
    const n = this.records.length;
    const encoder = new TextEncoder();

    // Determine per-field width (and decimals for numeric fields) from data.
    const specs = this.fields.map((field) => {
      let length = 1;
      let decimals = 0;
      for (const rec of this.records) {
        const formatted = formatDbfValue(rec.attributes[field.name], field.type);
        if (field.type === "N") {
          const dot = formatted.indexOf(".");
          if (dot >= 0) decimals = Math.max(decimals, formatted.length - dot - 1);
        }
        length = Math.max(length, formatted.length);
      }
      const cap = field.type === "C" ? 254 : 19;
      return { field, length: Math.min(length, cap), decimals: Math.min(decimals, 15) };
    });

    const recordSize =
      1 + specs.reduce((sum, s) => sum + s.length, 0); // 1 = deletion flag
    const headerSize = 32 + specs.length * 32 + 1;

    const dbf = new Uint8Array(headerSize + n * recordSize + 1); // +1 EOF marker
    const view = new DataView(dbf.buffer);

    view.setUint8(0, 0x03); // dBASE III, no memo
    view.setUint8(1, 95); // year since 1900 (fixed → deterministic)
    view.setUint8(2, 1); // month
    view.setUint8(3, 1); // day
    view.setUint32(4, n, true); // record count
    view.setUint16(8, headerSize, true);
    view.setUint16(10, recordSize, true);

    // Field descriptors.
    let pos = 32;
    for (const spec of specs) {
      const nameBytes = encoder.encode(spec.field.name).slice(0, 10);
      dbf.set(nameBytes, pos); // null-padded by zero-initialised buffer
      view.setUint8(pos + 11, spec.field.type.charCodeAt(0));
      view.setUint8(pos + 16, spec.length);
      view.setUint8(pos + 17, spec.decimals);
      pos += 32;
    }
    view.setUint8(pos, 0x0d); // header terminator
    pos += 1;

    // Records.
    for (const rec of this.records) {
      dbf[pos] = 0x20; // not deleted
      pos += 1;
      for (const spec of specs) {
        const raw = formatDbfValue(rec.attributes[spec.field.name], spec.field.type);
        const field = padDbfField(raw, spec.length, spec.field.type);
        dbf.set(encoder.encode(field), pos);
        pos += spec.length;
      }
    }
    dbf[pos] = 0x1a; // EOF marker

    return dbf;
  }
}

function formatDbfValue(value: unknown, type: DbfFieldType): string {
  if (value === null || value === undefined) return "";
  if (type === "N") {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? String(n) : "";
  }
  return String(value);
}

/** C fields are left-justified, N fields right-justified; both space-padded. */
function padDbfField(value: string, length: number, type: DbfFieldType): string {
  let v = value;
  if (v.length > length) v = v.slice(0, length);
  return type === "N" ? v.padStart(length, " ") : v.padEnd(length, " ");
}

export function buildShapefileZipEntries(
  components: ShapefileComponents,
  baseName: string
): { name: string; data: Uint8Array }[] {
  return [
    { name: `${baseName}.shp`, data: components.shp },
    { name: `${baseName}.shx`, data: components.shx },
    { name: `${baseName}.dbf`, data: components.dbf },
    { name: `${baseName}.prj`, data: components.prj },
  ];
}

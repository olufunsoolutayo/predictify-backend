/**
 * Tests for the shared keyset cursor helper, focusing on the versioned wire
 * format that keeps pagination correct across schema migrations.
 */
import {
  CURSOR_VERSION,
  decodeCursor,
  encodeCursor,
  type CursorKey,
} from "../src/utils/cursor";

describe("cursor encode/decode", () => {
  const key: CursorKey = { sortValue: "2026-06-27T12:00:00.000Z", id: "abc-123" };

  it("round-trips a cursor key", () => {
    expect(decodeCursor(encodeCursor(key))).toEqual(key);
  });

  it("embeds the current cursor version in the encoded value", () => {
    const decoded = Buffer.from(encodeCursor(key), "base64url").toString("utf8");
    expect(decoded.startsWith(`${CURSOR_VERSION}|`)).toBe(true);
  });

  it("rejects a cursor minted under a different (legacy/migrated) version", () => {
    // A pre-versioning cursor "<sortValue>|<id>" must not be re-interpreted.
    const legacy = Buffer.from(`${key.sortValue}|${key.id}`, "utf8").toString("base64url");
    expect(decodeCursor(legacy)).toBeNull();

    const otherVersion = Buffer.from(
      `v0|${key.sortValue}|${key.id}`,
      "utf8",
    ).toString("base64url");
    expect(decodeCursor(otherVersion)).toBeNull();
  });

  it("returns null for missing, empty, or malformed cursors", () => {
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor("")).toBeNull();
    expect(decodeCursor(123)).toBeNull();
    expect(decodeCursor(encodeCursor({ ...key, id: "" }))).toBeNull();
  });

  it("preserves sortValues that themselves contain a separator", () => {
    const weird: CursorKey = { sortValue: "a|b|c", id: "id|1" };
    expect(decodeCursor(encodeCursor(weird))).toEqual(weird);
  });
});

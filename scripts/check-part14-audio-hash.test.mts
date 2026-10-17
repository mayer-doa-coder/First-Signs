import assert from "node:assert/strict";
import { test } from "node:test";
import { sha256HexFromBytes } from "../lib/audio-hash.ts";

const encoder = new TextEncoder();

test("SHA-256 fallback matches the empty-input standard vector", () => {
  assert.equal(
    sha256HexFromBytes(encoder.encode("")),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("SHA-256 fallback matches the abc standard vector", () => {
  assert.equal(
    sha256HexFromBytes(encoder.encode("abc")),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

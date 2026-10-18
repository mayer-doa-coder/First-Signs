"""Terms-gated, low-storage reader for the external TBscreen ZIP archive.

This module deliberately does not know how to download the complete archive.
It reads the ZIP directory through HTTP byte ranges, then one consented member at
a time. Raw audio lives only in a temporary file while a caller embeds it.
"""
from __future__ import annotations

import csv
import io
import os
import argparse
import json
import struct
import tempfile
import urllib.request
import zipfile
import zlib
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Iterable

TBSCREEN_URL = "https://dataset.cs.washington.edu/shwetak/TBscreen_Dataset.zip"
DEFAULT_CACHE_LIMIT = 1 * 1024 * 1024 * 1024


class TBscreenError(RuntimeError): pass


def require_terms_acknowledgement() -> None:
    if os.environ.get("TBSCREEN_DATA_TERMS_CONFIRMED") != "yes":
        raise TBscreenError("TBSCREEN_TERMS_NOT_CONFIRMED")


def cache_usage(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file()) if path.exists() else 0


def ensure_cache_capacity(path: Path, incoming_bytes: int, limit: int = DEFAULT_CACHE_LIMIT) -> None:
    path.mkdir(parents=True, exist_ok=True)
    if incoming_bytes < 0 or cache_usage(path) + incoming_bytes > limit:
        raise TBscreenError("TBSCREEN_CACHE_LIMIT_REACHED")


@dataclass(frozen=True)
class ZipMember:
    name: str
    compression: int
    compressed_size: int
    uncompressed_size: int
    local_offset: int


class RangeZipReader:
    """Minimal read-only ZIP reader supporting stored and deflated entries."""
    def __init__(self, url: str = TBSCREEN_URL, fetch_range: Callable[[int | None, int | None], bytes] | None = None):
        self.url = url
        self._fetcher = fetch_range or self._http_range
        self.members = self._read_directory()

    def _http_range(self, start: int | None, end: int | None) -> bytes:
        value = f"bytes={start}-{end}" if start is not None else f"bytes=-{end}"
        request = urllib.request.Request(self.url, headers={"Range": value, "User-Agent": "First-Signs-research/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                return response.read()
        except OSError as error:
            raise TBscreenError("TBSCREEN_RANGE_REQUEST_FAILED") from error

    def _read_directory(self) -> dict[str, ZipMember]:
        tail = self._fetcher(None, 131_072)
        index = tail.rfind(b"PK\x05\x06")
        if index < 0 or index + 22 > len(tail): raise TBscreenError("MALFORMED_REMOTE_ZIP")
        eocd = tail[index:index + 22]
        _, disk, start_disk, entries_disk, entries, directory_size, directory_offset, comment_length = struct.unpack("<4s4H2LH", eocd)
        if disk or start_disk or entries_disk != entries or index + 22 + comment_length > len(tail):
            raise TBscreenError("UNSUPPORTED_REMOTE_ZIP")
        # ZIP64 archives put sentinel values in EOCD and a ZIP64 locator before it.
        if directory_size == 0xFFFFFFFF or directory_offset == 0xFFFFFFFF:
            locator = tail.rfind(b"PK\x06\x07", 0, index)
            if locator < 0 or locator + 20 > len(tail): raise TBscreenError("MALFORMED_ZIP64")
            _, _, zip64_offset, _ = struct.unpack("<4sLQL", tail[locator:locator + 20])
            header = self._fetcher(zip64_offset, zip64_offset + 55)
            if header[:4] != b"PK\x06\x06" or len(header) < 56: raise TBscreenError("MALFORMED_ZIP64")
            _, _, _, _, _, _, entries, _, directory_size, directory_offset = struct.unpack("<4sQ2H2L4Q", header[:56])
        directory = self._fetcher(directory_offset, directory_offset + directory_size - 1)
        members: dict[str, ZipMember] = {}
        cursor = 0
        for _ in range(entries):
            if directory[cursor:cursor + 4] != b"PK\x01\x02" or cursor + 46 > len(directory): raise TBscreenError("MALFORMED_REMOTE_ZIP")
            fields = struct.unpack("<4s6H3L5H2L", directory[cursor:cursor + 46])
            compression, compressed, uncompressed, name_len, extra_len, comment_len, local_offset = fields[4], fields[8], fields[9], fields[10], fields[11], fields[12], fields[16]
            end = cursor + 46 + name_len + extra_len + comment_len
            if end > len(directory): raise TBscreenError("MALFORMED_REMOTE_ZIP")
            name = directory[cursor + 46:cursor + 46 + name_len].decode("utf-8", "replace")
            extra = directory[cursor + 46 + name_len:cursor + 46 + name_len + extra_len]
            if compressed == 0xFFFFFFFF or uncompressed == 0xFFFFFFFF or local_offset == 0xFFFFFFFF:
                values: list[int] = []
                pos = 0
                while pos + 4 <= len(extra):
                    tag, length = struct.unpack("<HH", extra[pos:pos + 4]); content = extra[pos + 4:pos + 4 + length]; pos += 4 + length
                    if tag == 1:
                        for offset in range(0, len(content), 8): values.append(struct.unpack("<Q", content[offset:offset + 8])[0])
                        break
                required = iter(values)
                if uncompressed == 0xFFFFFFFF: uncompressed = next(required)
                if compressed == 0xFFFFFFFF: compressed = next(required)
                if local_offset == 0xFFFFFFFF: local_offset = next(required)
            members[name] = ZipMember(name, compression, compressed, uncompressed, local_offset)
            cursor = end
        return members

    def names(self) -> Iterable[str]: return self.members.keys()

    def read(self, name: str, max_bytes: int = 64 * 1024 * 1024) -> bytes:
        member = self.members.get(name)
        if member is None: raise TBscreenError("ZIP_MEMBER_NOT_FOUND")
        if member.uncompressed_size > max_bytes: raise TBscreenError("ZIP_MEMBER_TOO_LARGE")
        header = self._fetcher(member.local_offset, member.local_offset + 29)
        if header[:4] != b"PK\x03\x04" or len(header) < 30: raise TBscreenError("MALFORMED_LOCAL_HEADER")
        _, _, _, _, _, _, _, _, _, name_len, extra_len = struct.unpack("<4s5H3L2H", header[:30])
        payload = self._fetcher(member.local_offset + 30 + name_len + extra_len, member.local_offset + 30 + name_len + extra_len + member.compressed_size - 1)
        if len(payload) != member.compressed_size: raise TBscreenError("INTERRUPTED_REMOTE_DOWNLOAD")
        if member.compression == 0: data = payload
        elif member.compression == 8: data = zlib.decompress(payload, -zlib.MAX_WBITS)
        else: raise TBscreenError("UNSUPPORTED_ZIP_COMPRESSION")
        if len(data) != member.uncompressed_size: raise TBscreenError("MALFORMED_REMOTE_ZIP")
        return data


def inspect_metadata(reader: RangeZipReader) -> dict[str, list[str]]:
    """Fetch only likely small CSV metadata; caller chooses a documented column map."""
    result: dict[str, list[str]] = {}
    for name in reader.names():
        lower = name.lower()
        if lower.endswith(".csv") and any(word in lower for word in ("metadata", "key", "forced")):
            try:
                rows = csv.DictReader(io.StringIO(reader.read(name, 16 * 1024 * 1024).decode("utf-8-sig", "replace")))
                result[name] = rows.fieldnames or []
            except (TBscreenError, csv.Error): continue
    return result


def with_transient_member(reader: RangeZipReader, member_name: str, cache_dir: Path, consume: Callable[[Path], object], limit: int = DEFAULT_CACHE_LIMIT) -> object:
    """Write one file only for decoding, always delete it even when embedding fails."""
    member = reader.members.get(member_name)
    if member is None: raise TBscreenError("ZIP_MEMBER_NOT_FOUND")
    ensure_cache_capacity(cache_dir, member.uncompressed_size, limit)
    handle = tempfile.NamedTemporaryFile(prefix="tbscreen-", suffix=Path(member_name).suffix, dir=cache_dir, delete=False)
    path = Path(handle.name)
    try:
        handle.write(reader.read(member_name, max_bytes=min(limit, member.uncompressed_size)))
        handle.close()
        return consume(path)
    finally:
        handle.close()
        path.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Inspect only small TBscreen ZIP metadata through HTTP ranges.")
    parser.add_argument("--url", default=TBSCREEN_URL)
    args = parser.parse_args()
    require_terms_acknowledgement()
    print(json.dumps(inspect_metadata(RangeZipReader(args.url)), indent=2))


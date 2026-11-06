"""Decrypt Melolo-style CENC AES-CTR progressive MP4 (sample-level)."""
from __future__ import annotations

import struct
from typing import List, Optional, Tuple

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


def _u32(buf: bytes, off: int) -> int:
    return struct.unpack_from(">I", buf, off)[0]


def _u64(buf: bytes, off: int) -> int:
    return struct.unpack_from(">Q", buf, off)[0]


def _tag(buf: bytes, off: int) -> str:
    return buf[off : off + 4].decode("latin1")


def _iter_boxes(buf: bytes, start: int, end: int):
    off = start
    while off + 8 <= end:
        size = _u32(buf, off)
        if size < 8 or off + size > end:
            break
        yield off, size, _tag(buf, off + 4), off + 8
        off += size


def _find(buf: bytes, start: int, end: int, tag: str):
    for o, sz, t, bo in _iter_boxes(buf, start, end):
        if t == tag:
            return o, sz, bo
    return None


def _walk(buf: bytes, start: int, end: int, *tags: str):
    cs, ce = start, end
    found = None
    for tag in tags:
        found = None
        for o, sz, t, bo in _iter_boxes(buf, cs, ce):
            if t == tag:
                found = (o, sz, bo)
                cs, ce = bo, o + sz
                break
        if not found:
            return None
    return found


def _parse_sample_table(buf: bytes, stbl_start: int, stbl_end: int) -> Optional[dict]:
    stsz = _find(buf, stbl_start, stbl_end, "stsz")
    stsc = _find(buf, stbl_start, stbl_end, "stsc")
    stco = _find(buf, stbl_start, stbl_end, "stco")
    co64 = _find(buf, stbl_start, stbl_end, "co64")
    senc = _find(buf, stbl_start, stbl_end, "senc")
    if not stsz or not stsc or (not stco and not co64) or not senc:
        return None

    default_sz = _u32(buf, stsz[2] + 4)
    n = _u32(buf, stsz[2] + 8)
    if default_sz == 0:
        sizes = [_u32(buf, stsz[2] + 12 + i * 4) for i in range(n)]
    else:
        sizes = [default_sz] * n

    if stco:
        cnt = _u32(buf, stco[2] + 4)
        chunk_offs = [_u32(buf, stco[2] + 8 + i * 4) for i in range(cnt)]
    else:
        cnt = _u32(buf, co64[2] + 4)
        chunk_offs = [_u64(buf, co64[2] + 8 + i * 8) for i in range(cnt)]

    ne = _u32(buf, stsc[2] + 4)
    entries = []
    for i in range(ne):
        entries.append(
            (
                _u32(buf, stsc[2] + 8 + i * 12),
                _u32(buf, stsc[2] + 12 + i * 12),
            )
        )

    sample_offs: List[int] = []
    si = 0
    for ci, chunk_off in enumerate(chunk_offs):
        if si >= n:
            break
        spc = 1
        for first_chunk, samples_per_chunk in entries:
            if ci + 1 >= first_chunk:
                spc = samples_per_chunk
            else:
                break
        cur = chunk_off
        for _ in range(spc):
            if si >= n:
                break
            sample_offs.append(cur)
            cur += sizes[si]
            si += 1

    flags = (buf[senc[2] + 1] << 16) | (buf[senc[2] + 2] << 8) | buf[senc[2] + 3]
    cnt = _u32(buf, senc[2] + 4)
    off = senc[2] + 8
    ivs: List[bytes] = []
    # Per-sample subsample ranges (clear_bytes, encrypted_bytes); None = full-sample encrypt
    subsamples: List[Optional[List[Tuple[int, int]]]] = []
    for _ in range(cnt):
        ivs.append(buf[off : off + 8])
        off += 8
        if flags & 0x02:
            sub_count = (buf[off] << 8) | buf[off + 1]
            off += 2
            ranges: List[Tuple[int, int]] = []
            for _s in range(sub_count):
                clear_b = (buf[off] << 8) | buf[off + 1]
                enc_b = _u32(buf, off + 2)
                off += 6
                ranges.append((clear_b, enc_b))
            subsamples.append(ranges)
        else:
            subsamples.append(None)

    return {"sample_offs": sample_offs, "sizes": sizes, "ivs": ivs, "subsamples": subsamples}


def _parse_tracks(buf: bytes, moov: Tuple[int, int, int]) -> List[dict]:
    tracks = []
    for o, sz, t, bo in _iter_boxes(buf, moov[2], moov[0] + moov[1]):
        if t != "trak":
            continue
        mdia = _walk(buf, bo, o + sz, "mdia")
        if not mdia:
            continue
        hdlr = _walk(buf, mdia[2], mdia[0] + mdia[1], "hdlr")
        if not hdlr:
            continue
        handler = _tag(buf, hdlr[0] + 16)
        if handler not in ("vide", "soun"):
            continue
        stbl = _walk(buf, mdia[2], mdia[0] + mdia[1], "minf", "stbl")
        if not stbl:
            continue
        track = _parse_sample_table(buf, stbl[2], stbl[0] + stbl[1])
        if track and track["ivs"]:
            tracks.append(track)
    return tracks


def _aes_ctr_decrypt(key: bytes, iv8: bytes, data: bytes) -> bytes:
    counter = iv8 + (b"\x00" * 8)
    encryptor = Cipher(algorithms.AES(key), modes.CTR(counter)).encryptor()
    # CTR encrypt == decrypt
    return encryptor.update(data) + encryptor.finalize()


def _aes_ctr_decrypt_sample(
    key: bytes,
    iv8: bytes,
    sample: bytes,
    subsamples: Optional[List[Tuple[int, int]]],
) -> bytes:
    """Decrypt one CENC sample; honor subsample clear/encrypted ranges when present.

    Full-sample AES-CTR on subsample-encrypted AAC/HEVC corrupts clear headers and
    yields silent or broken audio after ffmpeg — a common Melolo pattern.
    """
    if not subsamples:
        return _aes_ctr_decrypt(key, iv8, sample)

    counter = iv8 + (b"\x00" * 8)
    encryptor = Cipher(algorithms.AES(key), modes.CTR(counter)).encryptor()
    out = bytearray(len(sample))
    pos = 0
    for clear_b, enc_b in subsamples:
        if clear_b > 0:
            end = min(pos + clear_b, len(sample))
            out[pos:end] = sample[pos:end]
            pos = end
        if enc_b > 0:
            end = min(pos + enc_b, len(sample))
            out[pos:end] = encryptor.update(sample[pos:end])
            pos = end
    if pos < len(sample):
        out[pos:] = sample[pos:]
    encryptor.finalize()
    return bytes(out)


def _neutralize_drm(buf: bytearray, moov_start: int, moov_end: int) -> None:
    rename = {
        b"encv": b"hvc1",
        b"enca": b"mp4a",
        b"sinf": b"free",
        b"schm": b"free",
        b"schi": b"free",
        b"senc": b"free",
        b"saio": b"free",
        b"saiz": b"free",
        b"tenc": b"free",
        b"frma": b"free",
        b"pssh": b"free",
    }
    i = moov_start + 4
    while i + 4 <= moov_end:
        tag = bytes(buf[i : i + 4])
        if tag in rename:
            sz = _u32(buf, i - 4)
            if 8 <= sz <= moov_end - i + 4:
                buf[i : i + 4] = rename[tag]
        i += 1
    off = 0
    length = len(buf)
    while off + 8 <= length:
        sz = _u32(buf, off)
        if sz < 8 or off + sz > length:
            break
        if bytes(buf[off + 4 : off + 8]) == b"pssh":
            buf[off + 4 : off + 8] = b"free"
        off += sz


def decrypt_cenc_mp4(data: bytes, key_hex: str) -> bytes:
    """Return a clear (still HEVC) MP4 buffer decrypted with the given 32-hex AES key."""
    key_hex = (key_hex or "").strip().lower()
    if len(key_hex) != 32:
        raise ValueError("drm key must be 32 hex chars")
    key = bytes.fromhex(key_hex)

    moov = _walk(data, 0, len(data), "moov")
    if not moov:
        raise ValueError("No moov box")
    tracks = _parse_tracks(data, moov)
    if not tracks:
        raise ValueError("No encrypted tracks")

    out = bytearray(data)
    for track in tracks:
        count = min(len(track["sample_offs"]), len(track["ivs"]))
        subs = track.get("subsamples") or []
        for i in range(count):
            off = track["sample_offs"][i]
            sz = track["sizes"][i]
            sample = bytes(out[off : off + sz])
            sub = subs[i] if i < len(subs) else None
            dec = _aes_ctr_decrypt_sample(key, track["ivs"][i], sample, sub)
            out[off : off + sz] = dec

    _neutralize_drm(out, moov[0], moov[0] + moov[1])
    return bytes(out)

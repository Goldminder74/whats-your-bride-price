import { SILENT_AAC_CONFIG, SILENT_AAC_FRAME_SAMPLES, SILENT_AAC_SAMPLE_RATE, silentAacFrames } from "./silentAac.ts";

export type AvcSample = { data: Uint8Array; key: boolean };

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function text(value: string): Uint8Array {
  return Uint8Array.from([...value].map((char) => char.charCodeAt(0)));
}

function u8(value: number): Uint8Array {
  return Uint8Array.of(value & 255);
}

function u16(value: number): Uint8Array {
  return Uint8Array.of((value >> 8) & 255, value & 255);
}

function u32(value: number): Uint8Array {
  return Uint8Array.of((value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255);
}

function box(type: string, payload: Uint8Array): Uint8Array {
  return concat([u32(8 + payload.length), text(type), payload]);
}

function fullBox(type: string, version: number, flags: number, payload: Uint8Array): Uint8Array {
  return box(type, concat([Uint8Array.of(version, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255), payload]));
}

function zeros(length: number): Uint8Array {
  return new Uint8Array(length);
}

function matrix(): Uint8Array {
  return concat([
    u32(0x00010000), zeros(4), zeros(4),
    zeros(4), u32(0x00010000), zeros(4),
    zeros(4), zeros(4), u32(0x40000000),
  ]);
}

export function muxResultMp4(input: {
  width: number;
  height: number;
  fps: number;
  samples: AvcSample[];
  avcC: Uint8Array;
  seconds: number;
}): Uint8Array {
  const audio = silentAacFrames(input.seconds);
  const videoScale = input.fps * 1000;
  const videoDelta = 1000;
  const videoDuration = input.samples.length * videoDelta;
  const audioDuration = audio.length * SILENT_AAC_FRAME_SAMPLES;
  const movieScale = 1000;
  const movieDuration = input.seconds * movieScale;

  const ftyp = box("ftyp", concat([text("isom"), u32(0), text("isom"), text("iso2"), text("avc1"), text("mp41")]));
  const videoBytes = input.samples.reduce((sum, sample) => sum + sample.data.length, 0);
  const audioBytes = audio.reduce((sum, frame) => sum + frame.length, 0);
  const mdat = box("mdat", concat([...input.samples.map((sample) => sample.data), ...audio]));
  const mdatData = ftyp.length + 8;

  const avc1 = box("avc1", concat([
    zeros(6), u16(1),
    u16(0), u16(0), text("Anton"), u32(0), u32(0),
    u16(input.width), u16(input.height),
    u32(0x00480000), u32(0x00480000),
    u32(0), u16(1),
    zeros(32),
    u16(0x0018), u16(0xffff),
    box("avcC", input.avcC),
  ]));
  const videoStbl = box("stbl", concat([
    box("stsd", concat([u32(0), u32(1), avc1])),
    fullBox("stts", 0, 0, concat([u32(1), u32(input.samples.length), u32(videoDelta)])),
    fullBox("stsc", 0, 0, concat([u32(1), u32(1), u32(input.samples.length), u32(1)])),
    fullBox("stsz", 0, 0, concat([u32(0), u32(input.samples.length), ...input.samples.map((sample) => u32(sample.data.length))])),
    fullBox("stco", 0, 0, concat([u32(1), u32(mdatData)])),
  ]));
  const videoTrak = box("trak", concat([
    fullBox("tkhd", 0, 7, concat([
      u32(0), u32(0), u32(1), u32(0), u32(movieDuration),
      zeros(8), u16(0), u16(0), u16(0), u16(0),
      matrix(), u32(input.width << 16), u32(input.height << 16),
    ])),
    box("mdia", concat([
      fullBox("mdhd", 0, 0, concat([u32(0), u32(0), u32(videoScale), u32(videoDuration), u16(0x55c4), u16(0)])),
      fullBox("hdlr", 0, 0, concat([u32(0), text("vide"), zeros(12), text("VideoHandler"), u8(0)])),
      box("minf", concat([
        fullBox("vmhd", 0, 1, concat([u16(0), u16(0), u16(0), u16(0)])),
        box("dinf", box("dref", concat([u32(0), u32(1), fullBox("url ", 0, 1, new Uint8Array())]))),
        videoStbl,
      ])),
    ])),
  ]));

  const esds = box("esds", concat([
    u32(0),
    u8(0x03), u8(0x19), u16(1), u8(0),
    u8(0x04), u8(0x11), u8(0x40), u8(0x15), zeros(3), zeros(4), u32(0), u32(0),
    u8(0x05), u8(SILENT_AAC_CONFIG.length), SILENT_AAC_CONFIG,
    u8(0x06), u8(0x01), u8(0x02),
  ]));
  const mp4a = box("mp4a", concat([
    zeros(6), u16(1),
    u16(0), u16(0), u32(0), u16(1), u16(16),
    u32(0), u16(SILENT_AAC_SAMPLE_RATE), u16(0),
    esds,
  ]));
  const audioStbl = box("stbl", concat([
    box("stsd", concat([u32(0), u32(1), mp4a])),
    fullBox("stts", 0, 0, concat([u32(1), u32(audio.length), u32(SILENT_AAC_FRAME_SAMPLES)])),
    fullBox("stsc", 0, 0, concat([u32(1), u32(1), u32(audio.length), u32(1)])),
    fullBox("stsz", 0, 0, concat([u32(audio[0]?.length ?? 0), u32(audio.length)])),
    fullBox("stco", 0, 0, concat([u32(1), u32(mdatData + videoBytes)])),
  ]));
  const audioTrak = box("trak", concat([
    fullBox("tkhd", 0, 7, concat([
      u32(0), u32(0), u32(2), u32(0), u32(movieDuration),
      zeros(8), u16(0), u16(1), u16(0x0100), u16(0),
      matrix(), u32(0), u32(0),
    ])),
    box("mdia", concat([
      fullBox("mdhd", 0, 0, concat([u32(0), u32(0), u32(SILENT_AAC_SAMPLE_RATE), u32(audioDuration), u16(0x55c4), u16(0)])),
      fullBox("hdlr", 0, 0, concat([u32(0), text("soun"), zeros(12), text("SoundHandler"), u8(0)])),
      box("minf", concat([
        fullBox("smhd", 0, 0, concat([u16(0), u16(0)])),
        box("dinf", box("dref", concat([u32(0), u32(1), fullBox("url ", 0, 1, new Uint8Array())]))),
        audioStbl,
      ])),
    ])),
  ]));

  const moov = box("moov", concat([
    fullBox("mvhd", 0, 0, concat([
      u32(0), u32(0), u32(movieScale), u32(movieDuration),
      u32(0x00010000), u16(0x0100), u16(0), zeros(8),
      matrix(), zeros(24), u32(3),
    ])),
    videoTrak,
    audioTrak,
  ]));
  if (videoBytes + audioBytes !== mdat.length - 8) throw new Error("mdat_size");
  return concat([ftyp, mdat, moov]);
}

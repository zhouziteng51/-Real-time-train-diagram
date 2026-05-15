import type { Direction, NormalizedImportDocument } from "@metro-ops/shared";
import { inflateRawSync } from "node:zlib";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import type { ParserContext, SourceParser } from "./types.js";

type RawBlock = NormalizedImportDocument["rawBlocks"][number];
type TrainDoc = NormalizedImportDocument["trains"][number];
type StationDoc = TrainDoc["stations"][number];
type CirculationSegment =
  NormalizedImportDocument["circulationSegments"][number];

interface ParsedRow {
  index: number;
  page: number | undefined;
  blockType: RawBlock["blockType"];
  text: string;
  cells: string[];
}

interface PdfTextPoint {
  str: string;
  x: number;
  y: number;
}

interface PdfTextItemLike {
  str: string;
  transform: number[];
}

interface PdfTextRow {
  y: number;
  points: PdfTextPoint[];
  text: string;
}

interface PdfTrainColumn {
  trainNo: string;
  x: number;
  direction?: Direction | undefined;
  matchDistance: number;
}

interface StationAnchor {
  stationName: string;
  y: number;
}

interface TrainHeaderColumn {
  trainNo: string;
  cellIndex: number;
  direction: Direction | undefined;
}

interface ZipEntry {
  name: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const TRAIN_NO_PATTERN = /^\d{5}$/;
const TRAIN_NO_GLOBAL_PATTERN = /(^|[^\d:])(\d{5})(?![\d:])/g;
const TIME_PATTERN = /^(?:[0-2]?\d):[0-5]\d(?::[0-5]\d)?$/;
const TIME_GLOBAL_PATTERN = /(?:[0-2]?\d)[:：][0-5]\d(?:[:：][0-5]\d)?/g;
const PDF_ROW_Y_TOLERANCE = 2.5;
const MAX_STRUCTURE_WARNINGS = 12;

const KNOWN_STATION_ORDER = [
  "徐州东站",
  "大湖站",
  "赵武站",
  "博览中心站",
  "奥体中心站",
  "一中南站",
  "市行政中心站",
  "丽水路站",
  "迎宾大道站",
  "市中医院站",
  "塘坊站",
  "检测园站",
  "驿城站",
  "高家营站",
  "玉泉河站",
  "铜山中医院站",
] as const;

const KNOWN_STATION_NAMES = [
  ...KNOWN_STATION_ORDER,
  "高铁站停车场",
  "汪庄车辆段",
] as const;

export async function normalizeSemiStructuredBlocks(
  rawBlocks: RawBlock[],
  parserName: string,
  ctx: ParserContext,
  sourceType: "PDF" | "DOCX",
): Promise<NormalizedImportDocument> {
  const scheduleVersionName = detectScheduleVersionName(
    ctx.fileName,
    sourceType,
  );
  const rows = buildParsedRows(rawBlocks);
  const trainMap = new Map<string, TrainDoc>();

  extractTrainsFromTableRows(rows, trainMap, scheduleVersionName);
  extractTrainsFromTextRows(rows, trainMap, scheduleVersionName);

  const trains = finalizeTrains(Array.from(trainMap.values()));
  const circulationSegments = buildCirculationSegments(
    trains,
    scheduleVersionName,
  );
  const warnings = collectStructureWarnings(rows, trains, circulationSegments);

  return {
    meta: {
      sourceType,
      parserName,
      fileName: ctx.fileName,
      extractedAt: new Date().toISOString(),
      confidence: { trains: 0, segments: 0, duties: 0 },
      scheduleVersionName,
    },
    trains,
    circulationSegments,
    dutyAssignments: [],
    warnings,
    rawBlocks,
  };
}

export class DocxOcrHybridParser implements SourceParser {
  readonly name = "docx-text-parser";
  readonly sourceType = "DOCX" as const;

  async extract(
    buffer: Buffer,
    ctx: ParserContext,
  ): Promise<NormalizedImportDocument> {
    const rawBlocks = extractDocxRawBlocks(buffer);
    return normalizeSemiStructuredBlocks(rawBlocks, this.name, ctx, "DOCX");
  }
}

export class PdfOcrHybridParser implements SourceParser {
  readonly name = "pdf-text-parser";
  readonly sourceType = "PDF" as const;

  async extract(
    buffer: Buffer,
    ctx: ParserContext,
  ): Promise<NormalizedImportDocument> {
    const warnings: string[] = [];
    const coordinateTrainMap = new Map<string, TrainDoc>();
    const rawBlocks: RawBlock[] = [];
    const pdf = await pdfjs.getDocument({
      data: new Uint8Array(buffer),
      useWorkerFetch: false,
    }).promise;

    for (let pageIndex = 1; pageIndex <= pdf.numPages; pageIndex += 1) {
      const page = await pdf.getPage(pageIndex);
      const textContent = await page.getTextContent();
      const points: PdfTextPoint[] = [];
      for (const candidate of textContent.items) {
        if (!isTextItem(candidate)) continue;
        const point = {
          str: normalizeExtractedText(candidate.str),
          x: candidate.transform[4],
          y: candidate.transform[5],
        };
        if (point.str.length > 0) points.push(point);
      }

      if (points.length === 0) {
        warnings.push(`document:page-${pageIndex}:no-readable-text-layer`);
        continue;
      }

      const rows = groupPdfTextRows(points);
      for (const row of rows) {
        if (row.text.length === 0) continue;
        rawBlocks.push({
          page: pageIndex,
          blockType: "PARAGRAPH",
          text: row.text,
        });
      }

      const columns = extractTrainColumns(points);
      const stationAnchors = extractStationAnchors(points);
      const hasScheduleSignals =
        columns.length > 0 ||
        stationAnchors.length > 0 ||
        points.some((point) => extractTimesFromText(point.str).length > 0);

      if (!hasScheduleSignals) continue;
      if (columns.length === 0 || stationAnchors.length === 0) {
        warnings.push(`train:page-${pageIndex}:unable-to-align-train-columns`);
        continue;
      }

      for (const column of columns) {
        const stations = extractStationTimesForColumn(
          points,
          stationAnchors,
          column,
          columns,
        );
        const train = ensureTrain(
          coordinateTrainMap,
          column.trainNo,
          detectScheduleVersionName(ctx.fileName, "PDF"),
          column.direction,
        );
        if (stations.length === 0) {
          warnings.push(
            `train:${column.trainNo}:page-${pageIndex}:no-station-times-detected`,
          );
          continue;
        }
        mergeStations(train.stations, stations);
      }
    }

    const normalized = await normalizeSemiStructuredBlocks(
      rawBlocks,
      this.name,
      ctx,
      "PDF",
    );
    const scheduleVersionName =
      normalized.meta.scheduleVersionName ??
      detectScheduleVersionName(ctx.fileName, "PDF");
    const trains = mergeTrainCollections(
      normalized.trains,
      Array.from(coordinateTrainMap.values()),
    );
    const circulationSegments = buildCirculationSegments(
      trains,
      scheduleVersionName,
    );
    const finalWarnings = uniqueStrings([
      ...warnings,
      ...normalized.warnings.filter(
        (warning) =>
          !warning.startsWith("train:") && !warning.startsWith("segment:"),
      ),
      ...collectStructureWarnings(
        buildParsedRows(rawBlocks),
        trains,
        circulationSegments,
      ),
    ]);

    return {
      ...normalized,
      trains,
      circulationSegments,
      warnings: finalWarnings,
    };
  }
}

function extractDocxRawBlocks(buffer: Buffer): RawBlock[] {
  const documentXml = readZipText(buffer, "word/document.xml");
  if (!documentXml) {
    throw new Error("docx: unsupported or corrupt OOXML document");
  }

  const rawBlocks: RawBlock[] = [];
  const body =
    documentXml.match(/<w:body\b[\s\S]*?<\/w:body>/)?.[0] ?? documentXml;
  const blockPattern = /<w:(p|tbl)\b[\s\S]*?<\/w:\1>/g;
  let match: RegExpExecArray | null;

  while ((match = blockPattern.exec(body)) !== null) {
    const xml = match[0];
    const kind = match[1];
    if (kind === "tbl") {
      for (const row of extractDocxTableRows(xml)) {
        if (row.some((cell) => cell.length > 0)) {
          rawBlocks.push({ blockType: "TABLE", text: row.join(" | ") });
        }
      }
      continue;
    }

    const text = extractDocxText(xml);
    if (text) rawBlocks.push({ blockType: "PARAGRAPH", text });
  }

  if (rawBlocks.length === 0) {
    const fallbackText = extractDocxText(documentXml);
    if (fallbackText)
      rawBlocks.push({ blockType: "PARAGRAPH", text: fallbackText });
  }

  return rawBlocks;
}

function extractDocxTableRows(tableXml: string): string[][] {
  const rows: string[][] = [];
  const rowPattern = /<w:tr\b[\s\S]*?<\/w:tr>/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowPattern.exec(tableXml)) !== null) {
    const cells: string[] = [];
    const cellPattern = /<w:tc\b[\s\S]*?<\/w:tc>/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellPattern.exec(rowMatch[0])) !== null) {
      cells.push(extractDocxText(cellMatch[0]));
    }
    if (cells.length > 0) rows.push(trimTrailingEmptyCells(cells));
  }

  return rows;
}

function extractDocxText(xml: string): string {
  const withBreaks = xml.replace(/<\/w:p>/g, "\n");
  const parts: string[] = [];
  const textPattern =
    /<w:t\b[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:(?:br|cr)\b[^>]*\/>/g;
  let match: RegExpExecArray | null;

  while ((match = textPattern.exec(withBreaks)) !== null) {
    if (match[0].startsWith("<w:tab")) {
      parts.push("\t");
    } else if (/^<w:(?:br|cr)\b/.test(match[0])) {
      parts.push("\n");
    } else {
      parts.push(decodeXml(match[1] ?? ""));
    }
  }

  return normalizeExtractedText(parts.join(""));
}

function readZipText(buffer: Buffer, entryName: string): string | undefined {
  const entry = readZipEntries(buffer).find(
    (candidate) => candidate.name === entryName,
  );
  if (!entry) return undefined;

  const localHeaderOffset = entry.localHeaderOffset;
  if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) return undefined;
  const fileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
  const extraLength = buffer.readUInt16LE(localHeaderOffset + 28);
  const dataStart = localHeaderOffset + 30 + fileNameLength + extraLength;
  const data = buffer.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return data.toString("utf8");
  if (entry.compressionMethod === 8)
    return inflateRawSync(data).toString("utf8");
  throw new Error(
    `docx: unsupported zip compression method ${entry.compressionMethod}`,
  );
}

function readZipEntries(buffer: Buffer): ZipEntry[] {
  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) return [];

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) break;
    const flags = buffer.readUInt16LE(offset + 8);
    const compressionMethod = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localHeaderOffset = buffer.readUInt32LE(offset + 42);
    const nameBuffer = buffer.subarray(
      offset + 46,
      offset + 46 + fileNameLength,
    );
    const name =
      (flags & 0x800) !== 0
        ? nameBuffer.toString("utf8")
        : nameBuffer.toString("latin1");

    entries.push({
      name,
      compressionMethod,
      compressedSize,
      localHeaderOffset,
    });

    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function findEndOfCentralDirectory(buffer: Buffer): number {
  const minOffset = Math.max(0, buffer.length - 0xffff - 22);
  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  return -1;
}

function buildParsedRows(rawBlocks: RawBlock[]): ParsedRow[] {
  const rows: ParsedRow[] = [];

  for (const block of rawBlocks) {
    for (const line of block.text.split(/\r?\n/)) {
      const text = normalizeExtractedText(line);
      if (!text) continue;
      rows.push({
        index: rows.length,
        page: block.page,
        blockType: block.blockType,
        text,
        cells: splitCells(text),
      });
    }
  }

  return rows;
}

function splitCells(text: string): string[] {
  const separator = text.includes("|")
    ? /\s*\|\s*/
    : text.includes("\t")
      ? /\t+/
      : /\s{2,}/;
  const parts = text
    .split(separator)
    .map((cell) => normalizeExtractedText(cell));
  if (parts.length > 1) return trimTrailingEmptyCells(parts);

  const looseParts = text
    .split(/\s+/)
    .map((cell) => normalizeExtractedText(cell));
  return looseParts.length > 1 ? looseParts : [text];
}

function extractTrainsFromTableRows(
  rows: ParsedRow[],
  trainMap: Map<string, TrainDoc>,
  scheduleVersionName: string,
): void {
  let headerColumns: TrainHeaderColumn[] = [];

  for (const row of rows) {
    const nextHeader = extractHeaderColumns(row);
    if (nextHeader.length > 0) {
      headerColumns = nextHeader;
      for (const header of headerColumns) {
        ensureTrain(
          trainMap,
          header.trainNo,
          scheduleVersionName,
          header.direction,
        );
      }
      continue;
    }

    if (headerColumns.length === 0) continue;
    const stationName = findStationName(row.text);
    if (!stationName) continue;

    for (let i = 0; i < headerColumns.length; i += 1) {
      const header = headerColumns[i];
      if (!header) continue;
      const nextDistinctColumnIndex =
        headerColumns[i + 1]?.cellIndex ?? row.cells.length;
      const start = Math.min(header.cellIndex, row.cells.length - 1);
      const end = Math.max(start + 1, nextDistinctColumnIndex);
      const cellText = row.cells.slice(start, end).join(" ");
      const times = extractTimesFromText(cellText);
      if (times.length === 0) continue;

      const train = ensureTrain(
        trainMap,
        header.trainNo,
        scheduleVersionName,
        header.direction,
      );
      addStationToTrain(train, stationName, times);
    }
  }
}

function extractHeaderColumns(row: ParsedRow): TrainHeaderColumn[] {
  const stationName = findStationName(row.text);
  const times = extractTimesFromText(row.text);
  const hasHeaderLabel = /车次|列车|车号|车组|运行图/i.test(row.text);
  const rawColumns: TrainHeaderColumn[] = [];

  for (let cellIndex = 0; cellIndex < row.cells.length; cellIndex += 1) {
    const cell = row.cells[cellIndex] ?? "";
    if (extractTimesFromText(cell).length > 0) continue;
    for (const trainNo of extractTrainNos(cell)) {
      rawColumns.push({
        trainNo,
        cellIndex,
        direction: parseDirection(row.text),
      });
    }
  }

  if (rawColumns.length === 0) return [];
  if (stationName && times.length > 0) return [];
  if (rawColumns.length < 2 && !hasHeaderLabel) return [];
  if (row.blockType !== "TABLE" && rawColumns.length < 2 && !hasHeaderLabel)
    return [];

  const compacted: TrainHeaderColumn[] = [];
  for (const column of rawColumns.sort((a, b) => a.cellIndex - b.cellIndex)) {
    if (compacted.some((existing) => existing.trainNo === column.trainNo))
      continue;
    compacted.push(column);
  }

  return compacted;
}

function extractTrainsFromTextRows(
  rows: ParsedRow[],
  trainMap: Map<string, TrainDoc>,
  scheduleVersionName: string,
): void {
  let currentTrainNo: string | undefined;
  let currentDirection: Direction | undefined;

  for (const row of rows) {
    const trainNos = extractTrainNos(row.text);
    const stationNames = findStationNames(row.text);
    const times = extractTimesFromText(row.text);
    const direction = parseDirection(row.text) ?? currentDirection;

    if (direction) currentDirection = direction;

    if (trainNos.length > 0) {
      for (const trainNo of trainNos) {
        ensureTrain(trainMap, trainNo, scheduleVersionName, direction);
      }
    }

    if (
      trainNos.length === 1 &&
      (stationNames.length === 0 || /车次|列车|车号/.test(row.text))
    ) {
      currentTrainNo = trainNos[0];
    }

    const targetTrainNos =
      trainNos.length === 1
        ? trainNos
        : trainNos.length === 0 && currentTrainNo
          ? [currentTrainNo]
          : [];

    if (
      targetTrainNos.length === 0 ||
      stationNames.length === 0 ||
      times.length === 0
    )
      continue;

    if (stationNames.length >= 2 && times.length >= 2) {
      const firstStationName = stationNames[0];
      const lastStationName = stationNames[stationNames.length - 1];
      const firstTime = times[0];
      const lastTime = times[times.length - 1];
      if (!firstStationName || !lastStationName || !firstTime || !lastTime)
        continue;
      for (const trainNo of targetTrainNos) {
        const train = ensureTrain(
          trainMap,
          trainNo,
          scheduleVersionName,
          direction,
        );
        addStationToTrain(train, firstStationName, [firstTime]);
        addStationToTrain(train, lastStationName, [lastTime]);
      }
      continue;
    }

    const stationName = stationNames[0];
    if (!stationName) continue;
    for (const trainNo of targetTrainNos) {
      const train = ensureTrain(
        trainMap,
        trainNo,
        scheduleVersionName,
        direction,
      );
      addStationToTrain(train, stationName, times);
    }
  }
}

function ensureTrain(
  trainMap: Map<string, TrainDoc>,
  trainNo: string,
  scheduleVersionName: string,
  direction?: Direction,
): TrainDoc {
  const normalizedTrainNo = normalizeTrainNo(trainNo);
  const existing = trainMap.get(normalizedTrainNo);
  if (existing) {
    if (!existing.direction && direction) existing.direction = direction;
    if (!existing.routeId) existing.routeId = scheduleVersionName;
    return existing;
  }

  const train: TrainDoc = {
    trainNo: normalizedTrainNo,
    routeId: scheduleVersionName,
    stations: [],
    ...(direction ? { direction } : {}),
  };
  trainMap.set(normalizedTrainNo, train);
  return train;
}

function addStationToTrain(
  train: TrainDoc,
  stationName: string,
  times: string[],
): void {
  const normalizedTimes = uniqueStrings(
    times.map(normalizeTime).filter(isDefined),
  );
  if (normalizedTimes.length === 0) return;
  const orderedTimes = normalizedTimes.slice().sort(compareClockTime);
  const station: StationDoc = {
    stationName,
    order: stationOrder(stationName),
    arrivalTime: orderedTimes[0],
    departureTime: orderedTimes[1] ?? orderedTimes[0],
  };
  mergeStations(train.stations, [station]);
}

function finalizeTrains(trains: TrainDoc[]): TrainDoc[] {
  return trains
    .map((train) => {
      const stations = dedupeAndSortStations(train.stations);
      return {
        ...train,
        direction: train.direction ?? inferDirectionFromStations(stations),
        stations,
      };
    })
    .sort((a, b) => a.trainNo.localeCompare(b.trainNo));
}

function mergeTrainCollections(
  base: TrainDoc[],
  incoming: TrainDoc[],
): TrainDoc[] {
  const trainMap = new Map<string, TrainDoc>();

  for (const train of [...base, ...incoming]) {
    const existing = trainMap.get(train.trainNo);
    if (!existing) {
      trainMap.set(train.trainNo, {
        ...train,
        stations: train.stations.map((station) => ({ ...station })),
      });
      continue;
    }

    existing.direction = existing.direction ?? train.direction;
    existing.routeId = existing.routeId ?? train.routeId;
    mergeStations(existing.stations, train.stations);
  }

  return finalizeTrains(Array.from(trainMap.values()));
}

function buildCirculationSegments(
  trains: TrainDoc[],
  scheduleVersionName: string,
): CirculationSegment[] {
  const segmentMap = new Map<string, CirculationSegment>();

  for (const train of trains) {
    if (train.stations.length < 2) continue;
    const firstStation = train.stations[0];
    const lastStation = train.stations[train.stations.length - 1];
    if (!firstStation || !lastStation) continue;

    const routeId = train.routeId ?? scheduleVersionName;
    const direction =
      train.direction ?? inferDirectionFromStations(train.stations);
    const key = JSON.stringify([
      routeId,
      firstStation.stationName,
      lastStation.stationName,
      direction ?? "",
    ]);
    const startTime = firstStation.departureTime ?? firstStation.arrivalTime;
    const endTime = lastStation.arrivalTime ?? lastStation.departureTime;
    const existing = segmentMap.get(key);

    if (!existing) {
      segmentMap.set(key, {
        routeId,
        fromStationName: firstStation.stationName,
        toStationName: lastStation.stationName,
        direction,
        startTime,
        endTime,
        linkedTrainNos: [train.trainNo],
      });
      continue;
    }

    existing.startTime = earlierTime(existing.startTime, startTime);
    existing.endTime = laterTime(existing.endTime, endTime);
    if (!existing.linkedTrainNos.includes(train.trainNo))
      existing.linkedTrainNos.push(train.trainNo);
  }

  return Array.from(segmentMap.values()).sort(
    (a, b) =>
      (a.startTime ?? "").localeCompare(b.startTime ?? "") ||
      a.fromStationName.localeCompare(b.fromStationName) ||
      a.toStationName.localeCompare(b.toStationName),
  );
}

function collectStructureWarnings(
  rows: ParsedRow[],
  trains: TrainDoc[],
  circulationSegments: CirculationSegment[],
): string[] {
  const warnings: string[] = [];

  if (rows.length === 0) warnings.push("document:no-readable-text-extracted");
  if (trains.length === 0) {
    warnings.push("train:no-train-nos-detected");
  } else {
    const stationlessTrains = trains.filter(
      (train) => train.stations.length === 0,
    );
    for (const train of stationlessTrains.slice(0, MAX_STRUCTURE_WARNINGS)) {
      warnings.push(`train:${train.trainNo}:no-station-times-detected`);
    }
    if (stationlessTrains.length > MAX_STRUCTURE_WARNINGS) {
      warnings.push(
        `train:${stationlessTrains.length - MAX_STRUCTURE_WARNINGS}-more:no-station-times-detected`,
      );
    }
  }

  if (trains.length > 0 && circulationSegments.length === 0) {
    warnings.push("segment:no-station-to-station-segments-detected");
  }

  return uniqueStrings(warnings);
}

function isTextItem(item: unknown): item is PdfTextItemLike {
  return (
    typeof item === "object" &&
    item !== null &&
    "str" in item &&
    "transform" in item &&
    Array.isArray((item as { transform?: unknown }).transform)
  );
}

function groupPdfTextRows(points: PdfTextPoint[]): PdfTextRow[] {
  const rows: PdfTextPoint[][] = [];
  const sorted = points.slice().sort((a, b) => b.y - a.y || a.x - b.x);

  for (const point of sorted) {
    const row = rows.find(
      (candidate) =>
        Math.abs(averageY(candidate) - point.y) <= PDF_ROW_Y_TOLERANCE,
    );
    if (row) {
      row.push(point);
    } else {
      rows.push([point]);
    }
  }

  return rows
    .map((row) => {
      const sortedRow = row.slice().sort((a, b) => a.x - b.x);
      return {
        y: averageY(sortedRow),
        points: sortedRow,
        text: normalizeExtractedText(
          sortedRow.map((point) => point.str).join(" "),
        ),
      };
    })
    .sort((a, b) => b.y - a.y);
}

function extractTrainColumns(points: PdfTextPoint[]): PdfTrainColumn[] {
  const trainPoints = points.filter((point) =>
    TRAIN_NO_PATTERN.test(point.str),
  );
  if (trainPoints.length === 0) return [];

  const headerYs = findTrainHeaderYs(trainPoints);
  const columns: PdfTrainColumn[] = headerYs.flatMap((headerY) =>
    trainPoints
      .filter((point) => Math.abs(point.y - headerY) < 1.5)
      .sort((a, b) => a.x - b.x)
      .map((point) => ({
        trainNo: normalizeTrainNo(point.str),
        x: point.x,
        direction: point.x < 400 ? "DOWN" : "UP",
        matchDistance: 0,
      })),
  );

  return columns.map((column) => ({
    ...column,
    matchDistance: columnMatchDistance(column, columns),
  }));
}

function findTrainHeaderYs(points: PdfTextPoint[]): number[] {
  const counts = new Map<number, number>();
  for (const point of points) {
    const y = round(point.y, 1);
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1] || b[0] - a[0])
    .map(([y]) => y);
}

function extractStationAnchors(points: PdfTextPoint[]): StationAnchor[] {
  const anchors = new Map<string, StationAnchor>();
  for (const row of groupPdfTextRows(points)) {
    const stationName = findStationName(row.text);
    if (!stationName) continue;
    const key = `${stationName}:${round(row.y, 1)}`;
    if (!anchors.has(key)) {
      anchors.set(key, { stationName, y: row.y });
    }
  }

  return Array.from(anchors.values()).sort((a, b) => b.y - a.y);
}

function extractStationTimesForColumn(
  points: PdfTextPoint[],
  stationAnchors: StationAnchor[],
  column: PdfTrainColumn,
  columns: PdfTrainColumn[],
): StationDoc[] {
  const timePoints = points.filter(
    (point) =>
      extractTimesFromText(point.str).length > 0 &&
      pointBelongsToColumn(point, column, columns),
  );
  const stations: StationDoc[] = [];

  for (const anchor of stationAnchors) {
    const stationTimePoints = timePoints
      .filter((point) => Math.abs(point.y - anchor.y) <= 8)
      .sort(
        (a, b) =>
          Math.abs(a.y - anchor.y) - Math.abs(b.y - anchor.y) ||
          Math.abs(a.x - column.x) - Math.abs(b.x - column.x),
      );
    const stationTimes = uniqueStrings(
      stationTimePoints.flatMap((point) => extractTimesFromText(point.str)),
    ).slice(0, 2);
    if (stationTimes.length === 0) continue;

    stations.push({
      stationName: anchor.stationName,
      order: stationOrder(anchor.stationName),
      arrivalTime: stationTimes.sort(compareClockTime)[0],
      departureTime: stationTimes.sort(compareClockTime)[1] ?? stationTimes[0],
    });
  }

  return dedupeAndSortStations(stations);
}

function pointBelongsToColumn(
  point: PdfTextPoint,
  column: PdfTrainColumn,
  columns: PdfTrainColumn[],
): boolean {
  const nearestColumn = findNearestColumn(point.x, columns);
  return (
    nearestColumn?.trainNo === column.trainNo &&
    Math.abs(point.x - column.x) <= column.matchDistance
  );
}

function findStationName(text: string): string | undefined {
  return findStationNames(text)[0];
}

function findStationNames(text: string): string[] {
  const normalized = normalizeStationTypos(text);
  const matches = KNOWN_STATION_NAMES.map((stationName) => ({
    stationName,
    index: normalized.indexOf(stationName),
  }))
    .filter((match) => match.index >= 0)
    .sort(
      (a, b) =>
        a.index - b.index || b.stationName.length - a.stationName.length,
    )
    .map((match) => match.stationName);

  return uniqueStrings(matches);
}

function normalizeStationTypos(text: string): string {
  return normalizeExtractedText(text).replace(/站站/g, "站");
}

function stationOrder(stationName: string): number {
  const knownIndex = KNOWN_STATION_ORDER.indexOf(
    stationName as (typeof KNOWN_STATION_ORDER)[number],
  );
  if (knownIndex >= 0) return knownIndex;
  if (stationName === "高铁站停车场") return -2;
  if (stationName === "汪庄车辆段") return KNOWN_STATION_ORDER.length + 2;
  return KNOWN_STATION_ORDER.length + 1;
}

function mergeStations(base: StationDoc[], incoming: StationDoc[]): void {
  const byName = new Map(base.map((station) => [station.stationName, station]));
  for (const station of incoming) {
    const existing = byName.get(station.stationName);
    if (!existing) {
      const next = { ...station };
      base.push(next);
      byName.set(next.stationName, next);
      continue;
    }
    existing.arrivalTime = earlierTime(
      existing.arrivalTime,
      station.arrivalTime,
    );
    existing.departureTime = laterTime(
      existing.departureTime,
      station.departureTime,
    );
  }
}

function dedupeAndSortStations(stations: StationDoc[]): StationDoc[] {
  const map = new Map<string, StationDoc>();
  for (const station of stations) {
    const existing = map.get(station.stationName);
    if (!existing) {
      map.set(station.stationName, { ...station });
      continue;
    }
    existing.arrivalTime = earlierTime(
      existing.arrivalTime,
      station.arrivalTime,
    );
    existing.departureTime = laterTime(
      existing.departureTime,
      station.departureTime,
    );
  }

  return Array.from(map.values())
    .sort(compareStationSequence)
    .map((station, index) => ({
      ...station,
      order: index,
    }));
}

function inferDirectionFromStations(
  stations: StationDoc[],
): Direction | undefined {
  if (stations.length < 2) return undefined;
  const first = stations[0];
  const last = stations[stations.length - 1];
  if (!first || !last) return undefined;
  const firstOrder = stationOrder(first.stationName);
  const lastOrder = stationOrder(last.stationName);
  if (firstOrder === lastOrder) return undefined;
  return firstOrder < lastOrder ? "DOWN" : "UP";
}

function detectScheduleVersionName(fileName: string, fallback = "PDF"): string {
  const match = fileName.match(/[A-Z]\d{4}/i);
  return match ? match[0].toUpperCase() : fallback;
}

function extractTrainNos(input: string): string[] {
  const trainNos: string[] = [];
  const normalized = normalizeExtractedText(input).toUpperCase();
  let match: RegExpExecArray | null;
  TRAIN_NO_GLOBAL_PATTERN.lastIndex = 0;

  while ((match = TRAIN_NO_GLOBAL_PATTERN.exec(normalized)) !== null) {
    trainNos.push(normalizeTrainNo(match[2] ?? ""));
  }

  if (TRAIN_NO_PATTERN.test(normalized))
    trainNos.push(normalizeTrainNo(normalized));
  return uniqueStrings(trainNos.filter(Boolean));
}

function normalizeTrainNo(trainNo: string): string {
  return trainNo
    .replace(/\[[^\]]+\]/g, "")
    .trim()
    .toUpperCase();
}

function extractTimesFromText(input: string): string[] {
  const times: string[] = [];
  const normalized = input.replace(/：/g, ":");
  let match: RegExpExecArray | null;
  TIME_GLOBAL_PATTERN.lastIndex = 0;

  while ((match = TIME_GLOBAL_PATTERN.exec(normalized)) !== null) {
    const time = normalizeTime(match[0]);
    if (time) times.push(time);
  }

  return uniqueStrings(times);
}

function normalizeTime(value: string): string | undefined {
  const normalized = value.replace(/：/g, ":").trim();
  if (!TIME_PATTERN.test(normalized)) return undefined;
  const parts = normalized.split(":").map(Number);
  const hours = parts[0];
  const minutes = parts[1];
  const seconds = parts[2] ?? 0;
  if (hours === undefined || minutes === undefined) return undefined;
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function parseDirection(value: string): Direction | undefined {
  if (/上行|\bUP\b/i.test(value)) return "UP";
  if (/下行|\bDOWN\b/i.test(value)) return "DOWN";
  return undefined;
}

function normalizeExtractedText(text: string): string {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/([\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, "$1")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/站站/g, "站")
    .trim();
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function trimTrailingEmptyCells(cells: string[]): string[] {
  const next = cells.slice();
  while (next.length > 0 && (next[next.length - 1] ?? "").length === 0)
    next.pop();
  return next;
}

function uniqueStrings(items: string[]): string[] {
  return Array.from(new Set(items));
}

function findNearestColumn(
  x: number,
  columns: PdfTrainColumn[],
): PdfTrainColumn | undefined {
  return columns
    .slice()
    .sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
}

function columnMatchDistance(
  column: PdfTrainColumn,
  columns: PdfTrainColumn[],
): number {
  const nearestGap = columns
    .filter((candidate) => candidate.trainNo !== column.trainNo)
    .map((candidate) => Math.abs(candidate.x - column.x))
    .sort((a, b) => a - b)[0];
  if (nearestGap === undefined) return 14;
  return Math.max(10, Math.min(24, nearestGap * 0.45));
}

function compareStationSequence(a: StationDoc, b: StationDoc): number {
  const aTime = stationSequenceTime(a);
  const bTime = stationSequenceTime(b);
  if (aTime && bTime) {
    const diff = compareClockTime(aTime, bTime);
    if (diff !== 0) return diff;
  } else if (aTime) {
    return -1;
  } else if (bTime) {
    return 1;
  }

  return a.order - b.order || a.stationName.localeCompare(b.stationName);
}

function stationSequenceTime(station: StationDoc): string | undefined {
  if (station.arrivalTime && station.departureTime) {
    return compareClockTime(station.arrivalTime, station.departureTime) <= 0
      ? station.arrivalTime
      : station.departureTime;
  }
  return station.arrivalTime ?? station.departureTime;
}

function compareClockTime(left: string, right: string): number {
  return clockTimeToSeconds(left) - clockTimeToSeconds(right);
}

function clockTimeToSeconds(value: string): number {
  const parts = value.split(":").map(Number);
  const hours = parts[0] ?? 0;
  const minutes = parts[1] ?? 0;
  const seconds = parts[2] ?? 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function earlierTime(left?: string, right?: string): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return compareClockTime(left, right) <= 0 ? left : right;
}

function laterTime(left?: string, right?: string): string | undefined {
  if (!left) return right;
  if (!right) return left;
  return compareClockTime(left, right) >= 0 ? left : right;
}

function averageY(points: PdfTextPoint[]): number {
  if (points.length === 0) return 0;
  return points.reduce((sum, point) => sum + point.y, 0) / points.length;
}

function round(value: number, digits: number): number {
  const base = 10 ** digits;
  return Math.round(value * base) / base;
}

function isDefined<T>(value: T | undefined): value is T {
  return value !== undefined;
}

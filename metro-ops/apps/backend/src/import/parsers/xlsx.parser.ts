import type { Direction, NormalizedImportDocument } from "@metro-ops/shared";
import XLSX from "xlsx";
import type { ParserContext, SourceParser } from "./types.js";

type SheetRow = Array<string | number | null>;
type ImportTrain = NormalizedImportDocument["trains"][number];
type ImportSegment = NormalizedImportDocument["circulationSegments"][number];
type ImportDuty = NormalizedImportDocument["dutyAssignments"][number];

interface DutySheetColumns {
  routeNo: number;
  startPlace?: number | undefined;
  reportTime?: number | undefined;
  firstTrain?: number | undefined;
  firstDepartureTime?: number | undefined;
  routeChain?: number | undefined;
  endTrain?: number | undefined;
  endPlace?: number | undefined;
  endTime?: number | undefined;
  direction?: number | undefined;
  mileage?: number | undefined;
  workHours?: number | undefined;
  operatorName?: number | undefined;
}

interface ParsedDutyRow {
  shiftName: string;
  routeNo: string;
  operatorName?: string | undefined;
  startPlace?: string | undefined;
  reportTime?: string | undefined;
  firstTrain?: string | undefined;
  firstDepartureTime?: string | undefined;
  routeChain?: string | undefined;
  endTrain?: string | undefined;
  endPlace?: string | undefined;
  endTime?: string | undefined;
  direction?: Direction | undefined;
  mileage?: string | undefined;
  workHours?: string | undefined;
  trainNos: string[];
  routeId: string;
}

export class XlsxScheduleParser implements SourceParser {
  readonly name = "xlsx-daily-duty-parser";
  readonly sourceType = "XLSX" as const;

  async extract(
    buffer: Buffer,
    ctx: ParserContext,
  ): Promise<NormalizedImportDocument> {
    const warnings: string[] = [];
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const parsedRows: ParsedDutyRow[] = [];
    const rawRows: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      if (!sheet) continue;
      const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, {
        header: 1,
        defval: null,
        raw: false,
      });
      rawRows.push(...rows.map((row) => rowText(row)).filter(Boolean));
      parsedRows.push(
        ...parseDutyRows(rows, sheetName, ctx.fileName, warnings),
      );
    }

    if (workbook.SheetNames.length === 0) {
      throw new Error("xlsx: workbook has no sheets");
    }

    const dutyAssignments = buildDutyAssignments(parsedRows);
    const trains = buildTrains(parsedRows);
    const circulationSegments = buildSegments(parsedRows);

    if (dutyAssignments.length === 0) warnings.push("duty:no-duty-rows-detected");
    if (trains.length === 0) warnings.push("train:no-train-nos-detected");
    if (circulationSegments.length === 0)
      warnings.push("segment:no-route-segments-detected");

    return {
      meta: {
        sourceType: "XLSX",
        parserName: this.name,
        fileName: ctx.fileName,
        extractedAt: new Date().toISOString(),
        confidence: { trains: 0, segments: 0, duties: 0 },
        scheduleVersionName: detectScheduleVersionName(ctx.fileName),
      },
      trains,
      circulationSegments,
      dutyAssignments,
      warnings,
      rawBlocks: rawRows
        .slice(0, 80)
        .map((text) => ({ text, blockType: "TABLE" as const })),
    };
  }
}

function parseDutyRows(
  rows: SheetRow[],
  sheetName: string,
  fileName: string,
  warnings: string[],
): ParsedDutyRow[] {
  const parsed: ParsedDutyRow[] = [];
  let currentShiftName = shiftNameFromText(sheetName);
  let columns: DutySheetColumns | undefined;
  const generatedOperatorCounts = new Map<string, number>();

  for (const row of rows) {
    const text = rowText(row);
    if (!text) continue;

    const titleShiftName = shiftNameFromText(text);
    if (titleShiftName) currentShiftName = titleShiftName;

    const header = detectDutyColumns(row);
    if (header) {
      columns = header;
      continue;
    }

    if (!columns) continue;
    const routeNo = cleanCell(row[columns.routeNo]);
    if (!routeNo || !looksLikeDutyRouteNo(routeNo)) continue;

    const shiftName = shiftNameFromRouteNo(routeNo) ?? currentShiftName;
    if (!shiftName) {
      warnings.push(`duty:${routeNo}:missing-shift-name`);
      continue;
    }

    const operatorName =
      cleanCell(cellAt(row, columns.operatorName)) ??
      generatedOperatorName(shiftName, generatedOperatorCounts);
    const routeChain = cleanCell(cellAt(row, columns.routeChain));
    const firstTrain = cleanCell(cellAt(row, columns.firstTrain));
    const endTrain = cleanCell(cellAt(row, columns.endTrain));
    const trainNos = uniqueTrainNos([
      ...extractTrainNos(firstTrain),
      ...extractTrainNos(routeChain),
      ...extractTrainNos(endTrain),
    ]);

    if (trainNos.length === 0) warnings.push(`duty:${routeNo}:missing-train-nos`);

    parsed.push({
      shiftName,
      routeNo,
      operatorName,
      startPlace: cleanCell(cellAt(row, columns.startPlace)),
      reportTime: cleanCell(cellAt(row, columns.reportTime)),
      firstTrain,
      firstDepartureTime: cleanCell(cellAt(row, columns.firstDepartureTime)),
      routeChain,
      endTrain,
      endPlace: cleanCell(cellAt(row, columns.endPlace)),
      endTime: cleanCell(cellAt(row, columns.endTime)),
      direction: parseDirection(cleanCell(cellAt(row, columns.direction))),
      mileage: cleanCell(cellAt(row, columns.mileage)),
      workHours: cleanCell(cellAt(row, columns.workHours)),
      trainNos,
      routeId: buildRouteId(fileName, routeNo),
    });
  }

  return parsed;
}

function detectDutyColumns(row: SheetRow): DutySheetColumns | undefined {
  const normalized = row.map((cell) => normalizeHeader(cleanCell(cell) ?? ""));
  const routeNo = findHeaderIndex(normalized, ["交路号"]);
  const operatorName = findHeaderIndex(normalized, ["姓名"]);
  if (routeNo === undefined) return undefined;

  return {
    routeNo,
    startPlace: findHeaderIndex(normalized, ["出勤地点"]),
    reportTime: findHeaderIndex(normalized, ["出勤时间"]),
    firstTrain: findHeaderIndex(normalized, ["开行车次", "开车车次"]),
    firstDepartureTime: findHeaderIndex(normalized, ["开车时间"]),
    routeChain: findHeaderIndex(normalized, ["开行交路"]),
    endTrain: findHeaderIndex(normalized, ["退勤车次"]),
    endPlace: findHeaderIndex(normalized, ["退勤地点"]),
    endTime: findHeaderIndex(normalized, ["退勤时间"]),
    direction: findHeaderIndex(normalized, ["上下行", "上/下行", "方向"]),
    mileage: findHeaderIndex(normalized, ["公里数"]),
    workHours: findHeaderIndex(normalized, ["工时"]),
    operatorName,
  };
}

function generatedOperatorName(
  shiftName: string,
  counts: Map<string, number>,
): string {
  const next = (counts.get(shiftName) ?? 0) + 1;
  counts.set(shiftName, next);
  return `${shiftName.replace(/班$/, "")}班${String(next).padStart(2, "0")}`;
}

function isGeneratedOperatorName(name: string | undefined): boolean {
  return /^(早|白|夜)班\d{2}$/.test(name ?? "");
}

function buildDutyAssignments(rows: ParsedDutyRow[]): ImportDuty[] {
  return rows.map((row) => ({
    operatorName: row.operatorName,
    trainNo: row.trainNos[0],
    routeId: row.routeId,
    notes: compactNotes([
      `班次:${row.shiftName}`,
      `交路号:${row.routeNo}`,
      isGeneratedOperatorName(row.operatorName)
        ? "人员来源:系统生成占位"
        : undefined,
      row.startPlace ? `出勤地点:${row.startPlace}` : undefined,
      row.reportTime ? `出勤时间:${row.reportTime}` : undefined,
      row.firstTrain ? `开行车次:${row.firstTrain}` : undefined,
      row.firstDepartureTime
        ? `开车时间:${row.firstDepartureTime}`
        : undefined,
      row.routeChain ? `开行交路:${row.routeChain}` : undefined,
      row.endTrain ? `退勤车次:${row.endTrain}` : undefined,
      row.endPlace ? `退勤地点:${row.endPlace}` : undefined,
      row.endTime ? `退勤时间:${row.endTime}` : undefined,
      row.direction ? `方向:${row.direction}` : undefined,
      row.mileage ? `公里数:${row.mileage}` : undefined,
      row.workHours ? `工时:${row.workHours}` : undefined,
    ]),
  }));
}

function buildTrains(rows: ParsedDutyRow[]): ImportTrain[] {
  const trainMap = new Map<string, ImportTrain>();

  for (const row of rows) {
    for (const trainNo of row.trainNos) {
      const existing = trainMap.get(trainNo);
      if (!existing) {
        trainMap.set(trainNo, {
          trainNo,
          direction: row.direction,
          routeId: row.routeId,
          stations: [],
        });
        continue;
      }
      existing.direction = existing.direction ?? row.direction;
      existing.routeId = existing.routeId ?? row.routeId;
    }
  }

  return Array.from(trainMap.values()).sort((a, b) =>
    a.trainNo.localeCompare(b.trainNo),
  );
}

function buildSegments(rows: ParsedDutyRow[]): ImportSegment[] {
  const segmentMap = new Map<string, ImportSegment>();

  for (const row of rows) {
    if (
      row.trainNos.length === 0 &&
      !row.startPlace &&
      !row.endPlace &&
      !row.firstDepartureTime &&
      !row.endTime
    ) {
      continue;
    }

    const key = JSON.stringify([
      row.routeId,
      row.startPlace,
      row.endPlace,
      row.direction ?? "",
      row.firstDepartureTime ?? row.reportTime ?? "",
      row.endTime ?? "",
      row.trainNos.join(","),
    ]);

    if (!segmentMap.has(key)) {
      segmentMap.set(key, {
        routeId: row.routeId,
        fromStationName: row.startPlace ?? "UNKNOWN_START",
        toStationName: row.endPlace ?? "UNKNOWN_END",
        direction: row.direction,
        startTime: row.firstDepartureTime ?? row.reportTime,
        endTime: row.endTime,
        linkedTrainNos: row.trainNos,
      });
    }
  }

  return Array.from(segmentMap.values());
}

function cleanCell(
  value: string | number | null | undefined,
): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : undefined;
}

function cellAt(row: SheetRow, index: number | undefined): string | number | null {
  return index === undefined ? null : row[index] ?? null;
}

function rowText(row: SheetRow): string {
  return row.map((cell) => cleanCell(cell)).filter(Boolean).join(" | ");
}

function normalizeHeader(value: string): string {
  return value.replace(/\s+/g, "").replace(/[｜|]/g, "");
}

function findHeaderIndex(
  normalizedHeaders: string[],
  candidates: string[],
): number | undefined {
  const index = normalizedHeaders.findIndex((header) =>
    candidates.some((candidate) => header === normalizeHeader(candidate)),
  );
  return index >= 0 ? index : undefined;
}

function extractTrainNos(input: string | undefined): string[] {
  if (!input) return [];
  const matches = input.match(/\d{5}(?:\[[^\]]+\])?/g) ?? [];
  return matches.map(normalizeTrainNo);
}

function normalizeTrainNo(trainNo: string): string {
  return trainNo.replace(/\[[^\]]+\]/g, "").trim();
}

function uniqueTrainNos(trainNos: string[]): string[] {
  return Array.from(new Set(trainNos.filter((trainNo) => trainNo.length > 0)));
}

function buildRouteId(fileName: string, routeNo: string): string {
  const prefix = detectScheduleVersionName(fileName);
  return `${prefix}-${routeNo}`;
}

function detectScheduleVersionName(fileName: string): string {
  const match = fileName.match(/[GZ]\d{4}/i);
  return match ? match[0].toUpperCase() : "DAILY-DUTY";
}

function parseDirection(value: string | undefined): Direction | undefined {
  if (!value) return undefined;
  if (value.includes("上行")) return "UP";
  if (value.includes("下行")) return "DOWN";
  if (/\bUP\b/i.test(value)) return "UP";
  if (/\bDOWN\b/i.test(value)) return "DOWN";
  return undefined;
}

function compactNotes(items: Array<string | undefined>): string | undefined {
  const text = items.filter(Boolean).join("；");
  return text.length > 0 ? text : undefined;
}

function looksLikeDutyRouteNo(routeNo: string): boolean {
  return /^(早|白|夜)(?!班).+/.test(routeNo);
}

function shiftNameFromRouteNo(routeNo: string): string | undefined {
  if (routeNo.startsWith("早")) return "早班";
  if (routeNo.startsWith("白")) return "白班";
  if (routeNo.startsWith("夜")) return "夜班";
  return undefined;
}

function shiftNameFromText(text: string): string | undefined {
  if (/早班/.test(text)) return "早班";
  if (/白班/.test(text)) return "白班";
  if (/夜班/.test(text)) return "夜班";
  return undefined;
}

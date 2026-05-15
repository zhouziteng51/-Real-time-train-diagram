import type { Direction, NormalizedImportDocument } from "@metro-ops/shared";
import XLSX from "xlsx";
import type { ParserContext, SourceParser } from "./types.js";

export class XlsxScheduleParser implements SourceParser {
  readonly name = "xlsx-duty-parser";
  readonly sourceType = "XLSX" as const;

  async extract(buffer: Buffer, ctx: ParserContext): Promise<NormalizedImportDocument> {
    const warnings: string[] = [];
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new Error("xlsx: workbook has no sheets");
    }

    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error(`xlsx: sheet not found: ${sheetName}`);
    }

    const rows = XLSX.utils.sheet_to_json<Array<string | number | null>>(sheet, {
      header: 1,
      defval: null,
      raw: false,
    });

    const dutyAssignments: NormalizedImportDocument["dutyAssignments"] = [];
    const trainMap = new Map<string, NormalizedImportDocument["trains"][number]>();
    const segmentMap = new Map<string, NormalizedImportDocument["circulationSegments"][number]>();

    for (const row of rows) {
      const routeNo = cleanCell(row[1]);
      const category = cleanCell(row[2]);
      const startPlace = cleanCell(row[3]);
      const startTime = cleanCell(row[4]);
      const firstTrain = cleanCell(row[5]);
      const firstDepartureAt = cleanCell(row[6]);
      const routeChain = cleanCell(row[7]);
      const endTrain = cleanCell(row[8]);
      const endPlace = cleanCell(row[9]);
      const endTime = cleanCell(row[10]);
      const direction = parseDirection(cleanCell(row[11]));

      if (!routeNo || routeNo === "交路号" || !category) continue;
      if (!isDutyCategory(category) || !looksLikeDutyRouteNo(routeNo)) continue;

      if (!routeChain) {
        warnings.push(`duty:${routeNo}:missing-route-chain`);
      }

      const normalizedTrainNos = uniqueTrainNos([
        ...extractTrainNos(firstTrain),
        ...extractTrainNos(routeChain),
        ...extractTrainNos(endTrain),
      ]);

      dutyAssignments.push({
        operatorName: routeNo,
        trainNo: normalizedTrainNos[0],
        routeId: buildRouteId(ctx.fileName, routeNo),
        notes: compactNotes([
          `类别:${category}`,
          startPlace ? `出勤地点:${startPlace}` : undefined,
          startTime ? `出勤时间:${startTime}` : undefined,
          firstTrain ? `开行车次:${firstTrain}` : undefined,
          firstDepartureAt ? `开车时间:${firstDepartureAt}` : undefined,
          routeChain ? `开行交路:${routeChain}` : undefined,
          endTrain ? `退勤车次:${endTrain}` : undefined,
          endPlace ? `退勤地点:${endPlace}` : undefined,
          endTime ? `退勤时间:${endTime}` : undefined,
          direction ? `方向:${direction}` : undefined,
        ]),
      });

      for (const trainNo of normalizedTrainNos) {
        if (!trainMap.has(trainNo)) {
          trainMap.set(trainNo, {
            trainNo,
            direction,
            routeId: buildRouteId(ctx.fileName, routeNo),
            stations: [],
          });
        } else if (!trainMap.get(trainNo)?.direction && direction) {
          const current = trainMap.get(trainNo);
          if (current) current.direction = direction;
        }
      }

      if (normalizedTrainNos.length > 0 && (startPlace || endPlace || startTime || endTime)) {
        const segmentKey = JSON.stringify([
          buildRouteId(ctx.fileName, routeNo),
          startPlace,
          endPlace,
          direction ?? "",
          startTime,
          endTime,
          normalizedTrainNos.join(","),
        ]);

        if (!segmentMap.has(segmentKey)) {
          segmentMap.set(segmentKey, {
            routeId: buildRouteId(ctx.fileName, routeNo),
            fromStationName: startPlace ?? "UNKNOWN_START",
            toStationName: endPlace ?? "UNKNOWN_END",
            direction,
            startTime: firstDepartureAt ?? startTime ?? undefined,
            endTime: endTime ?? undefined,
            linkedTrainNos: normalizedTrainNos,
          });
        }
      }
    }

    if (dutyAssignments.length === 0) {
      warnings.push("duty:no-duty-rows-detected");
    }

    if (trainMap.size === 0) {
      warnings.push("train:no-train-nos-detected");
    }

    if (segmentMap.size === 0) {
      warnings.push("segment:no-route-segments-detected");
    }

    return {
      meta: {
        sourceType: "XLSX",
        parserName: this.name,
        fileName: ctx.fileName,
        extractedAt: new Date().toISOString(),
        confidence: { trains: 0, segments: 0, duties: 0 },
        scheduleVersionName: detectScheduleVersionName(ctx.fileName),
      },
      trains: Array.from(trainMap.values()).sort((a, b) => a.trainNo.localeCompare(b.trainNo)),
      circulationSegments: Array.from(segmentMap.values()),
      dutyAssignments,
      warnings,
      rawBlocks: rows
        .slice(0, 40)
        .map((row) => row.map((cell) => cleanCell(cell)).filter(Boolean).join(" | "))
        .filter(Boolean)
        .map((text) => ({ text, blockType: "TABLE" as const })),
    };
  }
}

function cleanCell(value: string | number | null | undefined): string | undefined {
  if (value === null || value === undefined) return undefined;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text.length > 0 ? text : undefined;
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
  const match = fileName.match(/[A-Z]\d{4}/i);
  return match ? match[0].toUpperCase() : "XLSX";
}

function parseDirection(value: string | undefined): Direction | undefined {
  if (!value) return undefined;
  if (value.includes("上行")) return "UP";
  if (value.includes("下行")) return "DOWN";
  return undefined;
}

function compactNotes(items: Array<string | undefined>): string | undefined {
  const text = items.filter(Boolean).join("；");
  return text.length > 0 ? text : undefined;
}

function isDutyCategory(category: string): boolean {
  return ["正线", "机动", "调试", "库备", "队长"].includes(category);
}

function looksLikeDutyRouteNo(routeNo: string): boolean {
  return /^(早|白|夜)/.test(routeNo);
}

import { Controller, Get, Inject, Module } from "@nestjs/common";
import { PdfOcrHybridParser } from "../import/parsers/normalize.js";
import { TripModule } from "../trip/trip.module.js";
import {
  type ActiveOperatingSchedule,
  RuntimeScheduleService,
  type LiveTrainDuty,
} from "./runtime-schedule.service.js";

interface CurrentTimeResponse {
  iso: string;
  timeZone: "Asia/Shanghai";
  localDate: string;
  localTime: string;
}

interface CurrentDutiesResponse {
  currentTime: CurrentTimeResponse;
  activeSchedule: ActiveOperatingSchedule;
  duties: LiveTrainDuty[];
  allDuties: LiveTrainDuty[];
}

@Controller("api/runtime")
export class RuntimeScheduleController {
  constructor(
    @Inject(RuntimeScheduleService)
    private readonly runtimeSchedule: RuntimeScheduleService,
  ) {}

  @Get("time")
  time(): CurrentTimeResponse {
    return currentShanghaiTime();
  }

  @Get("duties")
  duties(): CurrentDutiesResponse {
    const now = new Date();
    return {
      currentTime: currentShanghaiTime(now),
      activeSchedule: this.runtimeSchedule.getActiveOperatingSchedule(now),
      duties: this.runtimeSchedule.listLiveDuties(now),
      allDuties: this.runtimeSchedule.listAllScheduleDuties(now),
    };
  }
}

@Module({
  imports: [TripModule],
  controllers: [RuntimeScheduleController],
  providers: [RuntimeScheduleService, PdfOcrHybridParser],
  exports: [RuntimeScheduleService],
})
export class RuntimeScheduleModule {}

function currentShanghaiTime(date = new Date()): CurrentTimeResponse {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const hour = String(Number(parts.hour ?? 0) % 24).padStart(2, "0");

  return {
    iso: date.toISOString(),
    timeZone: "Asia/Shanghai",
    localDate: `${parts.year}-${parts.month}-${parts.day}`,
    localTime: `${hour}:${parts.minute}:${parts.second}`,
  };
}

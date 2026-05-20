import assert from "node:assert/strict";
import { test } from "node:test";
import XLSX from "xlsx";
import { XlsxScheduleParser } from "../xlsx.parser.js";

test("xlsx parser extracts early, day, and night roster duties", async () => {
  const header = [
    "交路号",
    "出勤地点",
    "出勤时间",
    "开行车次",
    "开车时间",
    "开行交路",
    "退勤车次",
    "退勤地点",
    "退勤时间",
    "上下行",
    "公里数",
    "工时",
    "姓名",
  ];
  const rows = [
    ["夜班"],
    header,
    [
      "夜1",
      "丽水路站",
      "15:33:36",
      "01014",
      "15:54:16",
      "01014->00424",
      "00424",
      "汪庄车辆段",
      "22:55:31",
      "上行",
      "126",
      "8",
      "赵新宇",
    ],
    ["白班"],
    header,
    [
      "白1",
      "徐州东站",
      "07:30:00",
      "00915",
      "08:00:00",
      "00915->00816",
      "00816",
      "铜山中医院站",
      "15:30:00",
      "下行",
      "120",
      "8",
      "白班测试",
    ],
    ["早班"],
    header,
    [
      "早1",
      "铜山中医院站",
      "05:20:00",
      "01115",
      "05:40:00",
      "01115->01016",
      "01016",
      "徐州东站",
      "13:30:00",
      "上行",
      "118",
      "8",
      "早班测试",
    ],
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    "早白夜",
  );
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const doc = await new XlsxScheduleParser().extract(buffer, {
    fileName: "每日排班测试.xlsx",
  });

  assert.equal(doc.dutyAssignments.length, 3);
  assert.deepEqual(
    doc.dutyAssignments.map((duty) => duty.operatorName),
    ["赵新宇", "白班测试", "早班测试"],
  );
  assert.deepEqual(
    doc.dutyAssignments.map((duty) => duty.notes?.match(/班次:([^；]+)/)?.[1]),
    ["夜班", "白班", "早班"],
  );
  assert.equal(doc.warnings.length, 0);
});

test("xlsx parser generates placeholder operators when roster has no name column", async () => {
  const rows = [
    ["早班"],
    [
      "交路号",
      "类别",
      "出勤地点",
      "出勤时间",
      "开行车次",
      "开车时间",
      "开行交路",
      "退勤车次",
      "退勤地点",
      "退勤时间",
      "上下行",
      "公里数",
      "工时",
      "备注",
    ],
    [
      "早1",
      "正线",
      "汪庄车辆段",
      "04:14:35",
      "00101",
      "04:54:35",
      "00101->00102->00303",
      "00303",
      "丽水路站",
      "08:20:49",
      "下行",
      "60",
      "8",
      "",
    ],
    ["夜班"],
    [
      "交路号",
      "类别",
      "出勤地点",
      "出勤时间",
      "开行车次",
      "开车时间",
      "开行交路",
      "退勤车次",
      "退勤地点",
      "退勤时间",
      "上下行",
      "公里数",
      "工时",
      "备注",
    ],
    [
      "夜1",
      "正线",
      "丽水路站",
      "15:39:35",
      "00314",
      "16:00:15",
      "00314->01215->00516",
      "00516",
      "汪庄车辆段",
      "22:51:00",
      "上行",
      "126",
      "8",
      "",
    ],
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet(rows),
    "交路表",
  );
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });

  const doc = await new XlsxScheduleParser().extract(buffer, {
    fileName: "G6001时刻表-早备迟下_交路信息_简.xlsx",
  });

  assert.equal(doc.dutyAssignments.length, 2);
  assert.deepEqual(
    doc.dutyAssignments.map((duty) => duty.operatorName),
    ["早班01", "夜班01"],
  );
  assert.match(doc.dutyAssignments[0]!.notes ?? "", /人员来源:系统生成占位/);
  assert.equal(doc.trains.length, 6);
  assert.equal(doc.circulationSegments.length, 2);
  assert.equal(doc.warnings.length, 0);
});

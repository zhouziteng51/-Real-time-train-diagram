import { spawn } from "node:child_process";

const restrictedAutomation = process.argv.includes("--restricted-automation");

const checks = [
  ["lint", ["pnpm", "lint"]],
  ["typecheck", ["pnpm", "typecheck"]],
  ["test", ["pnpm", restrictedAutomation ? "test:automation" : "test"]],
];

const startedAt = new Date();
console.log(`Metro Ops local daily check started at ${startedAt.toISOString()}`);
if (restrictedAutomation) {
  console.log(
    "Restricted automation mode: skipping @metro-ops/shared tests; run them on a developer machine or move them off tsx before enabling here.",
  );
}

for (const [name, command] of checks) {
  console.log(`\n== ${name} ==`);
  await run(command);
}

const finishedAt = new Date();
console.log(`\nMetro Ops local daily check passed at ${finishedAt.toISOString()}`);

function run([command, ...args]) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

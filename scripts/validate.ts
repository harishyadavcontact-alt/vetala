import { spawn } from "node:child_process";

type Step = {
  command: string;
  args: string[];
  required?: boolean;
};

function npmCommand(): string {
  return "npm";
}

async function runStep(step: Step) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(step.command, step.args, {
      stdio: "inherit",
      shell: true,
      env: process.env,
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed: ${[step.command, ...step.args].join(" ")}`));
    });
  });
}

async function main() {
  const npm = npmCommand();
  const steps: Step[] = [
    { command: npm, args: ["run", "lint"] },
    { command: npm, args: ["run", "test:unit"] },
    { command: npm, args: ["run", "build"] },
    { command: npm, args: ["run", "security"] },
    { command: npm, args: ["run", "test:e2e"] },
  ];

  for (const step of steps) {
    await runStep(step);
  }

  if (process.env.DATABASE_URL) {
    await runStep({ command: npm, args: ["run", "db:reset"] });
    await runStep({ command: npm, args: ["run", "seed"] });
    await runStep({ command: npm, args: ["run", "test:db"] });
  } else {
    console.log("Skipping Postgres integration tests because DATABASE_URL is not set.");
  }
}

void main();

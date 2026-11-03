// Read runtime secrets from an unechoed stdin line, then pass them only to the child environment.
import { spawn } from "node:child_process";
process.stdout.write("Runtime environment JSON on stdin (input hidden):\n");
if (process.stdin.isTTY) process.stdin.setRawMode(true);
let input = "";
process.stdin.on("data", (chunk) => {
  for (const ch of chunk.toString()) {
    if (ch === "\u0003") {
      process.exit(130);
    }
    if (ch === "\r" || ch === "\n") {
      if (!input) continue;
      try {
        const env = JSON.parse(input);
        input = "";
        if (process.stdin.isTTY) process.stdin.setRawMode(false);
        process.stdin.pause();
        const args = process.argv.slice(2);
        const child = spawn(process.execPath, args, {
          env: { ...process.env, ...env },
          stdio: ["ignore", "inherit", "inherit"],
          windowsHide: true,
        });
        child.on("exit", (code) => process.exit(code || 0));
        return;
      } catch {
        console.error("Invalid environment input");
        process.exit(1);
      }
    } else input += ch;
  }
});

import chalk from "chalk";

import { format } from "pretty-format";
import { TaskLogger, LogEvent, GraphLogger } from "../src/index.js";

const startTimes = new Map<string, number>();

const advancedLogger: TaskLogger = (event, key, meta = {}) => {
	const now = Date.now();
	const prefix = `[${new Date().toISOString()}]`;
	const label = event.toUpperCase().padEnd(9);
	const colored = colorize(event, label);

	if (event === "start") {
		startTimes.set(key, now);
		console.group(`${prefix} ${colored} ${key}`);

		if (meta && Object.keys(meta).length > 0) {
			console.log(
				chalk.gray("↪ Args:"),
				format(meta, { indent: 2, maxDepth: 3 }),
			);
		}

		return;
	}

	if (event === "success" || event === "fail") {
		const start = startTimes.get(key) ?? now;
		const duration = now - start;
		console.log(`${prefix} ${colored} ${key} (${formatDuration(duration)})`);

		if (meta !== undefined) {
			logResult(meta);
		}

		console.groupEnd();
		startTimes.delete(key);
		return;
	}

	if (event === "skipped") {
		console.log(`${prefix} ${colored} ${key} (skipped)`, meta);
		return;
	}

	if (event === "finish") {
		const prefix = `[${new Date().toISOString()}]`;
		const colored = chalk.bgMagenta.white.bold(" FINISH  ");
		console.group(`${prefix} ${colored} ${key}`);

		if (meta?.status) {
			console.log(chalk.bold("Statuses:"));
			for (const [task, st] of Object.entries(meta.status)) {
				const stColored =
					st === "success"
						? chalk.green(st)
						: st === "failed"
							? chalk.red(st)
							: st === "skipped"
								? chalk.gray(st)
								: chalk.yellow(st);
				console.log(`  ${task}: ${stColored}`);
			}
		}

		if (meta?.results) {
			console.log(chalk.bold("\nResults:"));
			logResult(meta.results);
		}

		if (meta?.output !== undefined) {
			console.log(chalk.bold("\nOutput:"));
			logResult(meta.output);
		}

		console.groupEnd();
		return;
	}

	if (
		event === "data" ||
		event === "background" ||
		event === "parallel" ||
		event === "deferred"
	) {
		console.log(`${prefix} ${colored} ${key}`, meta);
	}
};

// Color mapping utility
function colorize(event: LogEvent, label: string): string {
	switch (event) {
		case "start":
			return chalk.cyan(label);
		case "finish":
			return chalk.magentaBright(label);
		case "success":
			return chalk.green(label);
		case "fail":
			return chalk.red(label);
		case "skipped":
			return chalk.gray(label);
		case "data":
			return chalk.magenta(label);
		case "background":
			return chalk.blue(label);
		case "parallel":
			return chalk.yellow(label);
		case "deferred":
			return chalk.dim(label);
		default:
			return label;
	}
}

// Fancy duration formatter
function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const sec = (ms / 1000).toFixed(2);
	return `${sec}s`;
}

// Clean, safe result logging
function logResult(result: unknown) {
	try {
		const output = format(result, {
			indent: 2,
			min: false,
			maxDepth: 6,
			callToJSON: false,
			printFunctionName: false,
		});

		console.log(chalk.gray("↪ Result:"), output);
	} catch (err) {
		console.warn(chalk.red("! Failed to format result:"), err);
		console.dir(result); // fallback
	}
}

export const useLogger = () => {
	return advancedLogger;
};

export const graphLoggerFromTaskLogger =
	(taskLogger: TaskLogger): GraphLogger =>
	(event, node, meta) => {
		switch (event) {
			case "node_start":
				taskLogger("start", node, meta?.input);
				break;

			case "node_success":
				taskLogger("success", node, meta?.output);
				break;

			case "node_fail":
				taskLogger("fail", node, meta?.error);
				break;

			case "node_skip":
				taskLogger("skipped", node, meta);
				break;

			case "node_background":
				taskLogger("background", node, meta);
				break;

			case "graph_finish":
				taskLogger("finish", node, meta);
				break;
		}
	};

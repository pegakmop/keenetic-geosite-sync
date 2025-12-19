import https from "node:https";
import type { DomainListFetchContext, DomainListRule, DomainLoadResult, RuleKind } from "./types";

// Простая загрузка текста по HTTPS с таймаутом и user-agent.
function httpGetText(url: string, timeoutMs: number): Promise<string> {
	return new Promise((resolve, reject) => {
		const req = https.get(
			url,
			{
				timeout: timeoutMs,
				headers: { "user-agent": "keenetic-geosite-sync/1.0" },
			},
			(res) => {
				if (res.statusCode && res.statusCode >= 400) {
					res.resume();
					reject(new Error(`HTTP ${res.statusCode} for ${url}`));
					return;
				}

				let body = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					body += chunk;
				});
				res.on("end", () => resolve(body));
			},
		);

		req.on("timeout", () => req.destroy(new Error(`timeout after ${timeoutMs}ms for ${url}`)));
		req.on("error", reject);
	});
}

// Убираем комментарии после # и пробелы по краям строки.
function stripComment(line: string): string {
	const hashIndex = line.indexOf("#");
	return (hashIndex >= 0 ? line.slice(0, hashIndex) : line).trim();
}

// Отбрасываем атрибуты вида @attr, оставляя саму директиву.
function dropAttributes(tokens: string[]): string[] {
	return tokens.filter((token, index) => index === 0 || !token.startsWith("@"));
}

// Парсим строку списка в структуру DomainListRule.
function parseRule(tokens: string[]): DomainListRule | null {
	const [head, next] = tokens;

	if (head.startsWith("include:")) {
		const value = head.slice("include:".length) || next;
		return value ? { kind: "include", value } : null;
	}

	if (head === "include" && next) {
		return { kind: "include", value: next };
	}

	const colonIndex = head.indexOf(":");
	if (colonIndex > 0) {
		const kind = head.slice(0, colonIndex) as RuleKind;
		const value = head.slice(colonIndex + 1) || next;

		if (["domain", "full", "keyword", "regexp"].includes(kind) && value) {
			return { kind, value: value.toLowerCase() };
		}
	}

	return head ? { kind: "domain", value: head.toLowerCase() } : null;
}

// Разбираем текст doman-list в набор правил.
export function parseDomainList(text: string): DomainListRule[] {
	return text
		.replace(/^\uFEFF/, "")
		.split(/\r?\n/)
		.map(stripComment)
		.filter(Boolean)
		.map((line) => dropAttributes(line.split(/\s+/)))
		.map(parseRule)
		.filter((rule): rule is DomainListRule => Boolean(rule));
}

// Загружаем правила конкретного списка с ретраями.
async function loadRules(key: string, ctx: DomainListFetchContext): Promise<DomainListRule[]> {
	const url = ctx.baseUrl + encodeURIComponent(key);
	const fetch = ctx.fetchFn ?? httpGetText;

	let lastError: unknown;

	for (let attempt = 1; attempt <= ctx.retries; attempt++) {
		try {
			const text = await fetch(url, ctx.timeoutMs);
			return parseDomainList(text);
		} catch (err) {
			lastError = err;
			if (attempt === ctx.retries) break;

			const delay = Math.min(3000, attempt * 500);
			await new Promise((r) => setTimeout(r, delay));
		}
	}

	const message = lastError instanceof Error ? lastError.message : String(lastError);

	throw new Error(`failed to fetch ${url}: ${message}`);
}

// Собираем домены, раскрывая include-правила и накапливая статистику.
export async function collectDomains(
	key: string,
	ctx: DomainListFetchContext,
	stack: string[] = [],
): Promise<DomainLoadResult> {
	if (stack.includes(key)) {
		throw new Error(`include cycle: ${[...stack, key].join(" -> ")}`);
	}

	const rules = await loadRules(key, ctx);

	const result: DomainLoadResult = {
		domains: new Set<string>(),
		skipped: { keyword: 0, regexp: 0 },
		includes: 0,
		total: rules.length,
	};

	for (const rule of rules) {
		if (rule.kind === "include") {
			result.includes++;

			const child = await collectDomains(rule.value, ctx, [...stack, key]);

			child.domains.forEach((d) => {
				result.domains.add(d);
			});
			result.skipped.keyword += child.skipped.keyword;
			result.skipped.regexp += child.skipped.regexp;
			result.includes += child.includes;
			result.total += child.total;

			continue;
		}

		if (rule.kind === "keyword") {
			result.skipped.keyword++;
			continue;
		}

		if (rule.kind === "regexp") {
			result.skipped.regexp++;
			continue;
		}

		result.domains.add(rule.value);
	}

	return result;
}

// Удобный конструктор контекста загрузки списков.
export function createFetchContext(
	baseUrl: string,
	timeoutMs: number,
	retries: number,
	fetchFn?: DomainListFetchContext["fetchFn"],
): DomainListFetchContext {
	return { baseUrl, timeoutMs, retries, fetchFn };
}

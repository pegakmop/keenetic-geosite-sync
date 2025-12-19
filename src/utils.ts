import fs from "node:fs";

// Проверяем, что значение — непустой объект без массивов.
export function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Читаем JSON с диска с запасным значением при ошибке.
export function readJson<T>(filePath: string, fallback: T): T {
	try {
		const content = fs.readFileSync(filePath, "utf8");
		return JSON.parse(content) as T;
	} catch {
		return fallback;
	}
}

// Нормализуем базовый URL, гарантируя слеш в конце.
export function normalizeBaseUrl(url: string): string {
	if (!url) return "/";
	return url.endsWith("/") ? url : `${url}/`;
}

// Разбиваем массив на чанки фиксированного размера.
export function chunk<T>(items: readonly T[], size: number): T[][] {
	if (!Number.isInteger(size) || size <= 0) {
		throw new Error(`chunk size must be a positive integer, got ${size}`);
	}

	const result: T[][] = [];

	for (let i = 0; i < items.length; i += size) {
		result.push(items.slice(i, i + size));
	}

	return result;
}

// Генерируем имена групп для разбиения списка доменов.
export function desiredGroupNames(baseName: string, chunksCount: number): string[] {
	if (chunksCount <= 1) return [baseName];

	return Array.from({ length: chunksCount }, (_, index) =>
		index === 0 ? baseName : `${baseName}-${index + 1}`,
	);
}

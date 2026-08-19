import type { IncomingHttpHeaders } from "node:http";

const GENERIC_ANDROID_MODELS = new Set(["k", "wv", "mobile"]);

function firstHeader(headers: IncomingHttpHeaders, name: string): string {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0]?.trim() ?? "";
  return typeof value === "string" ? value.trim() : "";
}

function unquote(value: string): string {
  return value.replace(/^"+|"+$/g, "").trim();
}

function parseSecChUaBrand(secChUa: string): string | null {
  if (!secChUa) return null;
  const brands = [...secChUa.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  const named = brands.find(
    (brand) =>
      brand &&
      !/not[_ .]?a[_ .]?brand/i.test(brand) &&
      brand.toLowerCase() !== "chromium",
  );
  if (named) return named.replace(/^Google\s+/i, "");
  return brands.find((brand) => brand.toLowerCase() === "chromium") ?? null;
}

function browserFromUa(ua: string): string | null {
  if (/Edg\//i.test(ua) || /EdgiOS\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\/|FxiOS\//i.test(ua)) return "Firefox";
  if (/CriOS\//i.test(ua) || /Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && /Version\//i.test(ua)) return "Safari";
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua)) return "Safari";
  return null;
}

function osFromUa(ua: string): string | null {
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) {
    const modelMatch = ua.match(
      /Android [^;]*; ([^);]+)(?:\s+Build\/|;|\))/i,
    );
    const model = modelMatch?.[1]?.trim();
    if (model && !GENERIC_ANDROID_MODELS.has(model.toLowerCase())) {
      return model;
    }
    return "Android";
  }
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return null;
}

function composeName(parts: Array<string | null | undefined>): string | null {
  const cleaned = parts
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part));
  if (cleaned.length === 0) return null;
  if (cleaned.length === 1) return cleaned[0].slice(0, 80);
  if (cleaned[0] === cleaned[1]) return cleaned[0].slice(0, 80);
  return `${cleaned[0]} on ${cleaned[1]}`.slice(0, 80);
}

export function deviceNameFromHeaders(
  headers: IncomingHttpHeaders,
): string | null {
  const model = unquote(
    firstHeader(headers, "sec-ch-ua-model") ||
      firstHeader(headers, "x-device-model"),
  );
  const platform = unquote(
    firstHeader(headers, "sec-ch-ua-platform") ||
      firstHeader(headers, "x-device-platform"),
  );
  const brand =
    parseSecChUaBrand(firstHeader(headers, "sec-ch-ua")) ||
    firstHeader(headers, "x-device-browser") ||
    null;
  const ua = firstHeader(headers, "user-agent");
  const browser = brand ?? browserFromUa(ua);
  const device = model || osFromUa(ua) || platform || null;
  return composeName([browser, device]);
}

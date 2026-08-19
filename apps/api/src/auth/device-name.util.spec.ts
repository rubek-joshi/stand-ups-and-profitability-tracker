import { deviceNameFromHeaders } from "./device-name.util";

describe("deviceNameFromHeaders", () => {
  it("uses client hints when present", () => {
    expect(
      deviceNameFromHeaders({
        "sec-ch-ua":
          '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        "sec-ch-ua-platform": '"Windows"',
        "sec-ch-ua-model": '""',
      }),
    ).toBe("Chrome on Windows");
  });

  it("prefers a device model from client hints", () => {
    expect(
      deviceNameFromHeaders({
        "sec-ch-ua": '"Google Chrome";v="131"',
        "sec-ch-ua-platform": '"Android"',
        "sec-ch-ua-model": '"Pixel 8"',
      }),
    ).toBe("Chrome on Pixel 8");
  });

  it("parses a desktop Chrome user-agent", () => {
    expect(
      deviceNameFromHeaders({
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      }),
    ).toBe("Chrome on Windows");
  });

  it("parses Safari on iPhone", () => {
    expect(
      deviceNameFromHeaders({
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      }),
    ).toBe("Safari on iPhone");
  });

  it("parses an Android device model from the user-agent", () => {
    expect(
      deviceNameFromHeaders({
        "user-agent":
          "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
      }),
    ).toBe("Chrome on Pixel 8");
  });

  it("uses custom device hint headers", () => {
    expect(
      deviceNameFromHeaders({
        "x-device-browser": "Chrome",
        "x-device-platform": "macOS",
        "x-device-model": "",
      }),
    ).toBe("Chrome on macOS");
  });

  it("returns null when headers are missing", () => {
    expect(deviceNameFromHeaders({})).toBeNull();
  });
});

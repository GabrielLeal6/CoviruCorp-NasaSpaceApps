const API_BASE_URL =
  globalThis.LUNARNAV_API_BASE_URL ??
  (typeof window === "undefined" ? "http://localhost:8000" : window.location.origin);

export class ApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function requestApi(path, options = {}) {
  let response;
  try {
    response = await fetch(new URL(path, API_BASE_URL), {
      ...options,
      headers: {
        Accept: "application/json",
        ...options.headers,
      },
    });
  } catch (error) {
    throw new Error(
      `Could not connect to the Lunar Navigator API at ${API_BASE_URL}.`,
      { cause: error },
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  let payload;
  if (contentType.includes("application/json")) {
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(
        `The Lunar Navigator API returned invalid JSON (HTTP ${response.status}).`,
        { cause: error },
      );
    }
  } else {
    payload = await response.text();
  }

  if (!response.ok) {
    const apiError = payload?.error;
    const validationDetail = payload?.detail;
    const message =
      apiError?.message ??
      (typeof validationDetail === "string"
        ? validationDetail
        : validationDetail
          ? JSON.stringify(validationDetail)
          : typeof payload === "string" && payload
            ? payload
            : `The API request failed with HTTP ${response.status}.`);

    throw new ApiError(message, {
      status: response.status,
      code: apiError?.code,
      details: apiError?.details ?? validationDetail,
    });
  }

  if (!contentType.includes("application/json")) {
    throw new Error(
      `The Lunar Navigator API returned a non-JSON response (HTTP ${response.status}).`,
    );
  }

  return payload;
}

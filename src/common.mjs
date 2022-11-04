import {setTimeout} from "timers/promises";
import https from "https";

export async function retry(taskFunc, maxRetries, retryDelayMS = 1000) {
    while (true) {
        try {
            return await taskFunc();
        } catch (e) {
            if (maxRetries <= 0) {
                throw e;
            }
        }

        maxRetries--;
        await setTimeout(retryDelayMS);
    }
}

export class HTTPError extends Error {
    constructor(resultCode, resultBody) {
        super();

        this.resultCode = resultCode;
        this.resultBody = resultBody;
    }
}

function httpsReq(url, options = {}) {
    return new Promise((resolve, reject) => {
        options = options || {};

        const
            req = https.request(
                url,
                {
                    ...options,
                    // Avoid re-using connections since they might have dropped while Lambda was sleeping
                    agent: false,
                    headers: {
                        ...(options.headers || {}),
                        ...(options.form ? options.form.getHeaders() : {}),
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; rv:102.0) Gecko/20100101 Firefox/102.0'
                    }
                },
                res => {
                    const
                        chunks = [];

                    res.on('data', data => chunks.push(data));

                    res.on('end', () => {
                        try {
                            let
                                resultBody = Buffer.concat(chunks);

                            switch (res.headers['content-type']) {
                                case 'application/json':
                                    resultBody = JSON.parse(resultBody.toString("utf8"));
                                    break;
                                case 'image/webp':
                                case 'image/jpeg':
                                case 'image/png':
                                    // Avoid converting to string
                                    break;
                                default:
                                    resultBody = resultBody.toString("utf8");
                            }

                            if (res.statusCode === 200) {
                                resolve(resultBody);
                            } else {
                                reject(new HTTPError(res.statusCode, resultBody))
                            }
                        } catch (e) {
                            reject(e);
                        }
                    })
                }
            );

        req.on('error', reject);

        if (options.body) {
            req.write(options.body);
        }

        if (options.form) {
            options.form.pipe(req);
        } else {
            req.end();
        }
    })
}

/**
 *
 * @param {string} url
 * @param {FormData} form
 * @param options
 * @returns {Promise<unknown>}
 */
export function httpsPostForm(url, {form, ...options}) {
    return httpsReq(url, {form, method: "POST", ...options});
}

export function httpsGet(url, options) {
    return httpsReq(url, {method: "GET", ...options});
}

export function isValidBearerHeader(header) {
    return /^Bearer sk-[a-zA-Z0-9_=-]+$/.test(header);
}

export function isValidImageSize(value) {
    return ["256x256", "512x512", "1024x1024"].indexOf(value) > -1;
}

export function isValidImageCount(value) {
    return value === (value | 0) && value >= 1 && value <= 10;
}
